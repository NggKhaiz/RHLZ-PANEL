# RHLZ Panel — Stack Benchmark (Loop 3)

Scored before committing to the runtime. Axes weighted by what actually moves
this product: disk cap (128 MB hard / 20–50 MB soft), file cap (10k / <5k),
PaaS bind, glass-UI cost, sandbox-host quality, Alpine/CI build pain, and audit
surface.

| Axis | A: Node 20 + static UI | B: Go + embed.FS | C: Rust + static UI | D: Python + static UI |
|---|---|---|---|---|
| Disk footprint | 6/10 — prod node_modules ~45 MB (acceptable, <50 target) | 9/10 — single ~15 MB binary | 8/10 — single ~8–20 MB binary | 4/10 — interpreter + site-packages fat |
| File count | 6/10 — ~4.6k prod files | 9/10 — hundreds | 9/10 — hundreds | 4/10 — large stdlib tree |
| PaaS bind (`$PORT`) | 10/10 — first-class | 10/10 | 10/10 | 10/10 |
| Glass-UI cost | 10/10 — React/Vite/Tailwind + Framer already proven | 5/10 — hand-build or embed a JS framework anyway | 4/10 — same, slower iteration | 7/10 |
| Sandbox host quality | 8/10 — Docker + local spawn, worker threads | 7/10 — needs containers; fewer libs for guest runtimes | 6/10 | 8/10 — CPython as a guest runtime is native |
| Alpine / CI build pain | 8/10 — `--no-optional` avoids native addons | 9/10 | 6/10 — rust toolchain weight in CI | 7/10 |
| Audit surface | 7/10 — large dep tree, but auditable + lockfile | 9/10 — tiny surface | 10/10 — memory safe | 5/10 |
| **Total** | **55/70** | **58/70** | **53/70** | **45/70** |

## Verdict — **A: Node 20 + static UI (the current stack, rebranded RHLZ)**

Go (B) edges A on disk/audit, but the gap is small (58 vs 55) and the product's
entire capability set — dockerode, ssh2/SFTP, Socket.IO realtime, prismarine-nbt,
guest runtime spawning, the Vite glass UI — is already built and tested on Node.
A rewrite would forfeit the 20+ features we already ship and blow the disk/file
targets during transition. **Decision: keep Node 20 + TypeScript + Vite; do not
create Go/Rust/Python spikes (deleted = never created).** Revisit only if a
blocking discovery appears in a future checkpoint.

Production install measured at **45–49 MB and ~4.6k files** (`npm install
--omit=dev --no-optional`), inside the 20–50 MB soft target.
