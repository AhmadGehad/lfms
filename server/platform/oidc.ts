import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { CookieOptions, Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  platformAdministrators,
  platformIdentities,
  securityEvents,
  users,
} from "../../drizzle/schema";
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
import { getRequestId } from "../_core/security/httpSecurity";
import { getSafeDevLoginNext, isLocalDevAuthBypassAllowed } from "../_core/devAuth";
import {
  createRateLimitMiddleware,
  getClientAddress,
} from "../_core/security/rateLimit";
import { generatePublicId } from "../tenancy/publicIds";
import { normalizePlatformOidcIssuer, platformOidcProviderCode } from "./identity";

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type BrowserAttempt = {
  binding: string;
  verifier: string;
  nonce: string;
  issuedAt: number;
};

const ATTEMPT_MAX_AGE_MS = 10 * 60 * 1_000;
const EXPLICIT_MFA_METHODS = new Set(["mfa", "hwk", "webauthn", "fido"]);
const OTP_METHODS = new Set(["otp", "totp"]);
const DISCOVERY_TIMEOUT_MS = 5_000;
let discoveryPromise: Promise<OidcDiscovery> | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function normalizeIssuer(value: string) {
  return normalizePlatformOidcIssuer(value, ENV.isProduction);
}

function validateEndpoint(value: string, label: string, issuer: string) {
  const url = new URL(value);
  if (ENV.isProduction && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }
  if (url.username || url.password) throw new Error(`Invalid ${label}`);
  if (url.origin !== new URL(issuer).origin) {
    throw new Error(`${label} must use the configured issuer origin`);
  }
  return url.toString();
}

async function getDiscovery() {
  discoveryPromise ??= (async () => {
    const issuer = normalizeIssuer(ENV.adminOidcIssuer);
    const endpoint = `${issuer}/.well-known/openid-configuration`;
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Workforce identity discovery failed");
    const document = await response.json() as Partial<OidcDiscovery>;
    if (
      normalizeIssuer(String(document.issuer ?? "")) !== issuer ||
      !document.authorization_endpoint ||
      !document.token_endpoint ||
      !document.jwks_uri
    ) {
      throw new Error("Invalid workforce identity discovery document");
    }
    return {
      issuer,
      authorization_endpoint: validateEndpoint(document.authorization_endpoint, "OIDC authorization endpoint", issuer),
      token_endpoint: validateEndpoint(document.token_endpoint, "OIDC token endpoint", issuer),
      jwks_uri: validateEndpoint(document.jwks_uri, "OIDC JWKS endpoint", issuer),
    };
  })().catch(error => {
    discoveryPromise = null;
    throw error;
  });
  return discoveryPromise;
}

function providerCode() {
  return platformOidcProviderCode(ENV.adminOidcIssuer, ENV.isProduction);
}

function attemptCookieName(req: Request) {
  return isSecureRequest(req)
    ? "__Host-lfms_platform_oidc"
    : "lfms_platform_oidc";
}

function attemptCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: ATTEMPT_MAX_AGE_MS,
  };
}

function signAttempt(encoded: string) {
  return createHmac("sha256", getOAuthStateSecret())
    .update("platform-oidc-attempt-v1")
    .update("\0")
    .update(encoded)
    .digest("base64url");
}

