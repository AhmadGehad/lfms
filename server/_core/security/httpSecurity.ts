import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  buildContentSecurityPolicyValue,
  type ContentSecurityPolicyOptions,
} from "@shared/contentSecurityPolicy";

export type RequestSurface = "tenant" | "platform";

export type ResolvedRequestHost = {
  hostname: string;
  surface: RequestSurface;
  companySlug: string | null;
};

export type HostValidationOptions = {
  baseDomain: string;
  allowLegacyBareDomain?: boolean;
  allowDevelopmentPorts?: boolean;
  /** Extra hostnames (without protocol) that are treated as tenant surface.
   *  Use this to allow the Manus internal domain (e.g. livestockms-boywmbm5.manus.space)
   *  when BASE_DOMAIN is a custom domain like l-fms.com. */
  additionalTenantHostnames?: string[];
};

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function normalizeHostname(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function normalizeBaseDomain(value: string) {
  const normalized = normalizeHostname(value);
  if (!normalized || normalized.includes(":")) {
    throw new Error("BASE_DOMAIN must be a hostname without protocol or port");
  }
  return normalized;
}

export function resolveRequestHost(
  hostname: string,
  options: HostValidationOptions
): ResolvedRequestHost | null {
  const baseDomain = normalizeBaseDomain(options.baseDomain);
  const normalized = normalizeHostname(hostname);

  if (normalized === `admin.${baseDomain}`) {
    return { hostname: normalized, surface: "platform", companySlug: null };
  }
  if (normalized === baseDomain && options.allowLegacyBareDomain) {
    return { hostname: normalized, surface: "tenant", companySlug: null };
  }
  if (
    baseDomain === "localhost" &&
    options.allowLegacyBareDomain &&
    normalized === "127.0.0.1"
  ) {
    return { hostname: normalized, surface: "tenant", companySlug: null };
  }

  // Allow explicitly configured additional tenant hostnames (e.g. Manus internal domain)
  if (options.additionalTenantHostnames) {
    for (const extra of options.additionalTenantHostnames) {
      if (normalizeHostname(extra) === normalized) {
        return { hostname: normalized, surface: "tenant", companySlug: null };
      }
    }
  }

  const suffix = `.${baseDomain}`;
  if (!normalized.endsWith(suffix)) return null;
  const companySlug = normalized.slice(0, -suffix.length);
  if (
    !HOST_LABEL.test(companySlug) ||
    companySlug === "admin" ||
    companySlug === "auth"
  ) {
    return null;
  }

  return { hostname: normalized, surface: "tenant", companySlug };
}

export function requestIdMiddleware(
  options: { trustEdgeHeader?: boolean } = {}
): RequestHandler {
  return (req, res, next) => {
    const edgeRequestId = options.trustEdgeHeader
      ? req.get("x-lfms-edge-request-id")
      : undefined;
    const requestId =
      edgeRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(edgeRequestId)
        ? edgeRequestId
        : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  };
}

export function getRequestId(res: Response) {
  const requestId = res.locals.requestId;
  return typeof requestId === "string" ? requestId : randomUUID();
}

export function buildContentSecurityPolicy(
  options?: Omit<ContentSecurityPolicyOptions, "isProduction"> & {
    isProduction?: boolean;
  }
) {
  const isProduction =
    options?.isProduction ?? process.env.NODE_ENV === "production";
  return buildContentSecurityPolicyValue({
    isProduction,
    analyticsEndpoint:
      options?.analyticsEndpoint ?? process.env.VITE_ANALYTICS_ENDPOINT,
    scriptOrigins: options?.scriptOrigins,
    connectOrigins: options?.connectOrigins,
    imageOrigins: options?.imageOrigins,
    mediaOrigins: options?.mediaOrigins,
  });
}

export function securityHeadersMiddleware(options?: {
  isProduction?: boolean;
  analyticsEndpoint?: string;
  scriptOrigins?: readonly string[];
  connectOrigins?: readonly string[];
  imageOrigins?: readonly string[];
  mediaOrigins?: readonly string[];
}): RequestHandler {
  const isProduction =
    options?.isProduction ?? process.env.NODE_ENV === "production";
  return (_req, res, next) => {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), geolocation=(self), microphone=(self), payment=(), usb=()"
    );
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      buildContentSecurityPolicy({
        isProduction,
        analyticsEndpoint: options?.analyticsEndpoint,
        scriptOrigins: options?.scriptOrigins,
        connectOrigins: options?.connectOrigins,
        imageOrigins: options?.imageOrigins,
        mediaOrigins: options?.mediaOrigins,
      })
    );
    if (isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }
    next();
  };
}

