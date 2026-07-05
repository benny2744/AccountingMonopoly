# ---- Stage 1: build the Vite client bundle ----
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy lockfile + workspace manifests first for cache-friendly install.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# Copy client + shared source and build the client bundle.
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN pnpm --filter @amono/client build

# ---- Stage 2: runtime (server runs TypeScript via tsx) ----
FROM node:22-alpine AS runtime
# wget is used by the healthcheck; corepack gives us pnpm.
RUN corepack enable && corepack prepare pnpm@9 --activate && apk add --no-cache wget
WORKDIR /app

# Re-install full deps (server runs via tsx at runtime).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# Copy server + shared source, plus the prebuilt client bundle.
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY --from=build /app/apps/client/dist apps/client/dist

# Defaults (overridable via docker-compose / `docker run -e`).
ENV DB_PATH=/data/game.db \
    PORT=5000 \
    NODE_ENV=production

EXPOSE 5000
# Runs as root so the bind-mounted /data is always writable regardless of the
# host user's uid (macOS uid 501, Linux uid 1000, etc.). Docker isolation is
# the security boundary for this classroom LAN game.
CMD ["pnpm", "--filter", "@amono/server", "start"]
