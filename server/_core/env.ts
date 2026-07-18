export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  sessionPepper: process.env.SESSION_PEPPER ?? "",
  oAuthStateSecret: process.env.OAUTH_STATE_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oAuthPortalUrl: process.env.VITE_OAUTH_PORTAL_URL ?? "",
  oAuthAllowedHosts: (process.env.OAUTH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  enableLocalDevAuth: process.env.VITE_ENABLE_LOCAL_DEV_AUTH === "1",
  baseDomain: process.env.BASE_DOMAIN ?? "localhost",
  adminOrigin: process.env.ADMIN_ORIGIN ?? "",
  authOrigin: process.env.AUTH_ORIGIN ?? "",
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
};
