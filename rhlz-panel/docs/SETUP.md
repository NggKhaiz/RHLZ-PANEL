# RHLZ — Terminal Setup Guide

> **RHLZ Panel** — Command the flock. Rule your servers.
> Powered by the Cypher security core.

This guide walks a fresh Linux VPS from bare metal to a running RHLZ
panel. Everything below is executed in a terminal.

---

## 1 · Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 20.04 / Debian 11 / Rocky 9 | Ubuntu 22.04 LTS or newer |
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 1 GB (panel only) | 2 GB + 1 GB per game server |
| Disk | 10 GB free | 50 GB+ (game worlds are heavy) |
| Node.js | 20.x | 22.x LTS |
| Docker | 24+ (for container runtime) | Latest stable |
| Network | Outbound HTTPS (443) | Static public IP |

Check what you have:

```bash
node -v          # needs >= 20
npm -v
docker --version # optional but recommended
curl --version
```

---

## 2 · Installation

### One-command installer (recommended)

```bash
# Production, unattended (copy-paste):
curl -fsSL https://raw.githubusercontent.com/NggKhaiz/RHLZ-PANEL/main/rhlz-panel/install.sh | bash -s -- --yes --runtime docker --admin admin:ChangeMe_now
# From a git checkout:
bash install.sh --yes --runtime docker --admin admin:ChangeMe_now
```

Interactive menu (TTY only, no flags): `bash install.sh`.

The installer:

1. Installs system dependencies (curl, git, tar, jq, build tools).
2. Ensures Node.js 22 LTS.
3. Asks for the **server execution runtime** (Docker sandbox — recommended —
   or local process engine).
4. Asks for the **accent theme** (red, blue, purple, cyan, green, amber, rose,
   white).
5. Builds the production bundle (`npm run build` → `dist/server.cjs`).
6. Registers a **pm2** service named `rhlz-panel` (legacy `raven-hub` / `raven-panel` names are deleted).
7. Walks you through creating the **primary owner account**.

### Manual installation

```bash
git clone https://github.com/NggKhaiz/RHLZ-PANEL.git && cd RHLZ-PANEL/rhlz-panel
npm install --no-audit --no-fund
# installer writes .env; or set RHLZ_SESSION_SECRET yourself
npm run build
node dist/server.cjs          # or: npm start
```

---

## 3 · Environment configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `6767` | Panel HTTP port (production) |
| `NODE_ENV` | — | `production` for deploy; dev otherwise |
| `RHLZ_SESSION_SECRET` | *auto* | Primary signing secret. Fallback `JWT_SECRET`. If both missing, Cypher generates one and persists `.data/secret` (0600). |
| `JWT_EXPIRES` | `24h` | Access-token lifetime (`1h`, `8h`, `1d`…) |
| `GITHUB_WEBHOOK_SECRET` | unset | Enables the guarded `/api/webhook/github-update` auto-update hook. Unset = webhook disabled (fail-closed). |
| `PANEL_CORS_ORIGINS` | empty | Comma-separated allowed origins for API + Socket.IO (same-origin always allowed). |
| `PANEL_CSP` | `false` | Enable the conservative Content-Security-Policy header in production. |
| `MUTATION_LIMIT` | `1000` | Per-IP flood limit for mutating `/api` requests per 15 min. |
| `ENABLE_DOCKER` | `false` | Docker runtime switch (installer sets it). |
| `DEFAULT_RUNTIME` / `PANEL_RUNTIME_MODE` | `docker` | Default server runtime. |

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4 · Running

### Production (pm2 — survives reboots)

```bash
npm run build
pm2 start scripts/start-with-update.sh --name rhlz-panel   # auto-update on restart
# or plain:
NODE_OPTIONS=--max-old-space-size=96 pm2 start dist/server.cjs --name rhlz-panel
pm2 save
# persistence: crontab `@reboot pm2 resurrect` (we do not use systemd for the panel)
```

### Production (supervisord — no systemd required)

```ini
# /etc/supervisor/conf.d/rhlz-panel.conf
[program:rhlz-panel]
directory=/opt/rhlz-panel
command=/usr/bin/node dist/server.cjs
environment=NODE_ENV="production",PORT="6767",RHLZ_SESSION_SECRET="<your-secret>",NODE_OPTIONS="--max-old-space-size=96"
autostart=true
autorestart=true
startretries=5
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/rhlz-panel.out.log
stderr_logfile=/var/log/rhlz-panel.err.log
```

```bash
sudo supervisorctl reread && sudo supervisorctl update && sudo supervisorctl start rhlz-panel
```

> Prefer **Docker**: `docker compose up -d --build` or `docker run -d --name rhlz-panel -p 6767:6767 -e RHLZ_SESSION_SECRET="$(openssl rand -hex 32)" -e NODE_ENV=production -e PORT=6767 -v rhlz-data:/app/.data --restart unless-stopped rhlz-panel`

### Development

```bash
npm run dev        # tsx watch + Vite middleware (port 30000)
npm run lint       # tsc --noEmit (the verification gate)
npm test           # unit tests (node:test)
```

---

## 5 · HTTPS (recommended for production)

The panel speaks HTTP; terminate TLS in front of it. Example with Caddy:

```
panel.example.com {
    reverse_proxy 127.0.0.1:6767
}
```

Caddy auto-provisions Let's Encrypt certificates and forwards the client IP
(the panel already sets `trust proxy`). Add your origin to
`PANEL_CORS_ORIGINS` so the browser can open the Socket.IO console.

---

## 6 · Troubleshooting

| Symptom | Fix |
|---|---|
| `Refusing to boot: JWT_SECRET is missing…` (legacy behavior) | Now auto-generates — or set `JWT_SECRET` in `.env` |
| Panel boots but console sockets fail | Check `PANEL_CORS_ORIGINS` includes your origin; verify `X-Request-Id` header appears (proves the app is serving) |
| Docker servers stuck "creating" | `docker info` / `service docker start`; ensure the panel user is in the `docker` group (`sudo usermod -aG docker $USER`) |
| Port already in use | `ss -ltnp | grep 6767`; change `PORT` |
| Updates not applying | `npx pm2 logs rhlz-panel`; the webhook is disabled unless `GITHUB_WEBHOOK_SECRET` is set |
| Data files corrupt after a crash | The panel self-heals from `.data/*.json.bak` on boot; keep backups |
| Forgot owner password | `npm run createuser admin newpass` |
| Uninstall | `bash uninstall.sh` (preserves `.data/`) |

Logs live in `.data/logs/` (`audit.log` — auth/admin trail, `keeper.log` —
housekeeping). Server console logs live in each server's `panel.log`.

---

## 7 · Node agents (multi-host)

```bash
# on each worker VPS (run as root):
curl -fsSL https://your-panel/node.sh | bash -s -- -p 6768
```

Installs the `raven-node` agent (Docker proxy + NODE_KEY auth, port 6768).
The agent installs to `/opt/rhlz-node`. Register the node in **Admin → Nodes** with the printed IP + key.

---

*© 2026 RHLZ. All rights reserved.*
