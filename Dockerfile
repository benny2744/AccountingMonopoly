# Accounting Monopoly — single-container classroom deployment.
# Bundles: classic 40-space board, houses/hotels, counterparty journaling,
# Phase 5 polish (hints, scoring, export). Schema migrates on startup via
# guarded ALTER TABLE; wipe ./data for a clean room after major upgrades.

# ---- Stage 1: build the Vite client bundle ----
FROM mirror.gcr.io/library/node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy lockfile + workspace manifests first for cache-friendly install.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# Type-check shared + client before building (fail fast on broken deploys).
COPY tsconfig.base.json tsconfig.base.json
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && \
    pnpm exec tsc -p apps/client/tsconfig.json --noEmit && \
    pnpm --filter @amono/client build

# ---- Stage 2: runtime (server runs TypeScript via tsx) ----
FROM mirror.gcr.io/library/node:22-alpine AS runtime
# wget is used by the healthcheck; corepack gives us pnpm.
RUN corepack enable && corepack prepare pnpm@9 --activate && apk add --no-cache wget
WORKDIR /app

# Full workspace install — server `start` uses tsx (listed in server devDependencies).
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1
CMD ["pnpm", "--filter", "@amono/server", "start"]
