FROM node:22-bookworm-slim AS build

WORKDIR /app
# Copy everything first so patches/ is available before pnpm install
COPY . .
RUN npm install -g corepack@latest && corepack pnpm install
RUN corepack pnpm run check && corepack pnpm run build && corepack pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 lfms \
  && useradd --system --uid 10001 --gid lfms --home-dir /app lfms
COPY --from=build --chown=lfms:lfms /app/package.json ./
COPY --from=build --chown=lfms:lfms /app/node_modules ./node_modules
COPY --from=build --chown=lfms:lfms /app/dist ./dist
USER lfms
EXPOSE 3000
CMD ["node", "dist/index.js"]
