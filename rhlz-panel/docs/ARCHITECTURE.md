# RHLZ — Architecture Overview

> **RHLZ Panel** · powered by the **Cypher** security core.
> Upstream: an MIT-licensed game-server management panel by Jishnu — heavily modified and rebranded as RHLZ.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · Vite 6 · Tailwind CSS v4 (`@theme` tokens) · Framer Motion + GSAP · lucide-react · react-router-dom v7 |
| Backend | Node.js 20+ · TypeScript · Express · Socket.IO |
| Persistence | Flat JSON in `.data/` (atomic writes, per-file write queue, `.bak` recovery) |
| Runtime backends | Docker (dockerode) · local process spawn · Pterodactyl Wings client · mock (sandbox) |
| Build/Deploy | `vite build` + esbuild → single `dist/server.cjs` · pm2/supervisord/Docker |

## High-level layout

```
server.ts                       Express app + Socket.IO + CORS/headers/limiters + boot sequence
src/server/
  config.ts                     Secrets (Cypher), origins, JWT expiry
  events.ts                     panelEvents (EventEmitter) — realtime backbone
  middleware/
    auth.ts                     session + API-key auth (rhlz_/rvn_ prefixes, constant-time)
    serverAccess.ts             Server-scope authorization (admin/owner/owner/sub-user)
    rateLimit.ts                Auth limiter + progressive lockout + mutation flood guard
  routes/  controllers/         HTTP API (auth, servers, nodes, api-keys, system, api)
  services/
    db.ts                       Atomic JSON persistence (write queue + .bak + updateJSON)
    runtimeProvider/factory     GameServerRuntimeProvider interface → wings | mock
    docker.ts  local.ts         Docker / host-process runtimes (resource caps enforced)
    keeper.ts                   RHLZ Keeper — scheduled housekeeping
    audit.ts                    Append-only audit log (.data/logs/audit.log, 0600)
    sftp.ts                     Built-in SFTP (bcryptjs auth, brute-force bans, caps)
    jarDownloader.ts minecraft.ts wings.ts
  utils/
    paths.ts                    resolveServerPath / resolveBackupPath (containment)
    extract.ts                  zip/tar extract (zip-slip + symlink hardened)
    ssrf.ts                     Server-side request forgery guard
    minerScan.ts                Crypto-miner signature scan for downloads
src/                            React SPA (pages, components, contexts, brand.ts)
public/node.sh                  raven-node remote agent installer
scripts/                        createuser, start-with-update
docs/                           Setup, API reference, architecture
test/                           Unit tests (node:test)
```

## Key design decisions

1. **Single Node process** serves both the SPA (Vite middleware in dev,
   static in prod) and the API — one port, one deployable unit.
2. **Realtime pattern**: services emit `panelEvents.emit("log", serverId, data)`
   → `server.ts` relays into Socket.IO room `server_<id>` → client `joinServer`.
   Every realtime event follows this exact path.
3. **All runtime features go through `GameServerRuntimeProvider`** (~24 methods):
   lifecycle, stats, console, files, backups, worlds, node health. Providers:
   `wings` (Pterodactyl, default), `mock` (sandbox), plus `docker.ts`/`local.ts`
   covering the host/Docker runtimes behind `runtime.ts`.
4. **Persistence is JSON-only** with crash safety: temp-file + rename +
   rolling `.bak`; `updateJSON()` serializes read-modify-write cycles; the
   keeper restores corrupt files from `.bak` at boot.
5. **Cypher security core** is layered, not bolted on: central path
   containment, SSRF guard, zip-slip/symlink hardening, miner scan, progressive
   lockout, constant-time comparisons, server-scope authorization, and an
   audit trail — each enforced at the narrowest layer.
6. **Multi-language execution**: Minecraft/proxy workloads use purpose-built
   images; application runtimes (Node, Python, Go, Rust, C/C++, C#, Ruby, PHP,
   Bash) run via their official image + startup command, with hard memory/CPU
   caps (`Memory`, `MemorySwap`, `NanoCpus`) at the container boundary.

## Resource-efficiency notes

- Route-level code splitting (`React.lazy`) cuts the main bundle ~49%.
- Console streams are ring-buffered (400 lines) — bounded DOM and memory.
- API responses and static assets are gzip-compressed (≥1 KB).
- `api_keys.json` `last_used_at` writes are debounced (1/min/key) to stop
  write amplification.
- Stats polling pauses when the tab is hidden; dashboard requests coalesce
  through `useDashboardData`.
- RHLZ Keeper purges temp files, prunes backups, rotates logs, and blocks
  server creation when the disk is critically full.

## Features

⚡ Dual runtime (Docker / local) · ☕ Java 8–25 auto-provisioning · 📡 live
telemetry + Wings nodes · 🌐 Playit.gg tunnels · 💻 realtime web console ·
📁 file manager + SFTP · 🔄 one-click updates · 🧹 RHLZ Keeper ·
🔐 Cypher security core · 🌍 multi-language app runtimes.

---

## Badges

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Tailwind](https://img.shields.io/badge/TailwindCSS-4-06b6d4?logo=tailwindcss&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

*© 2026 RHLZ. All rights reserved.*
