# syntax=docker/dockerfile:1.7

# Cloudflare Containers currently run linux/amd64 images.
FROM --platform=linux/amd64 node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Keep dependency resolution reproducible and cacheable. The patch directory is
# required by the patchedDependencies entry in package.json/pnpm-lock.yaml.
RUN npm install --global corepack@0.35.0 \
  && corepack enable \
  && corepack prepare pnpm@10.34.4 --activate
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .
RUN pnpm run check \
  && pnpm run build \
  && test -s dist/index.js \
  && test -s dist/worker.js \
  && test -s dist/public/index.html \
  && test -s dist/admin/index.html \
  && test -s dist/cloudflare-assets/tenant.html \
  && test -s dist/cloudflare-assets/admin.html \
  && test -d dist/cloudflare-assets/assets \
  && test ! -e dist/public/__manus__ \
  && ! grep -q '/__manus__/' dist/public/index.html \
  && ! grep -q 'id="manus-runtime"' dist/public/index.html \
  && pnpm prune --prod

FROM --platform=linux/amd64 gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e AS runtime-base

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV SHUTDOWN_TIMEOUT_MS=30000

COPY --from=build --chown=65532:65532 /app/package.json ./
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/dist ./dist
USER 65532:65532
STOPSIGNAL SIGTERM

# Build this target separately for the durable LFMS job worker. Do not run it
# inside the request-driven Cloudflare web container.
FROM runtime-base AS worker
ENV WORKER_SHUTDOWN_TIMEOUT_MS=90000
CMD ["dist/worker.js"]

# Default target used by `wrangler deploy` and normal Docker builds.
FROM runtime-base AS web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('node:http').get({ host: '127.0.0.1', port: process.env.PORT || 3000, path: '/health/live', headers: { Host: process.env.BASE_DOMAIN || 'localhost' } }, r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
CMD ["dist/index.js"]
