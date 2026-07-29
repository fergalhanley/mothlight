# Build context is the REPO ROOT, not apps/render — the workspace needs the root
# manifest and lockfile to resolve @mothlight/*:
#
#   docker build -f apps/render/Dockerfile -t mothlight-render .
#
# Node rather than Bun: Remotion's renderer drives a headless Chromium through Node APIs,
# and Bun is not a supported runtime for it.
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Chromium's runtime libraries. Remotion downloads its own browser binary, but that
# binary still needs these present.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# --- deps -------------------------------------------------------------------------------
FROM base AS deps
RUN corepack enable && npm install -g bun@1.3.7

COPY package.json bun.lock bunfig.toml ./
COPY apps/render/package.json ./apps/render/
COPY packages/config/package.json ./packages/config/
COPY packages/core/package.json ./packages/core/
RUN bun install --frozen-lockfile --filter '@mothlight/render...'

# --- runtime ----------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/render/node_modules ./apps/render/node_modules
COPY package.json bun.lock bunfig.toml ./
COPY apps/render ./apps/render
COPY packages/core ./packages/core
COPY packages/config ./packages/config

# Fetch the headless browser at build time so the first render does not wait on a
# 150MB download — and so a network blip at runtime is not a failed render.
RUN npx remotion browser ensure || true

# Renders are large and short-lived; a volume here keeps them off the image layer.
ENV WORKSPACE_DIR=/data/renders
RUN mkdir -p /data/renders && chown -R node:node /data
VOLUME ["/data/renders"]

USER node

EXPOSE 3002
ENV PORT=3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/render
CMD ["npx", "tsx", "src/index.ts"]
