# RHLZ — CHANGELOG (cumulative ledger)

## 3.1.0 — One-click + consistency + HIGH security + LOOP-20
- `src/software.json` catalog; CreateServer families; jar sources for Purpur/Folia/Velocity fill; HMAC node sign; disk `du` cache; Playit local honesty; pocketmine + java app types.
- Unattended installer (`install.sh --yes`), `update.sh --yes`, `uninstall.sh --yes [--purge]`, `scripts/one-click.sh`.
- PM2 name `rhlz-panel`; secrets `RHLZ_SESSION_SECRET`; version `3.1.0` from `src/brand.ts`.
- isMain guard; crash log `.data/logs/crash.log`; Vite `allowedHosts` true; compose `rhlz-panel`.
- Google ID-token verify; scrubbed local spawn env; per-server RCON; webhook no query secret; node.sh Node 22 + CORS deny + HMAC.

## 2FA sprint — TOTP two-factor authentication (adopted from reference analysis)
- **TOTP 2FA** (`otpauth` + `qrcode`): setup (secret + QR + 10 single-use recovery codes),
  verify-enable, disable, and a two-step login (`twoFactorRequired` → short-lived `2fa`-scope
  JWT → code). Secret encrypted at rest (AES-256-GCM, key derived from JWT secret), recovery
  codes bcrypt-hashed, progressive lockout on failed codes, in-memory replay guard per 30s
  window. UI: Login code step + AccountPage enable/disable panel. **Verified live end-to-end.**
- Constraint fixes: 128 MB is a **disk** limit → production install 45 MB / ~4.5k files
  (`--omit=dev`; build tooling stays dev-only); systemd removed from scripts + docs.

## Cleanup & constraints sprint
- Dependency reclassification (22 frontend/build/type packages → devDependencies); prod deps = 18
  server-runtime packages → prod install 21,311 → 4,461 files, 362 → 43 MB.
- Memory heap cap `--max-old-space-size=96` (measured 56 MB peak RSS).
- Removed all user-facing upstream branding; remaining `RHLZ` = legal upstream attribution +
  functional backward-compat shims (documented).
- Systemd removed (pm2 / supervisord / Docker only). Gzip, debounced writes, resource caps.

## Full sprint (cleanup · optimization · testing · security · UI/UX · docs · multi-language)
- Removed 8 unused deps; `crypto-miner scan`; percent-encoded traversal guard; glassmorphism
  IntroOverlay; docs (SETUP/API/ARCHITECTURE); multi-language runtimes (Go/Rust/C++/C#/Ruby/PHP/
  Bash); graceful shutdown; `npm test` (node:test) suite.

## Loop 1-CYPHER / v4.0 Loop 0+1 (SECURITY)
- SSRF guard, extract-zip symlink CVE mitigation, API-key scope fail-closed, SFTP brute-force
  bans, append-only audit log, progressive lockout, constant-time auth.
- Stack benchmark verdict: keep Node/TS + Express (A, 815); hybrid F (+2.5%) below adoption bar.

## Earlier passes (v1–v3 prompts)
- Security v1 (auth bypass, server-scope authz, path containment, webhook HMAC, CORS/headers),
  backend (atomic JSON writes + .bak, orphan reaper, error middleware), frontend (token-key
  consistency, stale-fetch guards), performance (code splitting −49%), RHLZ Keeper, UI polish,
  first branding sweep.
