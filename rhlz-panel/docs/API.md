# RHLZ — HTTP API Reference

Base URL: `http://<panel-host>:<port>/api` · JSON bodies · Bearer auth unless noted.

## Authentication

- **Login** — `POST /auth/login` `{username, password}` → `{token, user}`.
  Rate-limited (per-IP + per-account, progressive lockout).
- **Register** — `POST /auth/register` (disabled when `enableRegistration=false`).
- **Google** — `POST /auth/google` `{idToken, email}` (ID token verified server-side; client-only googleId is rejected).
- **Me** — `GET /auth/me` (Bearer) → current user.
- **Users (admin)** — `GET /auth/users`.

### API keys
Created in **Admin → API Keys** with the `rhlz_` prefix (legacy `rvn_`
keys remain valid). Send as `Authorization: Bearer <key>`. Keys are stored as
SHA-256 hashes, verified in constant time, and are **fail-closed on scope**:
a key must declare `*` (full), `read`, `write`, `server`, or `admin` scope or
every route returns 403. `last_used_at` updates are debounced to one write per
key per minute.

## Error shape
All errors: `{ "error": "message" }` with appropriate 4xx/5xx. Requests carry
an `X-Request-Id` header echoed on every response for forensics.

---

## Servers — `POST /servers` (admin)

```json
{
  "name": "Survival",
  "ram": 4,
  "cpuLimit": 150,
  "diskLimit": 20,
  "port": 25565,
  "type": "paper",            // see Software types below
  "version": "1.21.1",
  "runtimeType": "docker",    // docker | local
  "ownerId": "<user-id>",
  "dockerImage": "golang:1.23-alpine",   // generic runtimes
  "startupCommand": "go run main.go"
}
```

### Software types
- **Minecraft**: `paper`, `spigot`, `bukkit`, `purpur`, `folia`, `vanilla`,
  `forge`, `fabric`, `neoforge`, `quilt`, `mohist`, `arclight`, `custom`.
- **Proxies**: `velocity`, `bungeecord`, `waterfall`.
- **Application runtimes**: `nodejs`, `python`, `go`, `rust`, `cpp`, `csharp`,
  `ruby`, `php`, `bash` — run via their Docker image + startup command, with
  **hard memory/CPU caps** enforced at the container level.

### Server routes (all require access: admin/owner/server-owner/sub-user)
| Method | Path | Purpose |
|---|---|---|
| GET | `/servers` | List (status-enriched) |
| GET | `/servers/:id` | Detail |
| GET | `/servers/:id/stats` | CPU/RAM/disk + uptime |
| GET | `/servers/check-port?port=N` | Port availability |
| POST | `/servers/:id/start` · `/stop` · `/restart` | Power |
| POST | `/servers/:id/command` | Console command (max 2000 chars) |
| DELETE | `/servers/:id` | Delete (admin) |
| PUT | `/servers/:id/resources` / `/suspend` / `/version` / `/migrate-runtime` | Config |
| POST | `/servers/:id/redownload-jar` | Re-fetch server JAR |

### Files
| Method | Path | Purpose |
|---|---|---|
| GET | `/servers/:id/files?path=/dir` | List / read file |
| GET | `/servers/:id/files/download?path=…` | Stream file or ZIP |
| POST | `/servers/:id/files/upload` · `/upload-chunk` · `/upload-complete` | Upload (≤2 GB/file, chunked) |
| POST | `/servers/:id/files/save` · `/create` · `/mkdir` · `/rename` · `/zip` · `/unzip` | Mutations |
| DELETE | `/servers/:id/files` | Delete (paths array) |

All paths are resolved against the server's data directory — traversal,
absolute paths, percent-encoded `..`, and sibling-prefix escapes are rejected
(403). Archives are zip-slip and symlink hardened.

### Plugins / Mods / Worlds / Backups
- `POST /servers/:id/plugins/install` · `mods/install` — Modrinth/Hangar/GitHub
  resolution or `downloadUrl` (http(s) only; SSRF-guarded; **crypto-miner
  signature scan** blocks malicious artifacts).
- `POST /servers/:id/world/import` · `GET …/world/info` · `POST …/world/analyze`.
- `GET/POST/DELETE …/backups`, `POST …/backups/:filename/restore`.

### SFTP / Sub-users / Playit
- `GET/POST/DELETE /servers/:id/sftp…` (admin/owner), brute-force banned per IP.
- `GET/POST/DELETE /servers/:id/subusers…` (admin/owner).
- `GET/POST /servers/:id/playit…` (admin/owner).

---

## System & Admin

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{status, product, panel}` |
| GET | `/settings` | none | Public panel settings |
| GET | `/system/stats` | user | Host CPU/RAM/disk/containers |
| GET | `/system/versions?type=X` | user | Available versions per software |
| GET | `/system/users` | admin | User list (no hashes) |
| POST | `/system/users` · `PUT …/users/:id/role` · `DELETE …/users/:id` · `PUT …/users/:id/password` | admin/owner | User management (audit-logged) |
| PUT | `/system/settings` | admin | Panel settings (+ `keeper` housekeeping config) |
| POST | `/system/update` | admin | Trigger self-update |
| GET/POST/DELETE | `/admin/api-keys…` | admin | API key management |
| GET/POST/DELETE | `/nodes…` | user/admin | Node registry + stats |
| POST | `/webhook/github-update` | HMAC | GitHub auto-update (disabled unless `GITHUB_WEBHOOK_SECRET` set) |

## Sandbox — `POST /run` (auth + per-IP rate limit)

```json
{ "lang": "python", "code": "print('hi')", "timeoutMs": 5000, "memoryMB": 128 }
```

Languages: `javascript`, `typescript`, `python`, `bash`, `go`, `rust`, `ruby`,
`php`, `c`, `cpp`, `java`, `csharp`, `sql` (aliases like `js`/`py`/`c++`
accepted). A missing host toolchain returns `501 Runtime not installed`;
denied content (miners, fork bombs, metadata hosts, curl-pipe-sh) returns
`400 Blocked: …`. Response: `{ok, stdout, stderr, exitCode, signal,
durationMs, timedOut, memoryMB}`. Jailed: timeout 8s default / 15s max,
memory/process/write caps, 64 KB output cap, best-effort no-network,
non-root drop, CSRF enforced for cookie sessions.

## Realtime (Socket.IO)
Handshake: `io({ auth: { token } })`. Events:
- Client → server: `joinServer(serverId)`, `leaveServer(serverId)` (access checked server-side).
- Server → client: `log` (console stream, room `server_<id>`), `keeper_notice`
  (housekeeping), `settings_updated`, `system_update_started`, `error`.