export function hostValidationMiddleware(
  options: HostValidationOptions
): RequestHandler {
  normalizeBaseDomain(options.baseDomain);
  return (req, res, next) => {
    let resolved: ResolvedRequestHost | null = null;
    try {
      const rawHost = req.get("host");
      if (!rawHost || /[\s/@\\]/.test(rawHost)) {
        res
          .status(421)
          .json({ error: "Misdirected request", requestId: getRequestId(res) });
        return;
      }
      const parsedHost = new URL(`http://${rawHost}`);
      const forwardedHost = req.get("x-forwarded-host");
      if (forwardedHost) {
        if (forwardedHost.includes(",")) {
          res.status(421).json({
            error: "Misdirected request",
            requestId: getRequestId(res),
          });
          return;
        }
        const parsedForwardedHost = new URL(`http://${forwardedHost}`);
        if (
          normalizeHostname(parsedForwardedHost.hostname) !==
          normalizeHostname(parsedHost.hostname)
        ) {
          res.status(421).json({
            error: "Misdirected request",
            requestId: getRequestId(res),
          });
          return;
        }
      }
      const port = parsedHost.port;
      const standardPort =
        port === "" ||
        (port === "443" && req.protocol === "https") ||
        (port === "80" && req.protocol === "http");
      if (!standardPort && !options.allowDevelopmentPorts) {
        res
          .status(421)
          .json({ error: "Misdirected request", requestId: getRequestId(res) });
        return;
      }
      resolved = resolveRequestHost(parsedHost.hostname, options);
    } catch (error) {
      res.status(421).json({
        error: "Misdirected request",
        requestId: getRequestId(res),
      });
      return;
    }

    if (!resolved) {
      res.status(421).json({
        error: "Misdirected request",
        requestId: getRequestId(res),
      });
      return;
    }
    res.locals.requestHost = resolved;
    next();
  };
}

export function getResolvedRequestHost(res: Response) {
  const value = res.locals.requestHost as ResolvedRequestHost | undefined;
  return value ?? null;
}

export function parseAllowedOrigins(values: readonly string[]) {
  const origins = new Set<string>();
  for (const value of values) {
    if (!value.trim()) continue;
    const url = new URL(value.trim());
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error(`Invalid allowed origin: ${value}`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`Invalid allowed origin protocol: ${value}`);
    }
    origins.add(url.origin);
  }
  return origins;
}

export function getRequestOrigin(req: Request) {
  const host = req.get("host");
  if (!host) return null;
  try {
    const url = new URL(`${req.protocol}://${host}`);
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedRequestOrigin(
  req: Request,
  allowedOrigins: ReadonlySet<string>
) {
  const rawOrigin = req.get("origin");
  const expectedOrigin = getRequestOrigin(req);
  if (rawOrigin) {
    try {
      const parsed = new URL(rawOrigin);
      if (rawOrigin !== parsed.origin) return false;
      const origin = parsed.origin;
      return origin === expectedOrigin || allowedOrigins.has(origin);
    } catch {
      return false;
    }
  }

  const referer = req.get("referer");
  if (!referer) return false;
  try {
    const origin = new URL(referer).origin;
    return origin === expectedOrigin || allowedOrigins.has(origin);
  } catch {
    return false;
  }
}

export function exactCorsMiddleware(
  allowedOrigins: ReadonlySet<string>
): RequestHandler {
  return (req, res, next) => {
    const rawOrigin = req.get("origin");
    if (!rawOrigin) {
      next();
      return;
    }

    let origin: string;
    try {
      const parsed = new URL(rawOrigin);
      if (rawOrigin !== parsed.origin) throw new Error("Malformed origin");
      origin = parsed.origin;
    } catch {
      res
        .status(403)
        .json({ error: "Origin not allowed", requestId: getRequestId(res) });
      return;
    }

    const sameOrigin = origin === getRequestOrigin(req);
    if (!sameOrigin && !allowedOrigins.has(origin)) {
      res
        .status(403)
        .json({ error: "Origin not allowed", requestId: getRequestId(res) });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-LFMS-CSRF, X-LFMS-Farm, X-Request-Id, Idempotency-Key"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function requireSurface(
  expected: RequestSurface
): (req: Request, res: Response, next: NextFunction) => void {
  return (_req, res, next) => {
    if (getResolvedRequestHost(res)?.surface !== expected) {
      res
        .status(404)
        .json({ error: "Not found", requestId: getRequestId(res) });
      return;
    }
    next();
  };
}
