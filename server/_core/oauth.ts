import type { CookieOptions, Express, Request, Response } from "express";
import * as db from "../db";
import {
  getRequestCookie,
  isSecureRequest,
  setOpaqueSessionCookie,
} from "./auth/cookies";
import {
  createOAuthStateManager,
  getOAuthStateSecret,
  getRateLimitStore,
  getTenantSessionManager,
} from "./auth/runtime";
import { recordOAuthIdentity } from "./auth/sqlStores";
import { getSafeDevLoginNext, isLocalDevAuthBypassAllowed } from "./devAuth";
import { ENV } from "./env";
import { setCsrfCookie } from "./security/csrf";
import { getRequestOrigin } from "./security/httpSecurity";
import {
  createRateLimitMiddleware,
  getClientAddress,
} from "./security/rateLimit";
import { sdk } from "./sdk";
import { logger } from "../observability/logger";

const OAUTH_BINDING_COOKIE = {
  secure: "__Host-lfms_oauth_attempt",
  local: "lfms_oauth_attempt",
} as const;

function getOAuthBindingCookieName(req: Request) {
  return isSecureRequest(req)
    ? OAUTH_BINDING_COOKIE.secure
    : OAUTH_BINDING_COOKIE.local;
}

function getOAuthBindingCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: 10 * 60 * 1_000,
  };
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function hasVerifiedEmailClaim(userInfo: { email?: string | null }) {
  const claims = userInfo as typeof userInfo & {
    emailVerified?: unknown;
    email_verified?: unknown;
  };
  return Boolean(userInfo.email) && (
    claims.emailVerified === true || claims.email_verified === true
  );
}

export function registerOAuthRoutes(app: Express) {
  const startRateLimit = createRateLimitMiddleware({
    namespace: "tenant-oauth-start",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 30,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });
  const callbackRateLimit = createRateLimitMiddleware({
    namespace: "tenant-oauth-callback",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 60,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });

  app.get("/api/dev/login", async (req: Request, res: Response) => {
    const forwarded = [
      "forwarded",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-proto",
    ].some(header => req.get(header) !== undefined);
    if (!isLocalDevAuthBypassAllowed(req.hostname, req.socket.remoteAddress, {
      forwarded,
    })) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const openId = getQueryParam(req, "openId")?.trim().slice(0, 64)
      || ENV.ownerOpenId
      || "local-dev-owner";
    const name = getQueryParam(req, "name")?.trim().slice(0, 500) || "Local Developer";
    const email = getQueryParam(req, "email")?.trim().toLowerCase().slice(0, 320) || "local@lfms.dev";

    try {
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "local-dev",
        role: ENV.ownerOpenId ? undefined : "admin",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) throw new Error("Local development user was not created");
      await recordOAuthIdentity({
        userId: user.id,
        provider: "manus",
        providerSubject: openId,
        providerEmail: email,
        providerEmailVerified: true,
      });
      const session = await getTenantSessionManager().issue({
        subjectId: user.id,
        authVersion: user.authVersion,
        authLevel: "mfa",
        authenticationMethods: ["local-dev"],
        mfaVerifiedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      setOpaqueSessionCookie(
        req,
        res,
        "tenant",
        session.token,
        session.absoluteExpiresAt,
      );
      setCsrfCookie(
        req,
        res,
        { audience: "tenant", secret: getOAuthStateSecret() },
        session.token,
      );
      res.redirect(302, getSafeDevLoginNext(req.query.next));
    } catch (error) {
      logger.error("auth.local_dev_login_failed", { error });
      res.status(500).json({ error: "Local dev login failed" });
    }
  });

  app.get(
    "/api/oauth/start",
    startRateLimit,
    async (req: Request, res: Response) => {
      try {
        if (!ENV.oAuthPortalUrl || !ENV.appId) {
          res.status(503).json({ error: "OAuth is not configured" });
          return;
        }
        const origin = getRequestOrigin(req);
        if (!origin) {
          res.status(400).json({ error: "Invalid request host" });
          return;
        }
        const redirectUri = `${origin}/api/oauth/callback`;
        const manager = createOAuthStateManager(new Set([redirectUri]));
        const attempt = await manager.issue({
          audience: "tenant",
          redirectUri,
          returnTo: getQueryParam(req, "returnTo"),
        });
        res.cookie(
          getOAuthBindingCookieName(req),
          attempt.browserBinding,
          getOAuthBindingCookieOptions(req),
        );

        const portal = new URL(
          "app-auth",
          `${ENV.oAuthPortalUrl.replace(/\/+$/, "")}/`,
        );
        portal.searchParams.set("appId", ENV.appId);
        portal.searchParams.set("redirectUri", redirectUri);
        portal.searchParams.set("state", attempt.state);
        portal.searchParams.set("type", "signIn");
        res.setHeader("Cache-Control", "no-store");
        res.redirect(302, portal.toString());
      } catch (error) {
        logger.error("auth.tenant_oauth_start_failed", { error });
        res.status(500).json({ error: "OAuth login could not be started" });
      }
    },
  );

  app.get("/api/oauth/callback", callbackRateLimit, async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const origin = getRequestOrigin(req);
      if (!origin) {
        res.status(400).json({ error: "Invalid request host" });
        return;
      }
      const redirectUri = `${origin}/api/oauth/callback`;
      const manager = createOAuthStateManager(new Set([redirectUri]));
      const attempt = await manager.consume({
        state,
        browserBinding: getRequestCookie(req, getOAuthBindingCookieName(req)),
        audience: "tenant",
      });
      res.clearCookie(
        getOAuthBindingCookieName(req),
        getOAuthBindingCookieOptions(req),
      );
      if (!attempt || attempt.redirectUri !== redirectUri) {
        res.status(400).json({ error: "Invalid or expired OAuth state" });
        return;
      }

      const tokenResponse = await sdk.exchangeCodeForToken(code, attempt.redirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });
      const user = await db.getUserByOpenId(userInfo.openId);
      if (!user || user.status !== "active") {
        res.status(403).json({ error: "Account is not active" });
        return;
      }
      await recordOAuthIdentity({
        userId: user.id,
        provider: "manus",
        providerSubject: userInfo.openId,
        providerEmail: userInfo.email ?? null,
        // Do not treat a bare email claim as verified. The provider must send
        // an explicit verification claim before it can unlock an invite.
        providerEmailVerified: hasVerifiedEmailClaim(userInfo),
      });

      const session = await getTenantSessionManager().issue({
        subjectId: user.id,
        authVersion: user.authVersion,
        authLevel: "primary",
        authenticationMethods: ["manus"],
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      setOpaqueSessionCookie(
        req,
        res,
        "tenant",
        session.token,
        session.absoluteExpiresAt,
      );
      setCsrfCookie(
        req,
        res,
        { audience: "tenant", secret: getOAuthStateSecret() },
        session.token,
      );
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, attempt.returnTo);
    } catch (error) {
      logger.error("auth.tenant_oauth_callback_failed", { error });
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
