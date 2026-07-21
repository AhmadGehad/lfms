/**
 * Platform admin authentication via self-hosted email + password.
 *
 * Mirrors manusAuth.ts's authorization model: after verifying credentials the
 * server checks whether the user is listed in `platformAdministrators` with
 * status = "active". Only those users receive a platform session cookie.
 *
 * Route surface: admin.<BASE_DOMAIN>  (/api/platform/auth/*)
 */
import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { passwordCredentials, platformAdministrators, securityEvents, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { setOpaqueSessionCookie } from "../_core/auth/cookies";
import {
  getOAuthStateSecret,
  getPlatformSessionManager,
  getRateLimitStore,
} from "../_core/auth/runtime";
import { hashPassword, verifyPassword } from "../_core/auth/password";
import { setCsrfCookie } from "../_core/security/csrf";
import { getRequestId } from "../_core/security/httpSecurity";
import {
  createRateLimitMiddleware,
  getClientAddress,
} from "../_core/security/rateLimit";
import { generatePublicId } from "../tenancy/publicIds";
import { logger } from "../observability/logger";

const GENERIC_LOGIN_ERROR = "Invalid email or password";
const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1_000;

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function auditLogin(
  req: Request,
  res: Response,
  input: {
    platformAdministratorId?: number;
    userId?: number;
    outcome: "success" | "denied" | "error";
    reason: string;
  },
) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(securityEvents).values({
      publicId: generatePublicId(),
      actorType: input.platformAdministratorId ? "platform_admin" : "anonymous",
      platformAdministratorId: input.platformAdministratorId ?? null,
      userId: input.userId ?? null,
      eventType: "platform.authentication",
      severity: input.outcome === "success" ? "info" : "warning",
      outcome: input.outcome,
      requestId: getRequestId(res),
      ipAddress: (req.ip || req.socket.remoteAddress || "").slice(0, 45) || null,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      metadata: { reason: input.reason },
    });
  } catch (err) {
    logger.error("platform.audit_login_failed", { err });
  }
}

async function findAdministratorByEmail(normalizedEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db
    .select({
      administratorId: platformAdministrators.id,
      administratorStatus: platformAdministrators.status,
      authVersion: platformAdministrators.authVersion,
      mfaRequired: platformAdministrators.mfaRequired,
      userId: users.id,
      userStatus: users.status,
      userFailedAttempts: users.failedLoginAttempts,
      userLockedUntil: users.lockedUntil,
      passwordHash: passwordCredentials.passwordHash,
      passwordNeedsRehash: passwordCredentials.passwordNeedsRehash,
    })
    .from(users)
    .innerJoin(platformAdministrators, eq(platformAdministrators.userId, users.id))
    .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
    .where(and(eq(users.normalizedEmail, normalizedEmail), eq(users.status, "active")))
    .limit(1);
  return row ?? null;
}

export function registerPlatformPasswordAuthRoutes(app: Express) {
  const loginLimit = createRateLimitMiddleware({
    namespace: "platform-password-login",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 20,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });

  app.post("/api/platform/auth/login", loginLimit, async (req: Request, res: Response) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!normalizedEmail || !password) {
        await auditLogin(req, res, { outcome: "denied", reason: "missing_credentials" });
        res.status(400).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      const administrator = await findAdministratorByEmail(normalizedEmail);
      if (!administrator) {
        await auditLogin(req, res, { outcome: "denied", reason: "administrator_not_found" });
        res.status(401).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      if (administrator.userLockedUntil && administrator.userLockedUntil.getTime() > Date.now()) {
        await auditLogin(req, res, {
          userId: administrator.userId,
          outcome: "denied",
          reason: "account_locked",
        });
        res.status(403).json({ error: "Account temporarily locked. Try again later." });
        return;
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const valid = await verifyPassword(administrator.passwordHash, password);
      if (!valid) {
        const failedAttempts = administrator.userFailedAttempts + 1;
        const lockedUntil = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MS)
          : null;
        await db.update(users).set({
          failedLoginAttempts: failedAttempts,
          lockedUntil,
        }).where(eq(users.id, administrator.userId));
        await auditLogin(req, res, {
          userId: administrator.userId,
          outcome: "denied",
          reason: "invalid_password",
        });
        res.status(401).json({ error: GENERIC_LOGIN_ERROR });
        return;
      }
      if (administrator.administratorStatus !== "active" || administrator.userStatus !== "active") {
        await auditLogin(req, res, {
          userId: administrator.userId,
          outcome: "denied",
          reason: "administrator_not_authorized",
        });
        res.status(403).json({ error: "Platform access denied. Your account is not authorized as a platform administrator." });
        return;
      }
      if (administrator.mfaRequired) {
        await auditLogin(req, res, {
          platformAdministratorId: administrator.administratorId,
          userId: administrator.userId,
          outcome: "denied",
          reason: "workforce_mfa_required",
        });
        res.status(403).json({
          error: "This administrator requires the workforce MFA login provider",
        });
        return;
      }
      if (administrator.userFailedAttempts > 0 || administrator.userLockedUntil) {
        await db.update(users).set({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }).where(eq(users.id, administrator.userId));
      }
      if (administrator.passwordNeedsRehash) {
        const rehashed = await hashPassword(password);
        await db.update(passwordCredentials).set({
          passwordHash: rehashed,
          passwordNeedsRehash: false,
          passwordChangedAt: new Date(),
        }).where(eq(passwordCredentials.userId, administrator.userId));
      }
      const session = await getPlatformSessionManager().issue({
        subjectId: administrator.administratorId,
        authVersion: administrator.authVersion,
        authLevel: "primary",
        authenticationMethods: ["password"],
        mfaVerifiedAt: null,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      setOpaqueSessionCookie(req, res, "platform", session.token, session.absoluteExpiresAt);
      setCsrfCookie(
        req,
        res,
        { audience: "platform", secret: getOAuthStateSecret() },
        session.token,
      );
      await auditLogin(req, res, {
        platformAdministratorId: administrator.administratorId,
        userId: administrator.userId,
        outcome: "success",
        reason: "password",
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ success: true });
    } catch (err) {
      logger.error("platform.password_auth_login_failed", { err });
      await auditLogin(req, res, { outcome: "error", reason: "password_auth_login_failed" });
      res.status(500).json({ error: "Platform authentication failed" });
    }
  });
}
