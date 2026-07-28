# Build context is the REPO ROOT, not apps/api — the Bun workspace needs the root
# manifest and lockfile to resolve @mothlight/* packages:
#
#   docker build -f apps/api/Dockerfile -t mothlight-api .
#
FROM oven/bun:1.3.7-alpine AS base
WORKDIR /app

# --- deps -------------------------------------------------------------------
# Copy only manifests first so the install layer caches until dependencies change.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
RUN bun install --frozen-lockfile

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json bun.lock ./
COPY apps/api ./apps/api
COPY packages/core ./packages/core
COPY packages/db ./packages/db
COPY packages/config ./packages/config

# Run as the unprivileged user that the oven/bun image ships with.
USER bun

EXPOSE 3001
ENV PORT=3001

# Cheap liveness check against the unauthenticated health route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "const r = await fetch('http://localhost:' + (process.env.PORT ?? 3001) + '/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "run", "apps/api/src/index.ts"]
