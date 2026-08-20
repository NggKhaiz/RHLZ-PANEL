# RHLZ Panel — Operator Runbook

Terminal-first. No systemd anywhere.

## Start / stop / restart

```bash
# pm2 (installed by install.sh; survives reboots via @reboot pm2 resurrect)
pm2 start dist/server.cjs --name rhlz-panel      # start
pm2 restart rhlz-panel                            # restart
pm2 stop rhlz-panel                               # stop
pm2 logs rhlz-panel                               # live logs
pm2 save                                          # persist the process list

# supervisord alternative
supervisorctl start|stop|restart rhlz-panel

# Docker / Docker Compose
docker compose up -d --build
docker compose restart
```

## Update

```bash
bash update.sh --yes        # pull + npm ci + build + restart (no systemd)
```

The GitHub webhook (`/api/webhook/github-update`) is disabled unless
`GITHUB_WEBHOOK_SECRET` is set — fail-closed by design.

## Backup / restore

```bash
# Panel state lives in .data/ (users, servers, keys, session secret, audit log)
tar -czf rhlz-backup-$(date +%F).tar.gz .data/
# Restore: stop the panel, replace .data/, start the panel.
```

Per-server backups: create them in the UI (Server → Backups) or via
`POST /api/servers/:id/backups`. Retention is enforced by the keeper
(default keep last 10, configurable in settings.json).

## Add a node

1. On the worker VPS (root): `curl -fsSL http://<panel>/node.sh | sudo bash -s -- --yes -p 6768`
   (installs the `rhlz-node` agent to `/opt/rhlz-node`, port 6768).
2. In the panel: **Nodes → Add** with the printed IP and node key.
3. Create servers on that node via the deploy wizard.

## Health

```bash
curl -s http://localhost:6767/api/healthz   # {"status":"ok"}
curl -s http://localhost:6767/api/readyz    # {"status":"ready"}
```

## Troubleshooting quick list

| Symptom | Check |
|---|---|
| Panel boots but login 500s | `RHLZ_SESSION_SECRET` unset → check `.data/secret` exists (0600); set the env var |
| Sockets don't connect | `PANEL_CORS_ORIGINS` must include your origin; HTTPS for Secure cookies |
| CSRF 403 on mutations | Browser must echo the `rhlz_csrf` cookie in `X-RHLZ-CSRF` (the SPA does this automatically) |
| Disk filling | keeper prunes temp/backups; check `.data/logs/audit.log` rotation (10 MB) |
| Sandbox 501 | Host toolchain for that language is missing — install it or use the Docker runtime |
| Forgot owner password | `npm run createuser admin <newpass>` |
