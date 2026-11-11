# LIFE RPG — Dockerfile
# Multi-stage build: build web + server, then run on loopback only.
# The container publishes 127.0.0.1:3000:3000 (localhost-only).

# ---------------------------------------------------------------------------
# Stage 1: Build frontend (Vite)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /app
# Copy root manifest and lockfile for reproducible dependency installation.
COPY package.json package-lock.json ./
# Copy the web workspace source so npm can set up workspace symlinks.
COPY apps/web ./apps/web
# Install web workspace dependencies including devDependencies (Vite, plugin-react).
RUN npm install --workspace=@liferpg/web --include=dev --package-lock-only
RUN npm install --workspace=@liferpg/web --include=dev
RUN npx vite build --config apps/web/vite.config.ts

# ---------------------------------------------------------------------------
# Stage 2: Build server (esbuild bundle)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS server-build
WORKDIR /app
# Install all dependencies (needed for esbuild + better-sqlite3 native)
COPY package.json package-lock.json ./
RUN npm install
# Copy source
COPY apps ./apps
COPY packages ./packages
COPY tsconfig*.json ./
# Build server bundle + copy migrations
RUN npm run build -w @liferpg/server

# ---------------------------------------------------------------------------
# Stage 3: Runtime (loopback-only)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Runtime-only dependencies
COPY package.json package-lock.json ./
RUN npm install --workspace=@liferpg/server --omit=dev

# Copy built server bundle and migrations
COPY --from=server-build /app/apps/server/dist ./apps/server/dist
COPY --from=server-build /app/apps/server/migrations ./apps/server/migrations
# Copy built web static files
COPY --from=web-build /app/apps/web/dist ./apps/web/dist

# Data directory for SQLite + attachments (persisted via volume)
ENV LIFERPG_DATA_DIR=/data/liferpg
# In Docker, bind to the container interface (0.0.0.0) so Docker bridge
# port forwarding works. Host-side publication remains 127.0.0.1:3000 via
# docker-compose. Native (non-Docker) execution binds exclusively to 127.0.0.1.
ENV HOST=0.0.0.0
ENV PORT=3000
# Auto-backup enabled by default
ENV LIFERPG_DISABLE_AUTO_BACKUP=0
# Flag indicating container runtime; relaxes native loopback-only host binding.
ENV LIFERPG_DOCKER=1

# Create data dir and set ownership
RUN mkdir -p /data/liferpg && chown -R node:node /data /app
USER node

EXPOSE 3000

# Health check: loopback-only endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "apps/server/dist/index.js"]
