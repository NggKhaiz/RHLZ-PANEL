# RHLZ Panel — Intro

**Compact control plane for game servers and jailed code runtimes.**

RHLZ started as a straightforward observation: running a handful of game
servers usually means a tangle of tmux sessions, hand-edited properties files,
and one forgotten backup. The panel is the opposite — a single, quiet surface
where a Minecraft world, a Python bot, or a Go service all behave the same way:
create, start, watch the console, back up, stop.

The interface is deliberately glassy and calm: near-black ink, mint hairline
borders, one ember accent for anything destructive. No video, no autoplay,
nothing that moves unless you asked it to. Keyboard-first where it matters,
empty states that tell you what to do next, and an intro that lasts about a
second.

Under the hood the security story is the loud part:

- **Sessions** — httpOnly, short-lived, no localStorage tokens, no default
  secret anywhere (auto-generated and persisted 0600 if you skip the env var).
- **Two-factor** — optional TOTP with recovery codes, encrypted at rest.
- **Every path** — servers, files, backups, worlds, keys — is authorization-
  checked server-side, not client-side.
- **Guest code** — the sandbox runs non-root, capped on time/memory/processes,
  offline by default, with miner and abuse denylists.
- **Audit log** — auth, admin actions, destructive ops, all append-only.

## First run

1. Install (`bash install.sh`) or deploy (Docker/Compose/PaaS — see
   `docs/DEPLOYMENT.md`).
2. Sign in, then **Account → Two-Factor Authentication → Enable**. Save the
   recovery codes somewhere real.
3. Create your first server (Minecraft or an app runtime), open the console,
   and watch it stream.
4. Browse **Docs** (in-app) or `docs/` for the full walkthrough.

That is the whole product: servers you control, code you can trust to stay in
its box, and a UI that stays out of the way.

*© 2026 RHLZ. All rights reserved. · Upstream: MIT-licensed work by Jishnu.*
