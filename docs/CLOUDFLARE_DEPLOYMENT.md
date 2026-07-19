# Cloudflare Containers Deployment

This deploys LFMS through one Cloudflare Worker route. Workers Static Assets
serves the landing page, tenant application, Admin application, and versioned
CSS/JavaScript as one Worker version. Cloudflare Containers serves APIs,
authentication, health, runtime configuration, storage redirects, and metrics.
The Docker image also contains both UI builds and both Node entry points so it
remains complete for image smoke tests and non-Cloudflare operation.

The deployment does not run a database migration and does not modify legacy
tables. Do not run migration or provisioning scripts as part of this deploy.

## Release Gate

Do not deploy until all items below are true:

- The Cloudflare zone for `l-fms.com` is active on a Workers Paid plan with
  Containers access.
- Staging has a certificate covering `*.staging.l-fms.com`. The default
  Universal SSL wildcard does not cover this multi-level hostname; use Total
  TLS, Advanced Certificate Manager, or a custom certificate.
- Every name in `secrets.required` is configured as a dashboard Secret on the
  target Worker (see "Required Secrets").
- For manual fallback deploys only: Docker BuildKit runs `linux/amd64` builds
  and Node `22.23.1` with pnpm `10.34.4` are available locally.
- CI passed against `pnpm-lock.yaml`: secret scan, typecheck, tests, build, and
  dependency audit, both Docker targets, image smoke tests, and Wrangler dry
  runs.
- The final runtime image has an SBOM and a current OS/container vulnerability
  scan with every critical/high result fixed or explicitly risk-accepted.
- The target database uses verified TLS and has enough capacity for at most
  `3 * DB_POOL_CONNECTION_LIMIT` web connections, plus the separate job worker.
- An isolated staging environment passed login, tenant isolation, Admin, file,
  export, concurrency, and expected-peak load tests on the configured basic
  container pool. Never use the shared production database for destructive
  validation.
- A current provider-managed database backup or snapshot exists. This deploy
  makes no schema change, but the backup remains an operational release gate.
- The Manus application has exact allowed callbacks for Admin and every active
  tenant, including `https://admin.l-fms.com/api/platform/auth/callback` and
  `https://azal-farms.l-fms.com/api/oauth/callback`. If Manus does not support a
  safe tenant wildcard, register each company before activation.
- Administrators with `mfaRequired=true` use the configured workforce OIDC
  provider. Manus-only Admin accounts must be explicitly configured with
  `mfaRequired=false`.
- `support@l-fms.com` is verified and monitored before it is shown to suspended
  tenants.

The repository intentionally has one dependency lockfile. Do not add or use an
npm lockfile for this image.

Production Vite builds do not load repository `.env` files or publish
operator-local `VITE_*` values. Public tenant settings come from the
same-origin `/runtime-config.js` response, and Admin authentication always uses
the same-origin `/api/platform/auth/login` endpoint. This keeps the Docker build,
CI build, and Worker asset build deterministic.

## Cloudflare Configuration

[`wrangler.jsonc`](../wrangler.jsonc) defines:

- Worker routes for `l-fms.com/*` and `*.l-fms.com/*`.
- An isolated `staging` environment on `staging.l-fms.com` and
  `*.staging.l-fms.com`, with separate secrets and a separate database.
- The `LfmsWebContainer` Durable Object binding.
- The `ASSETS` binding for the generated tenant/Admin edge bundle. The Worker
  chooses the shell from the validated hostname; a tenant host cannot request
  the Admin shell by naming its internal asset.
- Three `basic` `linux/amd64` web containers selected as a fixed random pool.
- A gradual `25%, 50%, 100%` production container rollout with a 30-second
  active-request grace period. Static HTML and hashed assets switch atomically
  with the Worker version and are not tied to container replacement order.
- Non-secret production host, OAuth URL, pool, and browser configuration.
- The required secret names. Secret values are never stored in Git or image
  layers.

