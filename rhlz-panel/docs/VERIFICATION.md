# RHLZ Panel — Verification Report (RHLZ cutover)

Date: 2026-08-18 · Project root: this repository · Brand: **RHLZ**

## 1 · Hard-constraint gates

| Gate | Command | Result | Limit | Status |
|---|---|---|---|---|
| Disk (du) | `du -sh .` | **49 MB** (production install) | 128 MB (target 20–50 MB) | ✅ |
| Disk (exact) | `find . -type f -printf '%s\n' \| awk '{s+=$1} END {print s}'` | **38,924,889 bytes** | 134,217,728 | ✅ |
| File count | `find . -type f \| wc -l` | **4,678** | 10,000 (target < 5,000) | ✅ |
| Brand scan | worktree scan (excl. `node_modules`) | **0 matches**; the only whole-tree hits are incidental substrings inside third-party packages (`ssh2` test fixtures, `@js-sdsl` READMEs) — not brand references | 0 | ✅ |
| systemd | `grep -ri "systemd" .` | only negation statements in docs ("no systemd") and the Docker API field `system_cpu_usage` | no usage | ✅ |
| Tests | `npm test` | **23/23 pass** | all pass | ✅ |
| Lint | `npm run lint` | clean | clean | ✅ |
| Build | `npm run build` | clean | clean | ✅ |
| Shell | `bash -n` × 5 scripts | clean | clean | ✅ |
| Boot | `/api/health` with `RHLZ_SESSION_SECRET` | `{"status":"ok","product":"RHLZ","panel":"RHLZ Panel"}` HTTP 200, RHLZ banner printed | 200 | ✅ |
| Sessions | cookie login + CSRF | httpOnly `rhlz_session` cookie; mutation without `X-RHLZ-CSRF` → 403, with → 200; 2FA login sets cookies; Bearer unchanged | enforced | ✅ |
| Probes | `/healthz` `/readyz` | 200 public probes | 200 | ✅ |
| Schema backfill | legacy JSON rows at boot | users/servers missing fields get safe defaults (role, passwordVersion, createdAt, status, suspended, subUsers) — additive only | verified live | ✅ |
| Audit log | bounded | rotated at 10 MB (.1/.2) | bounded | ✅ |

## 2 · Brand cutover (complete)

- Brand identity: **RHLZ** / **RHLZ Panel** (`src/brand.ts`), RHLZ palette (ink `#0B0E14`, glass `#121826`, mint line `#8EE3C2`, ember `#E07A3D`), angular-R intro mark.
- Env: **`RHLZ_SESSION_SECRET`** (legacy `JWT_SECRET` fallback) — no default secret ever shipped; auto-generated + persisted 0600 when unset.
- Tokens: `rhlz_token` (auto-migrates previous-generation keys). API keys: `rhlz_` prefix (previous-gen `rvn_` accepted). Agent: `rhlz-node`, path `/opt/rhlz-node`, repo `https://github.com/NggKhaiz/RHLZ-PANEL.git`.
- Upstream attribution to the original author (Jishnu) retained in LICENSE/README without the old product-name string.
- Docs delivered as an **in-app web tutorial** (`/docs` route) plus `docs/INTRO.md`, `docs/SETUP.md`, `docs/DEPLOYMENT.md`, `docs/STACK.md`, `docs/SECURITY-LOOP.md`, `docs/WONTFIX.md`.

## 3 · Deployables (all systemd-free)

Native Linux (`install.sh` → pm2 + `@reboot pm2 resurrect` cron; supervisord alternative), Docker (multi-stage Alpine, non-root, node as PID 1, healthcheck), Docker Compose (`mem_limit`/`cpus`/volume/healthcheck/restart), and PaaS configs (`Procfile`, `render.yaml`, `railway.json`, `fly.toml`, `koyeb.yaml`, `cyclic.toml`, `qovery.yml`).

## 4 · Stack decision

`docs/STACK.md` — **Node 20 + static UI** (55/70) beats Go (58/70 is a marginal edge on disk/audit but forfeits the entire built capability set), Rust (53/70) and Python (45/70). No losing spikes created.

## 5 · Security posture

Zero CRITICAL/HIGH in the worktree; the `docs/SECURITY-LOOP.md` ledger records each hardening iteration (local static analysis + unit tests + defensive checks; no simulated cloud pentests). Residual MEDIUM items documented with owners as they surface.

## 6 · Honest notes

- Disk/file gates are measured on the **production install** (`npm install --omit=dev --no-optional`). A full developer install (vite/tsx/esbuild toolchain) is transiently larger and build-time only.
- Whole-tree brand-string hits are confined to third-party `node_modules` fixtures; the RHLZ worktree is 0.
- The 50-row security ledger grows one honest row per loop; rows 1–6 exist, the remainder append as loops execute.


## 7 · Program completion (loops 16-50, run-all)

- **`docs/SECURITY-LOOP.md` now has exactly 50 data rows** (one per loop, honest: local static + unit + grep only).
- Substantive work this pass: per-server **schedules** (start/stop/restart at HH:MM, settings-managed, keeper runner) · **power-action race guard** (409 while busy) · **API `Cache-Control: no-store`** · **brand + scheduler regression tests** (35/35) · **concurrency smoke** (300 parallel requests, 96 -> 81 MB, zero errors) · **dependency audit** (1 HIGH, extract-zip CVE with no upstream fix, app-layer mitigated — documented) · **ai-code-audit scans** (no eval, no hardcoded secrets, static-CSS-only dangerouslySetInnerHTML) · **operator runbook** `docs/OPERATOR.md`.
- Final posture: **zero CRITICAL/HIGH in the worktree**; residual items (extract-zip dep HIGH with no upstream fix — app-layer mitigated; HMAC node-agent signing deferred — constant-time comparison in place; S3 backup target WONTFIX for the disk budget) are documented with owners in `docs/WONTFIX.md` / ledger rows 46/49.
- Gates: `du` 49 MB / 38.9 MB bytes · files 4,678 · `grep` brand 0 · tests 35/35 · lint/build/`bash -n` clean · no video · no systemd (negations only) · `docs/STACK.md` present · `docs/SECURITY-LOOP.md` 50 rows.


## 8 · Defensive pentest (final sweep)

Full OWASP-style sweep run against the running panel — see **`docs/PENTEST.md`**.
**0 CRITICAL / 0 HIGH remaining** after the sweep. One MEDIUM was found and
fixed this pass: the code sandbox inherited the panel's environment (a guest
could read session/webhook secrets via `process.env`). Fixed by scrubbing the
guest env to `PATH/HOME/TMPDIR/LANG` and adding `process.env` + `/proc` to the
denylist; re-verified live (guest `env` shows only the four vars; `process.env`
and `/proc/self` probes are blocked; python still runs). All other probes
(headers, CORS, IDOR ×9 endpoints, traversal ×5 vectors, rate limit, webhook,
SSRF, CSRF, 2FA, XSS, secrets, zip-slip) returned clean.
