# syntax=docker/dockerfile:1
# ── RHLZ · multi-stage build ─────────────────────────────────────────
# Builder: dev toolchain (vite, esbuild, tsc) → production bundle.
# Runtime: node:20-alpine, prod deps only, non-root, no systemd (node is PID 1).
FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Prod deps only; --no-optional skips native addons (ssh2 falls back to JS)
# so the image needs no build tools.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-optional --no-audit --no-fund && npm cache clean --force
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/public ./public
# Non-root runtime user; .data is created on boot and must be writable.
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 6767
VOLUME ["/app/.data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-6767}/api/health" || exit 1
CMD ["node", "dist/server.cjs"]
