import type { Express, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  authenticationTokens,
  passwordCredentials,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  getOAuthStateSecret,
  getRateLimitStore,
  getTenantSessionManager,
} from "./auth/runtime";
import { recordOAuthIdentity } from "./auth/sqlStores";
import { setOpaqueSessionCookie } from "./auth/cookies";
import { hashPassword, isPasswordStrongEnough, verifyPassword } from "./auth/password";
import { hashResetToken, issuePasswordResetToken } from "./auth/passwordReset";
import { isEmailConfigured, sendEmail } from "./email";
import { setCsrfCookie } from "./security/csrf";
import { getRequestOrigin, getResolvedRequestHost } from "./security/httpSecurity";
import { getCompanySessionIdleTimeoutMs } from "../tenancy/companySettings";
import {
  createRateLimitMiddleware,
  getClientAddress,
} from "./security/rateLimit";
import { logger } from "../observability/logger";

const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1_000;
const GENERIC_LOGIN_ERROR = "Invalid email or password";
const GENERIC_RESET_MESSAGE = "If that email has an account, a password reset link has been sent.";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function driverBinary(value: Buffer) {
  return value as unknown as string;
}

async function requireDb() {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  return database;
}

async function findActiveUserByEmail(normalizedEmail: string) {
  const database = await requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(and(eq(users.normalizedEmail, normalizedEmail), eq(users.status, "active")))
    .limit(1);
  return user ?? null;
}

async function issueTenantSessionForUser(
  req: Request,
  res: Response,
  user: typeof users.$inferSelect,
) {
  await recordOAuthIdentity({
    userId: user.id,
    provider: "password",
    providerSubject: user.normalizedEmail ?? String(user.id),
    providerEmail: user.email,
    providerEmailVerified: true,
  });
  const host = getResolvedRequestHost(res);
  const idleTimeoutMs = host?.surface === "tenant" && host.companySlug
    ? await getCompanySessionIdleTimeoutMs(host.companySlug) ?? undefined
    : undefined;
  const session = await getTenantSessionManager().issue({
    subjectId: user.id,
    authVersion: user.authVersion,
    authLevel: "primary",
    authenticationMethods: ["password"],
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    idleTimeoutMs,
  });
  setOpaqueSessionCookie(req, res, "tenant", session.token, session.absoluteExpiresAt);
  setCsrfCookie(req, res, { audience: "tenant", secret: getOAuthStateSecret() }, session.token);
}

export function registerPasswordAuthRoutes(app: Express) {
  const loginLimit = createRateLimitMiddleware({
    namespace: "tenant-password-login",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 20,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });
  const forgotLimit = createRateLimitMiddleware({
    namespace: "tenant-forgot-password",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 10,
    windowMs: 15 * 60 * 1_000,
    key: getClientAddress,
  });
  const resetLimit = createRateLimitMiddleware({
    namespace: "tenant-reset-password",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 20,
    windowMs: 15 * 60 * 1_000,
    key: getClientAddress,
  });

  app.post("/api/auth/login", loginLimit, async (req: Request, res: Response) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!normalizedEmail || !password) {
        res.status(400).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      const user = await findActiveUserByEmail(normalizedEmail);
      if (!user) {
        res.status(401).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        res.status(403).json({ error: "Account temporarily locked. Try again later." });
        return;
      }
      const database = await requireDb();
      const [credential] = await database
        .select()
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, user.id))
        .limit(1);
      if (!credential) {
        res.status(401).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      const valid = await verifyPassword(credential.passwordHash, password);
      if (!valid) {
        const failedAttempts = user.failedLoginAttempts + 1;
        const lockedUntil = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MS)
          : null;
        await database.update(users).set({
          failedLoginAttempts: failedAttempts,
          lockedUntil,
        }).where(eq(users.id, user.id));
        res.status(401).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await database.update(users).set({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }).where(eq(users.id, user.id));
      }
      if (credential.passwordNeedsRehash) {
        const rehashed = await hashPassword(password);
        await database.update(passwordCredentials).set({
          passwordHash: rehashed,
          passwordNeedsRehash: false,
          passwordChangedAt: new Date(),
        }).where(eq(passwordCredentials.userId, user.id));
      }
      await issueTenantSessionForUser(req, res, user);
      await database.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("auth.tenant_password_login_failed", { error });
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/forgot-password", forgotLimit, async (req: Request, res: Response) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);
      if (!normalizedEmail) {
        res.status(200).json({ message: GENERIC_RESET_MESSAGE });
        return;
      }
      const user = await findActiveUserByEmail(normalizedEmail);
      if (user) {
        const token = await issuePasswordResetToken(user.id, normalizedEmail);
        const origin = getRequestOrigin(req);
        const resetLink = `${origin ?? ""}/reset-password?token=${encodeURIComponent(token)}`;
        if (isEmailConfigured()) {
          await sendEmail({
            to: normalizedEmail,
            subject: "Reset your LFMS password",
            text: `Set a new password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
          });
        } else {
          logger.info("auth.password_reset_requested", {
            userId: user.id,
            resetToken: token,
          });
        }
      }
      res.status(200).json({ message: GENERIC_RESET_MESSAGE });
    } catch (error) {
      logger.error("auth.forgot_password_failed", { error });
      res.status(200).json({ message: GENERIC_RESET_MESSAGE });
    }
  });

  app.post("/api/auth/reset-password", resetLimit, async (req: Request, res: Response) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!token || !isPasswordStrongEnough(password)) {
        res.status(400).json({ error: "Invalid token or password does not meet requirements" });
        return;
      }
      const database = await requireDb();
      const tokenHash = hashResetToken(token);
      const outcome = await database.transaction(async tx => {
        const [record] = await tx.select({
          id: authenticationTokens.id,
          userId: authenticationTokens.userId,
        }).from(authenticationTokens).where(and(
          eq(authenticationTokens.tokenHash, driverBinary(tokenHash)),
          eq(authenticationTokens.purpose, "reset_password"),
          isNull(authenticationTokens.usedAt),
          gt(authenticationTokens.expiresAt, new Date()),
        )).limit(1).for("update");
        if (!record) return null;
        await tx.update(authenticationTokens).set({ usedAt: new Date() })
          .where(eq(authenticationTokens.id, record.id));
        const [user] = await tx.select().from(users)
          .where(and(eq(users.id, record.userId), eq(users.status, "active")))
          .limit(1).for("update");
        if (!user) return null;
        const newHash = await hashPassword(password);
        const [existingCredential] = await tx.select({ userId: passwordCredentials.userId })
          .from(passwordCredentials).where(eq(passwordCredentials.userId, user.id)).limit(1);
        if (existingCredential) {
          await tx.update(passwordCredentials).set({
            passwordHash: newHash,
            passwordChangedAt: new Date(),
            passwordNeedsRehash: false,
          }).where(eq(passwordCredentials.userId, user.id));
        } else {
          await tx.insert(passwordCredentials).values({
            userId: user.id,
            passwordHash: newHash,
          });
        }
        await tx.update(users).set({
          authVersion: user.authVersion + 1,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastPasswordChange: new Date(),
        }).where(eq(users.id, user.id));
        return { ...user, authVersion: user.authVersion + 1 };
      });
      if (!outcome) {
        res.status(400).json({ error: "Invalid or expired reset token" });
        return;
      }
      await issueTenantSessionForUser(req, res, outcome);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("auth.reset_password_failed", { error });
      res.status(500).json({ error: "Password reset failed" });
    }
  });
}

export { issueTenantSessionForUser };
