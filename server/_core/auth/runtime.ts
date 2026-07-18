import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import { users, type User } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { ENV } from "../env";
import { getOpaqueSessionToken } from "./cookies";
import { OAuthStateManager } from "./oauthState";
import { OpaqueSessionManager } from "./opaqueSessions";
import {
  SqlOAuthStateStore,
  SqlPlatformSessionStore,
  SqlRateLimitStore,
  SqlTenantSessionStore,
} from "./sqlStores";
import { validateStorageConfiguration } from "../../storageBackend";

let tenantSessions: OpaqueSessionManager | null = null;
let platformSessions: OpaqueSessionManager | null = null;
let oauthStateStore: SqlOAuthStateStore | null = null;
let rateLimitStore: SqlRateLimitStore | null = null;

function developmentSecret(value: string, label: string) {
  return createHash("sha256")
    .update("lfms-local-development")
    .update("\0")
    .update(label)
    .update("\0")
    .update(value || "local-only")
    .digest("hex");
}

export function getSessionPepper() {
  if (ENV.sessionPepper.length >= 32) return ENV.sessionPepper;
  if (!ENV.isProduction) {
    return developmentSecret(ENV.cookieSecret, "session-pepper");
  }
  throw new Error("SESSION_PEPPER must contain at least 32 characters");
}

export function getOAuthStateSecret() {
  if (ENV.oAuthStateSecret.length >= 32) return ENV.oAuthStateSecret;
  if (!ENV.isProduction) {
    return developmentSecret(ENV.cookieSecret, "oauth-state");
  }
  throw new Error("OAUTH_STATE_SECRET must contain at least 32 characters");
}

export function getTenantSessionManager() {
  tenantSessions ??= new OpaqueSessionManager({
    audience: "tenant",
    pepper: getSessionPepper(),
    store: new SqlTenantSessionStore(),
  });
  return tenantSessions;
}

export function getPlatformSessionManager() {
  platformSessions ??= new OpaqueSessionManager({
    audience: "platform",
    pepper: getSessionPepper(),
    store: new SqlPlatformSessionStore(),
  });
  return platformSessions;
}

export function createOAuthStateManager(allowedRedirectUris: ReadonlySet<string>) {
  oauthStateStore ??= new SqlOAuthStateStore();
  return new OAuthStateManager({
    secret: getOAuthStateSecret(),
    store: oauthStateStore,
    allowedRedirectUris,
  });
}

export function getRateLimitStore() {
  rateLimitStore ??= new SqlRateLimitStore();
  return rateLimitStore;
}

export async function authenticateTenantRequest(req: Request): Promise<{
  principal: NonNullable<Awaited<ReturnType<OpaqueSessionManager["authenticate"]>>>;
  user: User;
} | null> {
  const manager = getTenantSessionManager();
  const principal = await manager.authenticate(
    getOpaqueSessionToken(req, "tenant"),
  );
  if (!principal) return null;

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, principal.subjectId), eq(users.status, "active")))
    .limit(1);
  if (!user) {
    await manager.revoke(
      getOpaqueSessionToken(req, "tenant"),
      "subject_unavailable",
    );
    return null;
  }
  return { principal, user };
}

export async function authenticatePlatformRequest(req: Request) {
  return getPlatformSessionManager().authenticate(
    getOpaqueSessionToken(req, "platform"),
  );
}

export function validateProductionAuthConfiguration() {
  if (!ENV.isProduction) return;
  getSessionPepper();
  getOAuthStateSecret();
  if (!ENV.baseDomain || ENV.baseDomain === "localhost") {
    throw new Error("BASE_DOMAIN must be configured for production");
  }
  if (!ENV.oAuthPortalUrl || !ENV.oAuthServerUrl || !ENV.appId) {
    throw new Error("OAuth configuration is incomplete");
  }
  // Derive allowed OAuth hosts from the configured URLs; OAUTH_ALLOWED_HOSTS is optional.
  const oauthHosts: string[] = ENV.oAuthAllowedHosts.length > 0
    ? [...ENV.oAuthAllowedHosts]
    : (() => {
        const hosts: string[] = [];
        try { hosts.push(new URL(ENV.oAuthServerUrl).hostname.toLowerCase()); } catch { /* ignore */ }
        try { hosts.push(new URL(ENV.oAuthPortalUrl).hostname.toLowerCase()); } catch { /* ignore */ }
        return [...new Set(hosts)];
      })();
  if (oauthHosts.length === 0) {
    throw new Error("OAUTH_ALLOWED_HOSTS must contain the approved tenant OAuth provider hosts");
  }
  validateExternalServiceUrl(ENV.oAuthServerUrl, "OAUTH_SERVER_URL", oauthHosts, true);
  validateExternalServiceUrl(ENV.oAuthPortalUrl, "VITE_OAUTH_PORTAL_URL", oauthHosts, true);
  // Platform admin login now uses Manus OAuth (same provider as tenant users).
  // No separate OIDC issuer/client credentials are required.
  validateProductionDatabaseUrl(ENV.databaseUrl);
  if (ENV.metricsBearerToken.length < 32) {
    throw new Error("METRICS_BEARER_TOKEN must contain at least 32 characters");
  }
  validateTrustedProxyCidrs(ENV.trustedProxyCidrs);
  validateStorageConfiguration();
}

export function validateProductionDatabaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://");
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must include a host and database name");
  }
  const ssl = (url.searchParams.get("ssl") ?? "").toLowerCase();
  const sslMode = (url.searchParams.get("ssl-mode") ?? "").toUpperCase();
  const verifiedSsl = ssl === "true" || ssl === "verify_identity" ||
    sslMode === "VERIFY_CA" || sslMode === "VERIFY_IDENTITY";
  if (!verifiedSsl || ssl === "false" || sslMode === "DISABLED") {
    throw new Error("DATABASE_URL must require verified TLS in production");
  }
  return url;
}

export function validateExternalServiceUrl(
  value: string,
  label: string,
  allowedHosts: readonly string[],
  production = ENV.isProduction,
) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query, or fragment`);
  }
  if (production && (url.protocol !== "https:" || (url.port && url.port !== "443"))) {
    throw new Error(`${label} must use HTTPS on the standard port in production`);
  }
  const normalizedAllowedHosts = new Set(allowedHosts.map(host => host.toLowerCase()));
  if (production && !normalizedAllowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} host is not allowlisted`);
  }
  return url;
}

export function validateTrustedProxyCidrs(values: readonly string[]) {
  if (!ENV.isProduction) return;
  if (values.length === 0) {
    throw new Error("TRUST_PROXY_CIDRS must identify the production ingress proxies");
  }
  const forbidden = new Set([
    "loopback", "linklocal", "uniquelocal", "0.0.0.0/0", "::/0",
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
  ]);
  if (values.some(value => forbidden.has(value.toLowerCase()))) {
    throw new Error("TRUST_PROXY_CIDRS must use narrow ingress proxy addresses, not broad networks");
  }
}
