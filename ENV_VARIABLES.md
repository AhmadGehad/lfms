# LFMS Environment Variables

Never store real credentials in this repository. Use `.env.example` for local
setup and a managed secret store for deployed environments. Any credential that
has ever appeared in Git history must be rotated before production use.

## Required Runtime Variables

| Variable                           | Scope         | Purpose                                                                     |
| ---------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `PORT`                             | web           | Fixed HTTP port; production never selects a fallback port                   |
| `SHUTDOWN_TIMEOUT_MS`              | web           | Graceful HTTP drain deadline before connections are forced closed           |
| `DATABASE_URL`                     | server        | MySQL/TiDB URL with verified TLS (`ssl=true` or `ssl-mode=VERIFY_IDENTITY`) |
| `SESSION_PEPPER`                   | server        | Pepper used when hashing opaque session tokens                              |
| `OAUTH_STATE_SECRET`               | server        | HMAC key for OAuth transaction state                                        |
| `VITE_APP_ID`                      | server/client | Manus OAuth application identifier                                          |
| `OAUTH_SERVER_URL`                 | server        | Manus OAuth API base URL                                                    |
| `VITE_OAUTH_PORTAL_URL`            | client        | Manus sign-in portal URL                                                    |
| `OAUTH_ALLOWED_HOSTS`              | server        | Exact comma-separated OAuth API and portal host allowlist                   |
| `BASE_DOMAIN`                      | server        | Tenant base domain, for example `lfms.example.com`                          |
| `TRUST_PROXY_CIDRS`                | server        | Exact comma-separated ingress proxy IPs/CIDRs trusted for forwarded headers |
| `ADMIN_ORIGIN`                     | server        | Exact SaaS Admin origin                                                     |
| `AUTH_ORIGIN`                      | server        | Exact tenant authentication-broker origin                                   |
| `ALLOWED_TENANT_ORIGINS`           | server        | Comma-separated exact development origins; ignored in production CORS       |
| `CSP_SCRIPT_ORIGINS`               | web           | Comma-separated exact HTTPS origins permitted to serve browser scripts      |
| `CSP_CONNECT_ORIGINS`              | web           | Comma-separated exact HTTPS origins permitted for browser connections       |
| `CSP_IMAGE_ORIGINS`                | web           | Comma-separated exact HTTPS origins permitted for browser images            |
| `OBJECT_STORAGE_ENDPOINT`          | server/worker | S3-compatible private object-storage endpoint                               |
| `OBJECT_STORAGE_REGION`            | server/worker | Object-storage region                                                       |
| `OBJECT_STORAGE_BUCKET`            | server/worker | Private attachment bucket                                                   |
| `OBJECT_STORAGE_ACCESS_KEY_ID`     | server/worker | Object-storage access key from secret manager                               |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | server/worker | Object-storage secret from secret manager                                   |
| `OBJECT_STORAGE_KMS_KEY_ID`        | server/worker | KMS key used for server-side encryption                                     |
| `ADMIN_OIDC_ISSUER`                | admin server  | Workforce OIDC issuer                                                       |
| `ADMIN_OIDC_CLIENT_ID`             | admin server  | Dedicated SaaS Admin OIDC client                                            |
| `ADMIN_OIDC_CLIENT_SECRET`         | admin server  | Dedicated SaaS Admin OIDC secret                                            |
| `ADMIN_OIDC_REDIRECT_URI`          | admin server  | Exact Admin OAuth callback URL                                              |
| `ADMIN_OIDC_MFA_ACR_VALUES`        | admin server  | Comma-separated issuer ACR values accepted as MFA                           |
| `LOG_LEVEL`                        | all services  | Structured log threshold                                                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT`      | all services  | OpenTelemetry collector endpoint                                            |
| `METRICS_BEARER_TOKEN`             | web           | At least 32 characters; protects Prometheus metrics                         |
| `DEPLOY_VERSION`                   | all services  | Immutable build/version identifier                                          |
| `JOB_LEASE_MS`                     | worker        | Durable job lease duration; termination grace must exceed it                |
| `JOB_IDLE_MS`                      | worker        | Delay between empty queue polls                                             |
| `WORKER_ID`                        | worker        | Stable replica prefix included in unique lease-owner IDs                    |

## Optional Compatibility Variables

The following variables support local/development Manus integrations during the
migration. The legacy Forge storage fallback is rejected in production. Keep
them server-side unless their name starts with `VITE_`.

| Variable                     | Purpose                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                  | Reserved for a future distributed cache; currently unused                                                             |
| `VITE_ENABLE_LOCAL_DEV_AUTH` | Public boolean; explicit `1` enables direct-loopback dev login only when `NODE_ENV=development`; never deploy enabled |
| `OWNER_OPEN_ID`              | Legacy owner mapping during the Azal Farms migration                                                                  |
| `BUILT_IN_FORGE_API_URL`     | Legacy Forge service base URL                                                                                         |
| `BUILT_IN_FORGE_API_KEY`     | Legacy server-side Forge credential                                                                                   |
| `VITE_APP_TITLE`             | Browser/application title                                                                                             |
| `VITE_APP_LOGO`              | Public logo URL                                                                                                       |
| `VITE_SUPPORT_EMAIL`         | Public tenant support email shown on the company-suspended screen                                                     |
| `VITE_ANALYTICS_ENDPOINT`    | Public analytics script endpoint                                                                                      |
| `VITE_ANALYTICS_WEBSITE_ID`  | Public analytics website identifier                                                                                   |

Do not expose server credentials with a `VITE_` prefix. The previous
`VITE_FRONTEND_FORGE_API_KEY` integration is deprecated and must not be used by
new code.

## Local Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Use a local/test database and test OAuth application. Never use production data
for normal development or automated tests.

## Production Requirements

- Inject secrets at runtime from the platform secret manager.
- Use separate credentials for migrations, tenant API, Admin API, workers, and
  read-only monitoring.
- Require TLS certificate validation for TiDB, Redis, and object storage.
- Rotate secrets on personnel changes, suspected disclosure, and the regular
  security schedule.
- Run secret scanning in pre-commit and CI.
- Keep `.env`, `.env.local`, exported backups, and credentials out of Git.

## Credential Incident Procedure

1. Revoke and rotate the exposed value at its provider.
2. Update the secret manager and restart affected services.
3. Revoke active sessions when an authentication secret changed.
4. Search Git history, build logs, CI artifacts, and deployment logs.
5. Purge repository history where feasible and invalidate old clones/artifacts.
6. Record the incident without copying the credential into the audit record.
