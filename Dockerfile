
# LIFE RPG — Dockerfile
# Multi-stage build: build web + server, then run on loopback only.
# The container publishes 127.0.0.1:3000:3000 (localhost-only).

# ---------------------------------------------------------------------------
# Stage 1: Build frontend (Vite)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /app

# Copy root manifest and lockfile.
COPY package.json package-lock.json ./

# Copy web workspace and shared package sources.
COPY apps/web ./apps/web
COPY packages ./packages

# Install web workspace dependencies including devDependencies.
RUN npm install --workspace=@liferpg/web --include=dev --include-workspace-root=true --package-lock-only
RUN npm install --workspace=@liferpg/web --include=dev --include-workspace-root=true

# Build from the web directory so Vite and Tailwind find their configs.
RUN cd apps/web && npx vite build --config vite.config.ts


# ---------------------------------------------------------------------------
# Stage 2: Build server (esbuild bundle)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS server-build
WORKDIR /app

# Install all dependencies.
COPY package.json package-lock.json ./
RUN npm install

# Copy source.
COPY apps ./apps
COPY packages ./packages
COPY tsconfig*.json ./

# Build server bundle.
RUN npm run build -w @liferpg/server


# ---------------------------------------------------------------------------
# Stage 3: Runtime (loopback-only)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Copy root manifest and server workspace manifest.
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json

# Install server production dependencies only.
RUN npm install --workspace=@liferpg/server --omit=dev

# Copy built server bundle and migrations.
COPY --from=server-build /app/apps/server/dist ./apps/server/dist
COPY --from=server-build /app/apps/server/migrations ./apps/server/migrations

# Copy built web static files.
COPY --from=web-build /app/apps/web/dist ./apps/web/dist

# Persistent data directory.
ENV LIFERPG_DATA_DIR=/data/liferpg

# Container networking.
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LIFERPG_DISABLE_AUTO_BACKUP=0
ENV LIFERPG_DOCKER=1

# Create data directory and set ownership.
RUN mkdir -p /data/liferpg && chown -R node:node /data /app
USER node

EXPOSE 3000

# Health check.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "apps/server/dist/index.js"]
