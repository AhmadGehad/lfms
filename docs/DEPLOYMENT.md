# AI Deployer: Domains Only

Configure one HTTPS ingress for the LFMS web service. Do not create a web
service per company.

## DNS And TLS

- Create `admin.<BASE_DOMAIN>`.
- Create `auth.<BASE_DOMAIN>`.
- Create wildcard `*.<BASE_DOMAIN>` for tenant companies.
- Point all three records to the same HTTPS ingress and issue valid TLS
  certificates for each hostname.
- Redirect HTTP to HTTPS. Do not expose the Node port directly to the internet.

## Reverse Proxy

- Preserve the original `Host` header.
- Set one matching `X-Forwarded-Host` and `X-Forwarded-Proto: https`.
- Strip client-supplied forwarded headers before adding the proxy headers.
- Do not rewrite tenant hosts to an internal service hostname.
- Health probes must include a valid Admin or tenant host header.

## Domain Environment Values

```env
NODE_ENV=production
BASE_DOMAIN=example.com
ADMIN_ORIGIN=https://admin.example.com
AUTH_ORIGIN=https://auth.example.com
ADMIN_OIDC_REDIRECT_URI=https://admin.example.com/api/platform/auth/callback
TRUST_PROXY_CIDRS=<only the ingress egress CIDRs>
```

Do not set broad `TRUST_PROXY_CIDRS` values such as `0.0.0.0/0`. Do not enable
`VITE_ENABLE_LOCAL_DEV_AUTH` in production.

## Route Boundaries

- `admin.<BASE_DOMAIN>`: Admin UI and `/api/platform/*` only.
- `auth.<BASE_DOMAIN>`: authentication routes only.
- `<company-slug>.<BASE_DOMAIN>`: tenant UI, `/api/trpc/*`, `/api/oauth/*`,
  and `/manus-storage/*` only.

Host mismatches are expected to return `404` or `421`.
