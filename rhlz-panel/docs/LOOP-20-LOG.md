# LOOP-20 progress

| n | title | files | tests | pentest-slice | leftover |
|---|---|---|---|---|---|
| 1 | One-click install.sh --yes | install.sh | bash -n, --help | no weak secret | none |
| 2 | PM2 + .env merge + update/uninstall | install.sh update.sh uninstall.sh one-click.sh | bash -n | merge-only .env | none |
| 3 | node.sh + compose | public/node.sh docker-compose.yml | bash -n | CORS deny | none |
| 4 | isMain port version crash vite | server.ts brand.ts api.ts vite | npm test | health public | none |
| 5 | env bleed scrub | local.ts | hmac/scrub test | sandbox denylist | none |
| 6 | RCON webhook Google | docker.ts api.ts auth.ts | grep + tests | query secret gone | none |
| 7 | chmod UID HMAC | docker.ts hmac.ts node.sh | hmac tests | HMAC reopened | none |
| 8 | PaaS docs one-liner | .env.example DocsPage SETUP README | docs | CSP default-on | none |
| 9 | software.json catalog | software.json catalog.ts CreateServer | catalog test | unknown type 400 | none |
| 10 | jarDownloader sources | jarDownloader.ts | ssrf tests | SSRF on downloads | quilt/neoforge fall back paper if official jar missing |
| 11 | templates + argv + poller | templates/ argv.ts CreateServer local.ts | parseArgv test | paths tests | servers.ts still large |
| 12 | pentest A authz | PENTEST.md | csrf tests | IDOR still 403 | none |
| 13 | pentest B extract/sandbox | extract miner sandbox | existing | extract-zip residual | extract-zip GHSA |
| 14 | split servers.ts | playit honesty in routes | lint | requireAuth still on router | god-file not fully split (risk) |
| 15 | UX categories Playit | CreateServer PlayitTunnel | lint | tokens masked | 4-family tabs via catalog |
| 16 | disk stats quiet docker | diskUsage.ts docker.ts | lint | stats 403 via requireServerAccess | none |
| 17 | pocketmine + java app | software.json | catalog | bind+caps unchanged | deno/bun omitted |
| 18 | power-action 409 | power.test.ts | npm test | lockout tests | none |
| 19 | debug sweep | greps | lint test | ledger audit | none |
| 20 | final pentest + seal | CHANGELOG LOOP log | full gates | residual extract-zip | 20/20 |