function encodeAttempt(value: BrowserAttempt) {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `v1.${encoded}.${signAttempt(encoded)}`;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeAttempt(value: string | undefined): BrowserAttempt | null {
  if (!value || value.length > 2_500) return null;
  const [version, encoded, signature, extra] = value.split(".");
  if (version !== "v1" || !encoded || !signature || extra) return null;
  if (!constantTimeEqual(signature, signAttempt(encoded))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<BrowserAttempt>;
    if (
      typeof parsed.binding !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      Date.now() - parsed.issuedAt > ATTEMPT_MAX_AGE_MS ||
      parsed.issuedAt > Date.now() + 30_000
    ) return null;
    return parsed as BrowserAttempt;
  } catch {
    return null;
  }
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function authenticationLevel(claims: JWTPayload) {
  const methods = Array.isArray(claims.amr)
    ? claims.amr.filter((value): value is string => typeof value === "string")
    : [];
  const acr = typeof claims.acr === "string" ? claims.acr : null;
  const normalizedMethods = methods.map(method => method.toLowerCase());
  const explicitMfa = normalizedMethods.some(method => EXPLICIT_MFA_METHODS.has(method));
  const combinedOtp = normalizedMethods.some(method => OTP_METHODS.has(method)) &&
    normalizedMethods.some(method => !OTP_METHODS.has(method));
  const mfa = explicitMfa || combinedOtp ||
    Boolean(acr && ENV.adminOidcMfaAcrValues.includes(acr));
  return {
    level: mfa ? "mfa" as const : "primary" as const,
    methods: ["workforce_oidc", ...methods.map(method => `oidc:${method.slice(0, 40)}`)],
  };
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
}

async function findAdministrator(subject: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select({
    identityId: platformIdentities.id,
    administratorId: platformAdministrators.id,
    administratorStatus: platformAdministrators.status,
    authVersion: platformAdministrators.authVersion,
    mfaRequired: platformAdministrators.mfaRequired,
    userId: users.id,
    userStatus: users.status,
  })
    .from(platformIdentities)
    .innerJoin(
      platformAdministrators,
      eq(platformIdentities.platformAdministratorId, platformAdministrators.id),
    )
    .innerJoin(users, eq(platformAdministrators.userId, users.id))
    .where(and(
      eq(platformIdentities.provider, providerCode()),
      eq(platformIdentities.providerSubject, subject),
    ))
    .limit(1);
  return row ?? null;
}

function query(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : null;
}

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
  const [administrator] = await db.select({
    id: platformAdministrators.id,
    authVersion: platformAdministrators.authVersion,
    userId: users.id,
    userAuthVersion: users.authVersion,
  })
    .from(platformAdministrators)
    .innerJoin(users, eq(platformAdministrators.userId, users.id))
    .where(and(
      eq(users.openId, openId),
      eq(users.status, "active"),
      eq(platformAdministrators.status, "active"),
    ))
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

export function registerPlatformOidcRoutes(app: Express) {
  const startLimit = createRateLimitMiddleware({
    namespace: "platform-oidc-start",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 20,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });
  const callbackLimit = createRateLimitMiddleware({
    namespace: "platform-oidc-callback",
    secret: getOAuthStateSecret(),
    store: getRateLimitStore(),
    maximumRequests: 40,
    windowMs: 10 * 60 * 1_000,
    key: getClientAddress,
  });

  const start = async (req: Request, res: Response) => {
    if (localDevRequestAllowed(req)) {
      await startLocalDevelopmentSession(req, res);
      return;
    }
    try {
      if (
        !ENV.adminOidcIssuer ||
        !ENV.adminOidcClientId ||
        !ENV.adminOidcRedirectUri
      ) {
        res.status(503).json({ error: "Platform authentication is not configured" });
        return;
      }
      const discovery = await getDiscovery();
      const manager = createOAuthStateManager(new Set([ENV.adminOidcRedirectUri]));
      const issued = await manager.issue({
        audience: "platform",
        redirectUri: ENV.adminOidcRedirectUri,
        returnTo: query(req, "returnTo"),
      });
      const verifier = randomBytes(48).toString("base64url");
      const nonce = randomBytes(32).toString("base64url");
      res.cookie(attemptCookieName(req), encodeAttempt({
        binding: issued.browserBinding,
        verifier,
        nonce,
        issuedAt: Date.now(),
      }), attemptCookieOptions(req));

      const authorize = new URL(discovery.authorization_endpoint);
      authorize.searchParams.set("client_id", ENV.adminOidcClientId);
      authorize.searchParams.set("redirect_uri", ENV.adminOidcRedirectUri);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", "openid email profile");
      authorize.searchParams.set("state", issued.state);
      authorize.searchParams.set("nonce", nonce);
      authorize.searchParams.set("code_challenge", pkceChallenge(verifier));
      authorize.searchParams.set("code_challenge_method", "S256");
      authorize.searchParams.set("prompt", "select_account");
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, authorize.toString());
    } catch {
      await auditLogin(req, res, { outcome: "error", reason: "oidc_start_failed" });
      res.status(503).json({ error: "Platform authentication is unavailable" });
    }
  };

  app.get("/api/platform/auth/login", startLimit, start);
  app.get("/api/platform/auth/start", startLimit, start);
  app.get("/api/platform/auth/callback", callbackLimit, async (req, res) => {
    const code = query(req, "code");
    const state = query(req, "state");
    const attempt = decodeAttempt(getRequestCookie(req, attemptCookieName(req)));
    res.clearCookie(attemptCookieName(req), attemptCookieOptions(req));
    if (!code || !state || !attempt) {
      await auditLogin(req, res, { outcome: "denied", reason: "invalid_callback" });
      res.status(400).json({ error: "Invalid or expired authentication attempt" });
      return;
    }

    try {
      const manager = createOAuthStateManager(new Set([ENV.adminOidcRedirectUri]));
      const stored = await manager.consume({
        state,
        browserBinding: attempt.binding,
        audience: "platform",
      });
      if (!stored || stored.redirectUri !== ENV.adminOidcRedirectUri) {
        await auditLogin(req, res, { outcome: "denied", reason: "invalid_state" });
        res.status(400).json({ error: "Invalid or expired authentication attempt" });
        return;
      }

      const discovery = await getDiscovery();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: ENV.adminOidcRedirectUri,
        client_id: ENV.adminOidcClientId,
        code_verifier: attempt.verifier,
      });
      const basic = Buffer.from(`${encodeURIComponent(ENV.adminOidcClientId)}:${encodeURIComponent(ENV.adminOidcClientSecret)}`).toString("base64");
      const tokenResponse = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      if (!tokenResponse.ok) throw new Error("OIDC token exchange failed");
      const tokens = await tokenResponse.json() as { id_token?: unknown };
      if (typeof tokens.id_token !== "string") throw new Error("OIDC ID token missing");
      jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri));
      const verified = await jwtVerify(tokens.id_token, jwks, {
        issuer: discovery.issuer,
        audience: ENV.adminOidcClientId,
        algorithms: ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
      });
      if (verified.payload.nonce !== attempt.nonce || typeof verified.payload.sub !== "string") {
        throw new Error("OIDC token binding failed");
      }

      const administrator = await findAdministrator(verified.payload.sub);
      if (
        !administrator ||
        administrator.administratorStatus !== "active" ||
        administrator.userStatus !== "active"
      ) {
        await auditLogin(req, res, { outcome: "denied", reason: "administrator_not_authorized" });
        res.status(403).json({ error: "Platform access denied" });
        return;
      }
      const auth = authenticationLevel(verified.payload);
      if (administrator.mfaRequired && auth.level !== "mfa") {
        await auditLogin(req, res, {
          platformAdministratorId: administrator.administratorId,
          userId: administrator.userId,
          outcome: "denied",
          reason: "mfa_required",
        });
        res.status(403).json({ error: "MFA verification required" });
        return;
      }

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(platformIdentities).set({
        providerEmail: typeof verified.payload.email === "string"
          ? verified.payload.email.slice(0, 320)
          : null,
        providerEmailVerified: verified.payload.email_verified === true,
        lastUsedAt: new Date(),
      }).where(eq(platformIdentities.id, administrator.identityId));

      const session = await getPlatformSessionManager().issue({
        subjectId: administrator.administratorId,
        authVersion: administrator.authVersion,
        authLevel: auth.level,
        authenticationMethods: auth.methods,
        mfaVerifiedAt: auth.level === "mfa" ? new Date() : null,
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
        reason: "workforce_oidc",
      });
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, stored.returnTo);
    } catch {
      await auditLogin(req, res, { outcome: "error", reason: "oidc_callback_failed" });
      res.status(403).json({ error: "Platform authentication failed" });
    }
  });
}

export const platformOidcInternals = {
  encodeAttempt,
  decodeAttempt,
  pkceChallenge,
  authenticationLevel,
  validateEndpoint,
};
