# RHLZ Panel — Security

## Threat model (STRIDE, condensed)

| Threat | Mitigation |
|---|---|
| Spoofing | httpOnly session cookie + constant-time JWT verify; API keys hashed (SHA-256) at rest, compared constant-time; server-scope authorization on every `/servers/:id` route (admin/owner/owner/sub-user). |
| Tampering | Signed session JWT; atomic JSON writes (temp + rename) with `.bak`; double-submit CSRF token required on cookie-authenticated mutations. |
| Repudiation | Append-only audit log (`.data/logs/audit.log`, 0600, rotated at 10 MB): auth events, admin actions, server create/delete/power, 2FA events. |
| Information disclosure | No secrets in git or client bundles; API keys masked after creation; errors return generic messages in production; `X-Request-Id` correlation; no stack traces to clients. |
| Denial of service | Per-IP + per-account rate limiting with progressive lockout; mutation flood limiter; body size caps; Docker `Memory`/`NanoCpus` caps; bounded console ring buffer; heap cap `--max-old-space-size=96`. |
| Elevation of privilege | Role/ownership derived from the verified token server-side; sub-user ACL matrix; fail-closed API-key scopes; `requireAdmin` on admin routes. |

## Headers & cookies

- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
  `X-Powered-By: RHLZ`, optional CSP (`PANEL_CSP=true`).
- Session cookie: `rhlz_session` — httpOnly, SameSite=Lax, Secure in
  production, 24 h TTL. CSRF cookie `rhlz_csrf` (non-httpOnly) echoed in the
  `X-RHLZ-CSRF` header on mutations.
- CORS: same-origin by default; `PANEL_CORS_ORIGINS` allow-list; credentials
  enabled for cookie sessions.

## Secrets

- `RHLZ_SESSION_SECRET` is required in production (auto-generated and
  persisted 0600 to `.data/secret` when unset). No default secret is ever
  shipped; known placeholders are rejected.
- Env-only secrets: `GITHUB_WEBHOOK_SECRET` (webhook fail-closed without it),
  node agent keys, S3-style targets (future) — never in git, never in client
  code, never logged.

## Sandbox (multi-language)

`POST /api/run` executes guest code for js/ts, python, bash (restricted),
go, rust, ruby, php, c, cpp, java, csharp, sql — when the host toolchain
exists (otherwise a clear "runtime not installed" response). Guest code is
jailed: timeout, memory, pids, no-network default, disk + file-count caps,
non-root, dropped caps, no docker.sock, no `/proc` poking, output byte cap,
and a miner/abuse denylist (xmrig, stratum, nicehash, cryptonight, randomx,
coinhive, minergate, fork-bomb patterns, `curl|sh`, metadata IPs).

## SSRF & paths

- Download URLs are scheme+host allowlisted; loopback / RFC1918 / link-local /
  ULA / metadata ranges (IPv4 + IPv6) rejected, hostnames DNS-checked.
- Every user-supplied file path resolves inside the server's data directory
  (`..`, absolute, and percent-encoded traversal rejected); archives are
  zip-slip + symlink hardened.

## Verifying

`docs/SECURITY-LOOP.md` is the honest ledger (local static analysis, unit
tests, defensive checks). The repo never claims an external 50-round cloud
pentest.
