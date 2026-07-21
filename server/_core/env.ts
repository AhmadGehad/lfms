function boundedIntegerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  sessionPepper: process.env.SESSION_PEPPER ?? "",
  oAuthStateSecret: process.env.OAUTH_STATE_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  databasePoolConnectionLimit: boundedIntegerEnvironment(
    "DB_POOL_CONNECTION_LIMIT",
    5,
    1,
    50,
  ),
  databasePoolQueueLimit: boundedIntegerEnvironment(
    "DB_POOL_QUEUE_LIMIT",
    50,
    0,
    1_000,
  ),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oAuthPortalUrl: process.env.VITE_OAUTH_PORTAL_URL ?? "",
  oAuthAllowedHosts: (() => {
    const explicit = (process.env.OAUTH_ALLOWED_HOSTS ?? "")
      .split(",")
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    if (explicit.length > 0) return explicit;
    // Auto-derive from the OAuth URLs when the env var is not explicitly set
    const derived: string[] = [];
    try { derived.push(new URL(process.env.OAUTH_SERVER_URL ?? "").hostname.toLowerCase()); } catch { /* ignore */ }
    try { derived.push(new URL(process.env.VITE_OAUTH_PORTAL_URL ?? "").hostname.toLowerCase()); } catch { /* ignore */ }
    return [...new Set(derived.filter(Boolean))];
  })(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  enableLocalDevAuth: process.env.VITE_ENABLE_LOCAL_DEV_AUTH === "1",
  baseDomain: process.env.BASE_DOMAIN ?? "localhost",
  adminOrigin: process.env.ADMIN_ORIGIN ?? "",
  adminOidcIssuer: process.env.ADMIN_OIDC_ISSUER ?? "",
  adminOidcClientId: process.env.ADMIN_OIDC_CLIENT_ID ?? "",
  adminOidcClientSecret: process.env.ADMIN_OIDC_CLIENT_SECRET ?? "",
  adminOidcRedirectUri: process.env.ADMIN_OIDC_REDIRECT_URI ?? "",
  adminOidcMfaAcrValues: (process.env.ADMIN_OIDC_MFA_ACR_VALUES ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  metricsBearerToken: process.env.METRICS_BEARER_TOKEN ?? "",
  objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "",
  objectStorageRegion: process.env.OBJECT_STORAGE_REGION ?? "",
  objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET ?? "",
  objectStorageAccessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? "",
  objectStorageSecretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? "",
  objectStorageKmsKeyId: process.env.OBJECT_STORAGE_KMS_KEY_ID ?? "",
  allowedTenantOrigins: (process.env.ALLOWED_TENANT_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  cspScriptOrigins: (process.env.CSP_SCRIPT_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  cspConnectOrigins: (process.env.CSP_CONNECT_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  cspImageOrigins: (process.env.CSP_IMAGE_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  trustedProxyCidrs: (process.env.TRUST_PROXY_CIDRS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: boundedIntegerEnvironment("SMTP_PORT", 587, 1, 65_535),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "",
  smtpSecure: process.env.SMTP_SECURE === "1",
  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "",
  isCloudflareContainer: Boolean(
    process.env.CLOUDFLARE_APPLICATION_ID &&
    process.env.CLOUDFLARE_DURABLE_OBJECT_ID,
  ),
};
