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
| `DB_POOL_CONNECTION_LIMIT`         | server/worker | Per-process database connection cap                                         |
| `DB_POOL_QUEUE_LIMIT`              | server/worker | Per-process pending database request cap                                    |
| `JWT_SECRET`                       | server        | Legacy signed-callback key; independent random value of at least 32 bytes   |
| `SESSION_PEPPER`                   | server        | Pepper used when hashing opaque session tokens                              |
| `OAUTH_STATE_SECRET`               | server        | HMAC key for OAuth transaction state                                        |
| `VITE_APP_ID`                      | server        | Manus OAuth application identifier                                          |
| `OAUTH_SERVER_URL`                 | server        | Manus OAuth API base URL                                                    |
| `VITE_OAUTH_PORTAL_URL`            | server        | Manus sign-in portal URL used to construct validated redirects              |
| `OAUTH_ALLOWED_HOSTS`              | server        | Exact comma-separated OAuth API and portal host allowlist                   |
| `BASE_DOMAIN`                      | server        | Tenant base domain, for example `lfms.example.com`                          |
| `TRUST_PROXY_CIDRS`                | server        | Exact comma-separated ingress proxy IPs/CIDRs trusted for forwarded headers |
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
| `LOG_LEVEL`                        | all services  | Structured log threshold                                                    |
| `METRICS_BEARER_TOKEN`             | web           | At least 32 characters; protects Prometheus metrics                         |
| `DEPLOY_VERSION`                   | all services  | Immutable build/version identifier                                          |
| `JOB_LEASE_MS`                     | worker        | Durable job lease duration; termination grace must exceed it                |
| `JOB_IDLE_MS`                      | worker        | Delay between empty queue polls                                             |
| `WORKER_SHUTDOWN_TIMEOUT_MS`       | worker        | Hard stop deadline; must exceed `JOB_LEASE_MS`                              |
| `WORKER_ID`                        | worker        | Stable replica prefix included in unique lease-owner IDs                    |

Cloudflare deployments must configure S3-compatible private storage, normally
R2. Forge is not accepted as a production file-storage fallback.

## Optional Workforce Admin MFA

Admin login uses Manus by default. To enforce provider-verified MFA for an
administrator, configure all of the following and provision that
administrator's workforce OIDC identity. Partial OIDC configuration is invalid.

| Variable                    | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `ADMIN_OIDC_ISSUER`         | Workforce OIDC issuer                                              |
| `ADMIN_OIDC_CLIENT_ID`      | Dedicated SaaS Admin client                                        |
| `ADMIN_OIDC_CLIENT_SECRET`  | Dedicated client secret                                            |
| `ADMIN_OIDC_REDIRECT_URI`   | Exact `https://admin.<BASE_DOMAIN>/api/platform/auth/callback` URL |
| `ADMIN_OIDC_MFA_ACR_VALUES` | Comma-separated issuer ACR values accepted as MFA                  |

## Provider And Compatibility Variables

Keep server credentials server-side unless their name starts with `VITE_`.

| Variable                      | Purpose                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                   | Reserved for a future distributed cache; currently unused                                                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Reserved for future distributed tracing; currently unused                                                             |
| `ADMIN_ORIGIN`                | Exact SaaS Admin origin used by development CORS; production derives same-origin from each request                    |
| `VITE_ENABLE_LOCAL_DEV_AUTH`  | Public boolean; explicit `1` enables direct-loopback dev login only when `NODE_ENV=development`; never deploy enabled |
| `OWNER_OPEN_ID`               | Legacy owner mapping during the Azal Farms migration                                                                  |
| `BUILT_IN_FORGE_API_URL`      | Manus provider base URL for enabled maps, AI, notification, and data integrations                                     |
| `BUILT_IN_FORGE_API_KEY`      | Server-side Manus provider credential                                                                                 |
| `VITE_FRONTEND_FORGE_API_URL` | Browser-safe Manus map proxy base URL                                                                                 |
| `VITE_APP_TITLE`              | Browser/application title                                                                                             |
| `VITE_SUPPORT_EMAIL`          | Public tenant support email shown on suspended/landing screens; mailbox must be monitored                             |
| `VITE_DEFAULT_DESIGN`         | Public default tenant UI version: `old` or `new`                                                                      |
| `VITE_ANALYTICS_ENDPOINT`     | Public analytics script endpoint                                                                                      |
| `VITE_ANALYTICS_WEBSITE_ID`   | Public analytics website identifier                                                                                   |

Do not expose server credentials with a `VITE_` prefix. Production UI builds do
not load `.env` or embed these values; the web process exposes only the
validated public subset through `/runtime-config.js`. LFMS does not publish a
Forge API key to the browser.

## Local Setup

```bash
cp .env.example .env
npx -y pnpm@10.34.4 install --frozen-lockfile
npx -y pnpm@10.34.4 run dev
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
