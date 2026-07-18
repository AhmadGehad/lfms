import { createHash } from "node:crypto";

export function normalizePlatformOidcIssuer(value: string, requireHttps = false) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid ADMIN_OIDC_ISSUER");
  }
  if (requireHttps && url.protocol !== "https:") {
    throw new Error("ADMIN_OIDC_ISSUER must use HTTPS in production");
  }
  return url.toString().replace(/\/$/, "");
}

export function platformOidcProviderCode(value: string, requireHttps = false) {
  const issuer = normalizePlatformOidcIssuer(value, requireHttps);
  return `oidc:${createHash("sha256").update(issuer).digest("hex").slice(0, 16)}`;
}
