import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import {
  getAuthCookieNames,
  getCsrfCookieOptions,
  getOpaqueSessionToken,
  getRequestCookie,
} from "../auth/cookies";
import type { SessionAudience } from "../auth/opaqueSessions";
import {
  getRequestId,
  isAllowedRequestOrigin,
} from "./httpSecurity";

export const CSRF_HEADER_NAME = "X-LFMS-CSRF";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type CsrfProtectionOptions = {
  audience: SessionAudience;
  secret: string;
  allowedOrigins: ReadonlySet<string>;
};

function assertSecret(secret: string) {
  if (secret.length < 32) {
    throw new Error("OAUTH_STATE_SECRET must contain at least 32 characters");
  }
}

function signToken(
  audience: SessionAudience,
  sessionToken: string | undefined,
  nonce: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update("csrf-v1")
    .update("\0")
    .update(audience)
    .update("\0")
    .update(sessionToken ?? "anonymous")
    .update("\0")
    .update(nonce)
    .digest("base64url");
}

export function createCsrfToken(
  audience: SessionAudience,
  sessionToken: string | undefined,
  secret: string,
) {
  assertSecret(secret);
  const nonce = randomBytes(24).toString("base64url");
  return `v1.${nonce}.${signToken(audience, sessionToken, nonce, secret)}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyCsrfToken(
  token: string | null | undefined,
  audience: SessionAudience,
  sessionToken: string | undefined,
  secret: string,
) {
  assertSecret(secret);
  if (!token || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, nonce, signature] = parts;
  if (!nonce || !signature) return false;
  const expected = signToken(audience, sessionToken, nonce, secret);
  return safeEqual(signature, expected);
}

export function setCsrfCookie(
  req: Request,
  res: Response,
  options: Pick<CsrfProtectionOptions, "audience" | "secret">,
  sessionTokenOverride?: string,
) {
  const sessionToken = sessionTokenOverride ?? getOpaqueSessionToken(req, options.audience);
  const token = createCsrfToken(
    options.audience,
    sessionToken,
    options.secret,
  );
  const maximumAge = options.audience === "tenant"
    ? 7 * 24 * 60 * 60 * 1_000
    : 8 * 60 * 60 * 1_000;
  res.cookie(
    getAuthCookieNames(req, options.audience).csrf,
    token,
    getCsrfCookieOptions(req, maximumAge),
  );
  return token;
}

export function csrfProtectionMiddleware(
  options: CsrfProtectionOptions,
): RequestHandler {
  assertSecret(options.secret);

  return (req, res, next) => {
    const names = getAuthCookieNames(req, options.audience);
    const sessionToken = getOpaqueSessionToken(req, options.audience);
    const cookieToken = getRequestCookie(req, names.csrf);

    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      if (
        !verifyCsrfToken(
          cookieToken,
          options.audience,
          sessionToken,
          options.secret,
        )
      ) {
        setCsrfCookie(req, res, options);
      }
      next();
      return;
    }

    const headerToken = req.get(CSRF_HEADER_NAME);
    const valid =
      isAllowedRequestOrigin(req, options.allowedOrigins) &&
      Boolean(headerToken && cookieToken && safeEqual(headerToken, cookieToken)) &&
      verifyCsrfToken(
        headerToken,
        options.audience,
        sessionToken,
        options.secret,
      );

    if (!valid) {
      res.status(403).json({
        error: "Invalid CSRF token or request origin",
        requestId: getRequestId(res),
      });
      return;
    }
    next();
  };
}
