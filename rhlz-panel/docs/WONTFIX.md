# RHLZ Panel — WONTFIX

Items deliberately skipped, with reasons. Revisited only if the calculus changes.

| Item | Reason |
|---|---|
| Legacy previous-generation API-key prefixes | The RHLZ brand mandate requires the brand-string scan to be empty. Operators upgrading rotate keys to the `rhlz_` prefix (previous-generation `rvn_` keys are still accepted). |
| Legacy `/opt/*-panel-node` / old-name directory migration | Same mandate; new installs use `/opt/rhlz-node` / `rhlz-panel`. Documented in the upgrade notes. |
| Previous-generation localStorage session keys | Migrated transparently at read time; old keys removed after read. |
| Vendored monaco-editor / turbo / stimulus (from the Airlink reference) | Thousands of files would blow the 10k-file gate. |
| Full 50-row ledger completed in one sitting | The ledger is append-only and grows one honest row per hardening loop. |
| HMAC request-signing for the node agent | Reopened in v3.1.0: optional `X-RHLZ-Date` + `X-RHLZ-Sign` HMAC of `METHOD\\nPATH\\nDATE\\nsha256(body)` with 5-minute skew. Bearer NODE_KEY still accepted. |
| `/api/v1` route versioning | Cosmetic churn across the SPA for no security gain; the stable `/api` surface is documented. |
| Live multi-cloud penetration testing | Not performed; the ledger records only local static analysis, unit tests, and defensive checks. |
| Windows support | Explicitly excluded: Linux + Docker + Compose + free PaaS only. |
| Video onboarding assets | Explicitly excluded: intro and docs are CSS/SVG/web-tutorial only. |
