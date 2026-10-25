import type { Express, Request, Response } from "express";
import * as db from "../db";
import { setOpaqueSessionCookie } from "./auth/cookies";
import {
  getOAuthStateSecret,
  getTenantSessionManager,
} from "./auth/runtime";
import { recordOAuthIdentity } from "./auth/sqlStores";
import { getSafeDevLoginNext, isLocalDevAuthBypassAllowed } from "./devAuth";
import { ENV } from "./env";
import { setCsrfCookie } from "./security/csrf";
import { logger } from "../observability/logger";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// Local development sign-in. Production sign-in is email/password
// (see passwordAuth.ts); the former Manus OAuth routes were removed.
export function registerDevLoginRoute(app: Express) {
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
}