The apex and wildcard DNS records must be orange-cloud proxied; the wildcard
covers production `admin`, `www`, and tenant hosts. The production Worker
rejects the reserved `staging.l-fms.com` hostname tree so a missing staging
route cannot expose production as a staging tenant. Staging also needs explicit
proxied `staging` and `*.staging` records. For this originless Worker route, use
proxied placeholder `AAAA` records pointing to `100::` (or `A` records pointing
to `192.0.2.0`). Remove the current cross-account CNAME targets: they return
Cloudflare error 1014 and cannot be used as a rollback origin. There is no
`auth.l-fms.com` broker in this release. Keep an independently working previous
origin/route until post-deploy checks pass.

Cloudflare does not automatically inject Worker secrets into a container. The
Worker passes only the explicit allowlist in `cloudflare/runtime.ts`. When a new
runtime setting is added, review and update that allowlist deliberately.

## Required Secrets

Deployments are triggered by Cloudflare Workers Git integration (see
"Build And Deploy"), so no local Wrangler login or local secrets file is
required for a normal release.

Configure every name in `secrets.required` in the Cloudflare dashboard under
**Workers & Pages → (worker) → Settings → Variables and Secrets**, with type
**Secret**. This includes the database, independent auth keys, private R2
credentials, Manus server key, app ID, and analytics identifiers. Production
(`lfms-production`) and staging (`lfms-staging`) are separate Workers with
separate secret sets and separate databases.

Set all required secrets **before** connecting Git integration or pushing to
the production branch: the first Git-triggered deploy starts containers
immediately, and a container without its secrets fails readiness.

Dashboard rules that matter here:

- Secrets set in the dashboard persist across Git-triggered
  `wrangler deploy` runs; they are never deleted by a deploy.
- Do not add plain-text variables in the dashboard. Non-secret configuration
  lives in `vars` in `wrangler.jsonc` (the source of truth) and dashboard
  plain-text values are overwritten on every deploy.

When workforce Admin MFA is enabled, also include all four core `ADMIN_OIDC_*`
values documented in `ENV_VARIABLES.md`; add `ADMIN_OIDC_MFA_ACR_VALUES` when
the issuer uses custom MFA ACRs. Partial core configuration fails startup. Use
the exact Admin callback for the target environment.

The analytics values are browser-visible identifiers, not credentials. The
production runtime never publishes a Forge API key to the browser.

Do not run sequential `wrangler secret put` commands against the routed Worker:
each command can deploy a version with only part of the configuration. Use the
dashboard **Variables and Secrets** editor and save all changes together, or
`wrangler versions secret bulk` from a trusted operator machine.

To confirm remote names only (does not print values), run from any
authenticated machine:

```bash
pnpm run check:cloudflare-secrets
```

Generate `JWT_SECRET`, `SESSION_PEPPER`, `OAUTH_STATE_SECRET`, and
`METRICS_BEARER_TOKEN` as independent random values of at least 32 bytes. Never
reuse or log them. Rotating the session pepper revokes existing sessions.

## Build And Deploy

### Git Integration (primary path)

Production deploys through Cloudflare Workers Git integration: a push to the
configured production branch triggers the build and deployment inside
Cloudflare's build environment, including the container image build. No local
Docker, local secrets file, or local Wrangler authentication is involved.

Configure the Git-connected Worker in the dashboard
(**Workers & Pages → lfms-production → Settings → Build**):

- Repository: `AhmadGehad/lfms`, production branch as configured.
- Build command: `pnpm run check:secrets && pnpm run check && pnpm run build`
- Deploy command: `npx wrangler deploy --env "" --containers-rollout gradual`
- Non-production branch deployments: disabled for this Worker.

Connect the staging Worker (`lfms-staging`) to the same repository as a second
Git-connected Worker with deploy command
`npx wrangler deploy --env staging`, tracking the branch used for staging.

The dependency install uses the committed `pnpm-lock.yaml` (pnpm is selected
via `packageManager` in `package.json`). The deploy command uploads the Worker,
static asset version, and container image atomically with the configured
gradual rollout. All release-gate items (staging validation, secrets present,
DNS, certificates) must be true **before** pushing to the production branch —
the push is the deployment.

### Manual deploy (fallback only)

`scripts/deploy-cloudflare.mjs` remains for operator-driven deploys from a
trusted machine (for example when Git integration is unavailable). It requires
local Docker, `wrangler login`, and a protected secrets file; see the script
for its provenance gates. For normal releases prefer the Git path above.

Install exactly the reviewed dependency graph:

