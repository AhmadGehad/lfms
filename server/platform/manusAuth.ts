/**
 * Platform admin authentication via Manus OAuth.
 *
 * Replaces the external OIDC workforce flow. After a successful Manus OAuth
 * callback the server checks whether the authenticated user is listed in
 * `platformAdministrators` with status = "active". Only those users receive a
 * platform session cookie; everyone else gets a 403.
 *
 * Route surface: admin.<BASE_DOMAIN>  (/api/platform/auth/*)
 */
import type { CookieOptions, Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { platformAdministrators, securityEvents, users } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  getRequestCookie,
  isSecureRequest,
  setOpaqueSessionCookie,
} from "../_core/auth/cookies";
import {
  createOAuthStateManager,
  getOAuthStateSecret,
  getPlatformSessionManager,
  getRateLimitStore,
} from "../_core/auth/runtime";
import { ENV } from "../_core/env";
import { setCsrfCookie } from "../_core/security/csrf";
import { getRequestId, getRequestOrigin } from "../_core/security/httpSecurity";
import { getSafeDevLoginNext, isLocalDevAuthBypassAllowed } from "../_core/devAuth";
import {
  createRateLimitMiddleware,
  getClientAddress,
} from "../_core/security/rateLimit";
import { sdk } from "../_core/sdk";
import { generatePublicId } from "../tenancy/publicIds";
import { logger } from "../observability/logger";

// ── Cookie helpers ────────────────────────────────────────────────────────────

function bindingCookieName(req: Request) {
  return isSecureRequest(req)
    ? "__Host-lfms_platform_oauth"
    : "lfms_platform_oauth";
}

function bindingCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: 10 * 60 * 1_000,
  };
}

function query(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// ── Audit helper ─────────────────────────────────────────────────────────────

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

// ── Administrator lookup ──────────────────────────────────────────────────────

async function findAdministratorByOpenId(openId: string) {
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
    })
    .from(users)
    .innerJoin(platformAdministrators, eq(platformAdministrators.userId, users.id))
    .where(and(eq(users.openId, openId), eq(users.status, "active")))
    .limit(1);
  return row ?? null;
}

// ── Local dev bypass ──────────────────────────────────────────────────────────

function localDevRequestAllowed(req: Request) {
  const forwarded = [
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
  ].some(header => req.get(header) !== undefined);
  return isLocalDevAuthBypassAllowed(req.hostname, req.socket.remoteAddress, { forwarded });
}

