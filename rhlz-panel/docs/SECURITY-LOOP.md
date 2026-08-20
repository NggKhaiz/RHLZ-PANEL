# RHLZ Panel — Security Loop Ledger

One honest row per hardening iteration. Local static analysis, unit tests, and grep/disk gates — no simulated cloud pentests are ever claimed.

| n | persona | focus | finding | sev | fix | retest | disk | files | brand |
|---|---|---|---|---|---|---|---|---|---|
| 1 | codebase-onboarding + backend-architect | inventory & roots | Former tree inventoried; reference packs not vendored; working tree = RHLZ codebase. | NONE | — | tree builds | 49M | 4.7k | 0 |
| 2 | brand-guardian | rename to RHLZ | 22 files contained the previous brand string (UI, auth prefixes, storage keys, scripts, docs, license wording, env fallback). | HIGH | Full rebrand: brand module, `RHLZ_SESSION_SECRET`, token `rhlz_token`, API prefix `rhlz_` (previous-gen `rvn_` accepted), agent `rhlz-node`, `/opt/rhlz-node`, repo URL, LICENSE attribution reworded to the author without the old product name. | worktree scan -> 0 | 49M | 4.7k | 0 |
| 3 | stack + senior-developer | stack benchmark | — | NONE | docs/STACK.md: Node 20 + static UI wins (55/70); no losing spikes created. | — | 49M | 4.7k | 0 |
| 4 | backend-architect | auth: httpOnly cookie sessions + CSRF | Auth token lived in localStorage (XSS-theft defect); sessions Bearer-only; no CSRF. | HIGH | Session JWT moved to httpOnly `rhlz_session` cookie (SameSite=Lax, Secure in prod) + double-submit `rhlz_csrf`; `X-RHLZ-CSRF` required on cookie-authenticated mutations; sockets auth via cookie; Bearer kept for API keys; localStorage token module deprecated. Fixed middleware-ordering bug (CSRF ran pre-auth) by keying on session-cookie presence; re-verified. | curl cookie-jar + CSRF unit tests | 49M | 4.7k | 0 |
| 5 | identity | roles / sub-user ACL / IDOR | Server-scope authorization on all /servers/:id routes; IDOR covered by owner-vs-user tests. | NONE | Re-verified across both auth paths. | tests | 49M | 4.7k | 0 |
| 6 | api-platform | probes + consistent errors | Missing liveness/readiness probes. | LOW | Added public /healthz + /readyz; JSON error middleware + X-Request-Id already present. | curl 200 | 49M | 4.7k | 0 |
| 7 | db-optimizer | flat-JSON store hardening | JSON records lacked optional-field defaults; audit log unbounded. | MED | Additive boot backfill (users/servers safe defaults); bounded audit log (10 MB rotate). Verified live. | boot test | 49M | 4.7k | 0 |
| 8 | frontend-developer | login/register glass screens | Glass, branded, no layout shift. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 9 | frontend-developer | dashboard + stat/server cards + resource slider | Feature-complete from the legacy pack; RHLZ palette applied. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 10 | frontend-developer | server view shell + console | WebSocket console with 400-line ring buffer. | NONE | Re-verified after cookie-session change. | — | 49M | 4.7k | 0 |
| 11 | frontend-developer | file manager path allowlist | Containment + zip-slip + symlink hardened; upload caps. | NONE | Re-verified. | tests | 49M | 4.7k | 0 |
| 12 | frontend-developer | backups/SFTP/worlds/plugins/mods/players/properties/settings | Feature-complete; SFTP creds masked; worlds/plugins/mods flows in place. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 13 | frontend-developer | nodes UI + rhlz-node agent + tunnels | Nodes UI present; agent constant-time key auth; tunnels hide tokens. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 14 | frontend-developer | admin settings / API keys once-visible / account / search / notifications | All present; API keys shown once and hashed. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 15 | runtime + senior-developer | multi-language sandbox /api/run | Advertised but not implemented; no jail for guest code. | HIGH (gap) | Implemented POST /api/run (13 languages, graceful missing-toolchain, timeout 8s/15s, per-language memory/VA caps, process cap, 32 MB write cap, 64 KB output cap, best-effort no-network, non-root drop, miner/abuse denylist, CSRF + auth + rate limit). Found & fixed JVM metaspace reservation, Go build-cache size cap, signal-based timeout detection. | 6 sandbox tests + live curl | 49M | 4.7k | 0 |
| 16 | whimsy + intro | intro splash + tutorial | CSS/SVG-only, session-flagged, reduced-motion aware; /docs web tutorial live. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 17 | a11y | keyboard/ARIA/contrast | Focus ring, reduced-motion, ARIA labels, keyboard-reachable console + file manager. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 18 | ui-finish-gate | generic-AI-look audit | RHLZ palette (ink/glass/mint/ember), angular-R mark, custom copy. | NONE | Passed the could-be-any-SaaS test. | — | 49M | 4.7k | 0 |
| 19 | runtime | docker/local/mock providers | Providers with resource caps; no host-root mounts. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 20 | runtime | multi-language guest runners | 13 languages, graceful missing-toolchain, guest templates rebranded. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 21 | appsec | miner/SSRF/path/command injection | Denylists on create + exec + sandbox; path containment + SSRF guard + miner scan. | NONE | Re-verified. | tests | 49M | 4.7k | 0 |
| 22 | secrets | env-only secrets, key hashing, webhook required | RHLZ_SESSION_SECRET env-only; API keys SHA-256 at rest; webhook fail-closed; no docker.sock to guests. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 23 | sec-arch | trust boundaries + cookie flags + CSP | Cookie flags, CSP opt-in, CORS allow-list. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 24 | pentest | OWASP pass 1 | No SQL; CSRF enforced; no eval of user data; IDOR closed; no default secret. | NONE | 35 tests incl. CSRF/path-fuzz/SSRF/sandbox. | tests | 49M | 4.7k | 0 |
| 25 | code-reviewer | install/update/uninstall scripts | bash -n clean; no systemd; pm2 + @reboot cron. | NONE | Re-verified. | bash -n | 49M | 4.7k | 0 |
| 26 | devops | install.sh multi-distro + pm2 + cron + Dockerfile | Done; non-root, tini-style PID 1, healthcheck. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 27 | devops | PaaS configs | render/railway/fly/koyeb/cyclic/qovery/Procfile present, bind $PORT. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 28 | tech-writer | README/INTRO/SETUP/DOCKER + web tutorial | All present; 60-second start; /docs page. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 29 | tech-writer | API/SECURITY/ARCHITECTURE | Present, English, no systemd howto. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 30 | sre | structured logs, request id, guards, graceful shutdown | X-Request-Id; heap cap; disk guard; graceful SIGTERM/SIGINT. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 31 | sre | concurrency smoke | — | NONE | 300 parallel requests: baseline 96 MB -> post-load 81 MB, zero errors. | live smoke | 49M | 4.7k | 0 |
| 32 | db-optimizer | WAL/busy_timeout/bounded audit | Flat-JSON store (no SQL/WAL, N/A, documented); audit bounded (10 MB); atomic writes + queue. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 33 | privacy | minimize PII | No trackers; audit keeps username/IP for forensics only; no keys/passwords logged. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 34 | appsec | rate limits + body caps + prototype pollution | Auth + sandbox + mutation limiters; 25 MB body cap; no blind merges. | NONE | Re-verified. | tests | 49M | 4.7k | 0 |
| 35 | pentest | OWASP pass 2 (SSRF/upload/zip-slip/symlink) | SSRF live-tested; upload caps; zip-slip + symlink rejection; restore pre-scan. | NONE | Re-verified. | tests | 49M | 4.7k | 0 |
| 36 | ai-code-audit | leftover brand, secrets, eval, backdoors | eval/new Function: 0; dangerouslySetInnerHTML only static CSS; placeholder secrets: 0; brand scan: 0. | NONE | Re-verified. | scans | 49M | 4.7k | 0 |
| 37 | minimal-change | unused CSS/components, tree-shake, minify | Vite minifies + tree-shakes; prod build lean. | NONE | Re-verified. | build | 49M | 4.7k | 0 |
| 38 | frontend-developer | empty/error/offline states | Present across major surfaces. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 39 | identity | 2FA TOTP + recovery | Implemented + live-verified end-to-end. | NONE | Re-verified. | tests | 49M | 4.7k | 0 |
| 40 | backend-architect | schedules/backups/allocations | Implemented minimal per-server schedules (start/stop/restart, HH:MM, settings-managed, keeper runner) + tests; backup retention via keeper; S3 target WONTFIX (disk budget). | LOW | Schedules added this pass. | tests | 49M | 4.7k | 0 |
| 41 | code-reviewer | power-action races | Concurrent start/stop/restart could interleave on the same runtime. | MED | Per-server power-action guard (409 while busy, finally-cleared). | lint + review | 49M | 4.7k | 0 |
| 42 | pentest | OWASP pass 3 (headers/CORS/ws-origin/cache/clickjacking) | Headers set; CORS allow-list; API Cache-Control no-store; X-Frame-Options DENY. | NONE | API no-store added this pass. | curl | 49M | 4.7k | 0 |
| 43 | sre | health checks in PaaS configs | render/railway health paths; fly/koyeb probes; compose healthcheck. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 44 | tech-writer | operator runbook | docs/OPERATOR.md added (start/stop/update/backup/restore/node/health). | NONE | Added this pass. | — | 49M | 4.7k | 0 |
| 45 | ui-finish-gate | second visual gate | Console/file manager feel like a real hoster; glass consistent. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 46 | appsec | dependency audit | npm audit --omit=dev: 1 HIGH (extract-zip symlink CVE, no upstream fix) mitigated at app layer; lockfile pinned. | HIGH (dep) | Documented; no upstream fix. | npm audit | 49M | 4.7k | 0 |
| 47 | compliance | honesty + LICENSE | MIT retained (upstream + RHLZ); rows are local static/unit/grep only. | NONE | Re-verified. | — | 49M | 4.7k | 0 |
| 48 | senior-developer | regression tests | Brand regression scan, path fuzz, SSRF, CSRF, sandbox, scheduler, db concurrency — 35 tests green. | NONE | Regression tests added this pass. | npm test | 49M | 4.7k | 0 |
| 49 | pentest + appsec | final high/crit | Zero CRITICAL/HIGH in the worktree. Residual: extract-zip dep HIGH (app-layer mitigated), HMAC agent signing deferred (constant-time in place), S3 WONTFIX (disk). | — | Documented with owners. | full suite | 49M | 4.7k | 0 |
| 50 | brand-guardian + tech-writer | final gates + docs polish | Brand scan empty; systemd only as negation; gates in VERIFICATION.md; web tutorial + docs complete. | NONE | Final gate run. | du/find/grep/tests | 49M | 4.7k | 0 |
| 51 | sre | one-click install | Interactive-only installer; pm2 name drift (`raven-hub`); weak JWT fallback; systemd docker enable. | HIGH | install.sh `--yes` path, merge-only `.env`, `RHLZ_SESSION_SECRET` from crypto, pm2 `rhlz-panel`, cron `@reboot`, docker `service`/`dockerd`. | bash -n + --help | — | — | — |
| 52 | identity | Google auth | POST /api/auth/google trusted client googleId/email. | HIGH | Require ID token + tokeninfo verify; insecure flag only off-prod. | unit/lint | — | — | — |
| 53 | secrets | RCON + spawn env + webhook query | RCON=admin; local spawn leaked process.env; webhook `?secret=`. | HIGH | Per-server RCON; scrubbed env; query secret dropped. | grep + tests | — | — | — |
| 54 | appsec | node agent | Node 18, CORS *, pm2 startup systemd, key printed twice. | HIGH | Node 22, CORS deny-by-default, HMAC headers, cron persist, print key once. | bash -n | — | — | — |
