import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request, Response } from "express";
import type { SessionAudience } from "./opaqueSessions";
import { ENV } from "../env";

const COOKIE_NAMES = {
  tenant: {
    secureSession: "__Host-lfms_tenant",
    localSession: "lfms_tenant_session",
    secureCsrf: "__Host-lfms_tenant_csrf",
    localCsrf: "lfms_tenant_csrf",
  },
  platform: {
    secureSession: "__Host-lfms_platform",
    localSession: "lfms_platform_session",
    secureCsrf: "__Host-lfms_platform_csrf",
    localCsrf: "lfms_platform_csrf",
  },
} as const;

export const LEGACY_SESSION_COOKIE_NAME = "app_session_id";

export function isSecureRequest(req: Request) {
  return ENV.isProduction || req.secure === true || req.protocol === "https";
}

export function getAuthCookieNames(
  req: Request,
  audience: SessionAudience,
) {
  const names = COOKIE_NAMES[audience];
  return isSecureRequest(req)
    ? { session: names.secureSession, csrf: names.secureCsrf }
    : { session: names.localSession, csrf: names.localCsrf };
}

export function getOpaqueSessionCookieOptions(
  req: Request,
  maxAge?: number,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
  if (maxAge !== undefined) options.maxAge = maxAge;
  return options;
}

export function getCsrfCookieOptions(req: Request, maxAge?: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
  if (maxAge !== undefined) options.maxAge = maxAge;
  return options;
}

export function getRequestCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookieHeader(header)[name];
}

export function getOpaqueSessionToken(
  req: Request,
  audience: SessionAudience,
) {
  return getRequestCookie(req, getAuthCookieNames(req, audience).session);
}

export function setOpaqueSessionCookie(
  req: Request,
  res: Response,
  audience: SessionAudience,
  token: string,
  expiresAt: Date,
) {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(
    getAuthCookieNames(req, audience).session,
    token,
    getOpaqueSessionCookieOptions(req, maxAge),
  );
}

export function clearAuthCookies(
  req: Request,
  res: Response,
  audience: SessionAudience,
) {
  const names = getAuthCookieNames(req, audience);
  res.clearCookie(names.session, getOpaqueSessionCookieOptions(req));
  res.clearCookie(names.csrf, getCsrfCookieOptions(req));
}