async function startLocalDevelopmentSession(req: Request, res: Response) {
  if (!localDevRequestAllowed(req)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "Platform authentication is unavailable" });
    return;
  }
  const openId = ENV.ownerOpenId || "local-dev-owner";
  const [administrator] = await db
    .select({
      id: platformAdministrators.id,
      authVersion: platformAdministrators.authVersion,
      userId: users.id,
    })
    .from(platformAdministrators)
    .innerJoin(users, eq(platformAdministrators.userId, users.id))
    .where(
      and(
        eq(users.openId, openId),
        eq(users.status, "active"),
        eq(platformAdministrators.status, "active"),
      ),
    )
    .limit(1);
  if (!administrator) {
    res.status(503).json({ error: "Local platform administrator is not bootstrapped" });
    return;
  }
  const session = await getPlatformSessionManager().issue({
    subjectId: administrator.id,
    authVersion: administrator.authVersion,
    authLevel: "mfa",
    authenticationMethods: ["local-dev"],
    mfaVerifiedAt: new Date(),
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });
  setOpaqueSessionCookie(req, res, "platform", session.token, session.absoluteExpiresAt);
  setCsrfCookie(req, res, { audience: "platform", secret: getOAuthStateSecret() }, session.token);
  await auditLogin(req, res, {
    platformAdministratorId: administrator.id,
    userId: administrator.userId,
    outcome: "success",
    reason: "local_development_login",
  });
  res.redirect(302, getSafeDevLoginNext(query(req, "returnTo")));
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerPlatformManusAuthRoutes(app: Express) {
  const startLimit = createRateLimitMiddleware({
    namespace: "platform-manus-start",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 20,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });
  const callbackLimit = createRateLimitMiddleware({
    namespace: "platform-manus-callback",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 40,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });

  // ── Start: redirect to Manus OAuth ─────────────────────────────────────────
  const start = async (req: Request, res: Response) => {
    if (localDevRequestAllowed(req)) {
      await startLocalDevelopmentSession(req, res);
      return;
    }
    try {
      if (!ENV.oAuthPortalUrl || !ENV.appId) {
        res.status(503).json({ error: "Platform authentication is not configured" });
        return;
      }
      const origin = getRequestOrigin(req);
      if (!origin) {
        res.status(400).json({ error: "Invalid request host" });
        return;
      }
      const redirectUri = `${origin}/api/platform/auth/callback`;
      const manager = createOAuthStateManager(new Set([redirectUri]));
      const issued = await manager.issue({
        audience: "platform",
        redirectUri,
        returnTo: query(req, "returnTo"),
      });
      res.cookie(bindingCookieName(req), issued.browserBinding, bindingCookieOptions(req));

      const portal = new URL(
        "app-auth",
        `${ENV.oAuthPortalUrl.replace(/\/+$/, "")}/`,
      );
      portal.searchParams.set("appId", ENV.appId);
      portal.searchParams.set("redirectUri", redirectUri);
      portal.searchParams.set("state", issued.state);
      portal.searchParams.set("type", "signIn");
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, portal.toString());
    } catch (err) {
      logger.error("platform.manus_auth_start_failed", { err });
      await auditLogin(req, res, { outcome: "error", reason: "manus_auth_start_failed" });
      res.status(503).json({ error: "Platform authentication is unavailable" });
    }
  };

  app.get("/api/platform/auth/login", startLimit, start);
  app.get("/api/platform/auth/start", startLimit, start);

  // ── Callback: exchange code, verify admin, issue platform session ───────────
  app.get("/api/platform/auth/callback", callbackLimit, async (req: Request, res: Response) => {
    const code = query(req, "code");
    const state = query(req, "state");
    if (!code || !state) {
      await auditLogin(req, res, { outcome: "denied", reason: "invalid_callback" });
      res.status(400).json({ error: "Invalid or expired authentication attempt" });
      return;
    }
    try {
      const origin = getRequestOrigin(req);
      if (!origin) {
        res.status(400).json({ error: "Invalid request host" });
        return;
      }
      const redirectUri = `${origin}/api/platform/auth/callback`;
      const manager = createOAuthStateManager(new Set([redirectUri]));
      const stored = await manager.consume({
        state,
        browserBinding: getRequestCookie(req, bindingCookieName(req)),
        audience: "platform",
      });
      res.clearCookie(bindingCookieName(req), bindingCookieOptions(req));
      if (!stored || stored.redirectUri !== redirectUri) {
        await auditLogin(req, res, { outcome: "denied", reason: "invalid_state" });
        res.status(400).json({ error: "Invalid or expired authentication attempt" });
        return;
      }

      // Exchange code for Manus user info
      const tokenResponse = await sdk.exchangeCodeForToken(code, redirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        await auditLogin(req, res, { outcome: "denied", reason: "missing_open_id" });
        res.status(400).json({ error: "openId missing from Manus user info" });
        return;
      }

      // Check if this Manus user is an active platform administrator
      const administrator = await findAdministratorByOpenId(userInfo.openId);
      if (
        !administrator ||
        administrator.administratorStatus !== "active" ||
        administrator.userStatus !== "active"
      ) {
        await auditLogin(req, res, { outcome: "denied", reason: "administrator_not_authorized" });
        res.status(403).json({ error: "Platform access denied. Your account is not authorized as a platform administrator." });
        return;
      }

      // Issue platform session
      const session = await getPlatformSessionManager().issue({
        subjectId: administrator.administratorId,
        authVersion: administrator.authVersion,
        authLevel: "primary",
        authenticationMethods: ["manus"],
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
        reason: "manus_oauth",
      });
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, stored.returnTo);
    } catch (err) {
      logger.error("platform.manus_auth_callback_failed", { err });
      await auditLogin(req, res, { outcome: "error", reason: "manus_auth_callback_failed" });
      res.status(403).json({ error: "Platform authentication failed" });
    }
  });
}
