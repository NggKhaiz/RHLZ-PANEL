# RHLZ Panel — Deployment Guide (no systemd required)

Supported targets: **native Linux (pm2 + cron / supervisord)**, **Docker**,
**Docker Compose**, and **free PaaS** (Heroku, Render, Railway, Fly.io, Koyeb,
Cyclic, Qovery). The panel binds `0.0.0.0:$PORT` and never depends on an init system.

## 1 · Native Linux (Ubuntu, Debian, CentOS, Alpine, …)

```bash
bash install.sh          # installs Node, deps, builds, registers pm2 + @reboot cron
pm2 status               # check the rhlz-panel process
pm2 logs rhlz-panel       # live logs
pm2 restart rhlz-panel    # restart
pm2 stop rhlz-panel       # stop
bash update.sh           # pull + rebuild + restart
```

Persistence: the installer writes a `@reboot … pm2 resurrect` cron entry
cron entry after `pm2 save`. If `crontab` is unavailable, use supervisord:

```ini
[program:rhlz-panel]
directory=/opt/raven-hub
command=/usr/bin/env NODE_OPTIONS=--max-old-space-size=96 /usr/bin/node dist/server.cjs
environment=NODE_ENV="production",PORT="6767",JWT_SECRET="<secret>",NODE_OPTIONS="--max-old-space-size=96"
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
```

> **Windows is not supported.** Run the panel on Linux, in a container, or on a PaaS.

## 2 · Docker

```bash
docker build -t rhlz-panel .
docker run -d --name rhlz-panel -p 6767:6767 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v rhlz-data:/app/.data \
  --memory=256m --cpus=1 \
  raven-hub
```

The image is multi-stage: builder (dev toolchain) → runtime `node:20-alpine`
with **prod deps only** (`--omit=dev --no-optional`, so no build tools, no
native addons — ssh2 uses its pure-JS fallback). Runs as **non-root** (`node`
user), node is PID 1 (no systemd), with a `/api/health` HEALTHCHECK and a
`/app/.data` volume.

## 3 · Docker Compose

```bash
cp .env.example .env   # set JWT_SECRET etc.
docker compose up -d --build
docker compose ps
```

`docker-compose.yml` ships with `restart: unless-stopped`, `mem_limit`,
`cpus`, a named volume for `.data`, environment passthrough, and a healthcheck.

## 4 · Free PaaS

The app reads `$PORT` from the platform, so no port config is needed beyond
the provided files.

| Platform | Config file | Notes |
|---|---|---|
| Heroku | `Procfile` | `web: node dist/server.cjs`; build via `npm ci && npm run build` |
| Render | `render.yaml` | auto-generates `JWT_SECRET`; health check on `/api/health` |
| Railway | `railway.json` | Nixpacks build; restart-on-failure policy |
| Fly.io | `fly.toml` | uses the Dockerfile; volume mounted at `/app/.data` |
| Koyeb | `koyeb.yaml` | web service on 6767 with health check |
| Cyclic | `cyclic.toml` | build/start inferred from package.json; Cyclic injects `$PORT` |
| Qovery | `qovery.yml` | Docker build mode, port 6767 |

Required environment variables on **every** platform:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | production mode (serves `dist/`, fail-closed secrets) |
| `JWT_SECRET` | strongly recommended | auto-generated + persisted to `.data/secret` (0600) if absent; set it explicitly |
| `JWT_EXPIRES` | no | default `24h` |
| `PANEL_CORS_ORIGINS` | no | comma-separated allowed origins (same-origin always allowed) |
| `GITHUB_WEBHOOK_SECRET` | no | enables the guarded auto-update webhook |
| `MUTATION_LIMIT` | no | per-IP mutation flood limit, default 1000/15 min |

## 5 · Environment checklist

1. `NODE_ENV=production`
2. `PORT` (PaaS sets it; local default 6767)
3. `JWT_SECRET` — or let Cypher generate and persist it
4. `PANEL_CORS_ORIGINS=https://panel.example.com` (HTTPS + reverse proxy)
5. Persistent volume for `.data/` (users, servers, keys, secrets, audit log)

## 6 · Verifying a deployment

```bash
curl -s http://localhost:$PORT/api/health        # {"status":"ok","product":"RHLZ",...}
curl -sI http://localhost:$PORT/api/health       # X-Powered-By: RHLZ, X-Request-Id
```

Then sign in, enable **Two-Factor Authentication** in Account, create a server,
and watch the console stream over Socket.IO.

---

*© 2026 RHLZ. All rights reserved.*
