FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 lfms \
  && useradd --system --uid 10001 --gid lfms --home-dir /app lfms
COPY --from=build --chown=lfms:lfms /app/package.json /app/package-lock.json ./
COPY --from=build --chown=lfms:lfms /app/node_modules ./node_modules
COPY --from=build --chown=lfms:lfms /app/dist ./dist
USER lfms
EXPOSE 3000
CMD ["npm", "start"]