```bash
pnpm install --frozen-lockfile
pnpm run check:secrets
pnpm run check
pnpm run build
```

Build the exact container locally for image smoke tests:

```bash
docker buildx build --platform linux/amd64 --target web --load -t lfms-web:release .
```

The Docker build fails unless all required runtime and edge artifacts exist:

- `dist/index.js`
- `dist/worker.js`
- `dist/public/index.html`
- `dist/admin/index.html`
- `dist/cloudflare-assets/tenant.html`
- `dist/cloudflare-assets/admin.html`
- `dist/cloudflare-assets/assets/`

`scripts/prepare-cloudflare-assets.mjs` merges only generated Vite assets,
rejects symlinks and conflicting filenames, and verifies every HTML asset
reference. The deploy script always runs the full build before Wrangler uploads
the edge asset version.

Release order with Git integration: push to the staging branch first, run the
staging gates against `staging.l-fms.com`, then push (or fast-forward merge)
the same reviewed commit to the production branch. Check rollout state with:

```bash
pnpm run cloudflare:status:staging
pnpm run cloudflare:status
```

Do not set `VITE_ENABLE_LOCAL_DEV_AUTH=1`, use broad trusted-proxy CIDRs, bake
an `.env` file into the image, or expose container port `3000` publicly.
The Worker serves HTML and matching hashed assets from one immutable asset
version, avoiding cross-version UI asset overlap. Keep API changes
backward-compatible for the duration of the container rollout.

## Background Worker

The image includes a separate `worker` target for notifications, subscription
expiration, usage snapshots, exports, and lifecycle jobs:

```bash
docker buildx build --platform linux/amd64 --target worker --load -t lfms-worker:release .
```

`wrangler.jsonc` intentionally deploys only the request-driven web process. The
current database-polling worker must run as one or more always-on processes on
a durable container service using the same image's `worker` target. Its SQL
leases make replicas safe, but it needs separate least-privilege database and
storage credentials. Do not run web and worker commands in one container.
Set `WORKER_SHUTDOWN_TIMEOUT_MS` above `JOB_LEASE_MS` and configure the service
termination grace above that shutdown timeout. Rolling shutdown drains active
jobs and an in-flight scheduler before closing storage and database clients.

Cloudflare-only worker deployment requires a separate bounded Cron/Queues
design. Do not claim the operational deployment complete while the worker is
stopped.

## Post-Deploy Checks

Run these checks before removing the previous origin:

```bash
curl -fsS https://l-fms.com/health/live
curl -fsS https://l-fms.com/health/ready
curl -fsS https://admin.l-fms.com/health/live
curl -fsS https://admin.l-fms.com/health/ready
curl -fsS https://azal-farms.l-fms.com/health/live
curl -fsS https://azal-farms.l-fms.com/health/ready
curl -fsSI https://l-fms.com/
curl -fsSI https://admin.l-fms.com/
curl -fsSI https://azal-farms.l-fms.com/
```

Expected results:

- Liveness and readiness endpoints return `200` JSON. Readiness checks the
  database and required operational tables before the edge accepts traffic.
- UI routes return `200` with `Content-Type: text/html`; they must not return
  `Content-Disposition: attachment`.
- Responses include LFMS security headers and `X-Request-Id`.
- HTTP redirects once to HTTPS; `www` redirects once to the apex domain.
- Admin login works only on `admin.l-fms.com`.
- Azal login resolves only the Azal company and displays migrated Azal data.
- A tenant session cannot call platform APIs or another tenant hostname.
- Maps, analytics, object storage, exports, and the external job worker are
  healthy.

Watch Worker/container logs, database connection count, `503` responses,
authentication failures, and job backlog through the full observation window.
The in-process `/metrics` endpoint is replica-local, not a fleet aggregate. Use
Cloudflare observability or a central telemetry backend for production alerts.

## Rollback

Keep the previous Worker version, image, DNS records, and origin until checks
pass. If the release fails:

```bash
pnpm run cloudflare:rollback
```

Select the last known-good Worker version and matching static asset version,
verify its container image rollout, then repeat the health and login checks. If routing itself is broken, restore
the previous proxied origin/route configuration. Because this deployment has no
database migration, application rollback does not require a schema rollback.
Do not delete tenant or legacy data during rollback.
