# RHLZ Panel — Docker & Compose

## Image

Multi-stage, `node:20-alpine`, prod deps only, non-root, node as PID 1 (no
systemd), healthchecked:

```dockerfile
FROM node:20-alpine AS builder   # full toolchain -> npm run build
FROM node:20-alpine              # npm ci --omit=dev --no-optional; COPY dist/
USER node                        # non-root
HEALTHCHECK ... wget /api/health
CMD ["node", "dist/server.cjs"]
```

`--no-optional` skips native addons (ssh2 falls back to pure JS), so no build
tools and no C toolchain are needed at runtime — the image stays lean.

## Build & run

```bash
docker build -t rhlz-panel .
docker run -d --name rhlz-panel -p 6767:6767 \
  -e RHLZ_SESSION_SECRET="$(openssl rand -hex 32)" \
  -v rhlz-data:/app/.data \
  --memory=256m --cpus=1 \
  rhlz-panel
```

## Compose

```bash
cp .env.example .env   # set RHLZ_SESSION_SECRET etc.
docker compose up -d --build
```

`docker-compose.yml` ships with `restart: unless-stopped`, `mem_limit`,
`cpus`, a named volume for `.data`, environment passthrough, and a
`/api/health` healthcheck with `start_period`.

## Notes

- Persistent data lives only in the `/app/.data` volume (users, servers,
  keys, session secret, audit log). Losing the volume loses the panel state.
- Production traffic should terminate TLS in front (Caddy/nginx) and add
  `PANEL_CORS_ORIGINS`.
- No systemd anywhere: the container runtime owns restart policy.
