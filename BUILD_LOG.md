# LIFE RPG — Build Log

## E2E test results

All 6 Playwright journeys pass against a fresh production build on `127.0.0.1:3000`.

| # | Journey | Result |
|---|---------|--------|
| 1 | Onboarding creates the local profile | PASSED |
| 2 | Activity analysis proposed, editable, approved | PASSED |
| 3 | Quest milestones drive progress and completion | PASSED |
| 4 | Journal entry renders sanitized markdown (XSS blocked) | PASSED |
| 5 | Inventory item accepts real attachment + SHA-256 integrity | PASSED |
| 6 | Backup restore keeps catalog + safety snapshot | PASSED |

Test command: `PLAYWRIGHT_BROWSERS_PATH=Z:\ms-playwright npx playwright test`
(Chromium installed at `Z:\ms-playwright` due to limited C: drive space.)

## Unit / integration test results

`npm test` — 6 files, 50 tests, all passing (verified both in working project and fresh-extracted source ZIP):

| File | Tests |
|------|-------|
| `apps/server/test/modules.test.ts` | 20 (quest milestones, XP ledger/reversal, decay, certifications, attachments, backup round-trip, progression invariants, multi-allocation parity, diminishing + spillover, exact reversal) |
| `apps/server/test/api.test.ts` | 4 |
| `apps/server/test/config.test.ts` | 10 (native loopback enforcement, Docker bind host, HOST rejection) |
| `apps/web/src/lib/format.test.ts` | 5 |
| `apps/web/src/components/ui.test.tsx` | 7 |
| `apps/web/src/components/CharacterArt.test.tsx` | 4 |

## Source ZIP verification

`Z:\LIFE_RPG_WEB_SOURCE_v1.0.2.zip` (289,192 bytes) extracted to temp directory:

| Check | Result |
|-------|--------|
| npm ci | PASSED |
| npm run typecheck | PASSED |
| npm run build | PASSED |
| npm test | 50/50 PASSED |
| npx playwright test | 6/6 PASSED |
| No node_modules in ZIP | VERIFIED |
| No dist directories in ZIP | VERIFIED |
| No .env/secrets in ZIP | VERIFIED |
| No databases in ZIP | VERIFIED |
| Required directories present | VERIFIED (apps/web, apps/server, packages/domain, packages/shared) |
| Required manifests present | VERIFIED (all 6 package.json + root package-lock.json) |
| Migrations present | VERIFIED (apps/server/migrations/001_init.sql) |
| Build scripts present | VERIFIED (scripts/copy-migrations.mjs, etc.) |

## Docker configuration

- Native execution: binds exclusively to `127.0.0.1` (enforced by `config.ts`)
- Docker container: binds to `0.0.0.0` internally so Docker bridge forwarding works
- Docker host publication: `127.0.0.1:3000:3000` only (localhost-only)
- `LIFERPG_DOCKER=1` flag relaxes native loopback-only restriction inside containers
- Docker build not verified on this machine (Docker not installed); configuration reviewed
- Dockerfile runtime stage fixed: `apps/server/package.json` copied before workspace install
- .dockerignore fixed: removed broad `*.mjs` exclusion blocking `copy-migrations.mjs`

## Known issues / notes

1. Playwright Chromium is installed at `Z:\ms-playwright` (not default location)
   because C: drive had insufficient free space. Set
   `PLAYWRIGHT_BROWSERS_PATH=Z:\ms-playwright` when running `npx playwright test`.

2. Source contains mojibake `Â·` (double-encoded middle dot) in several files.
   Files are valid UTF-8 but display corrupted punctuation. Cosmetic only — does
   not affect functionality. Global scan/replacement not performed.

3. `npm audit` reports 11 vulnerabilities (5 moderate, 4 high, 2 critical) — all
   in dev/transitive dependencies requiring `--force` (breaking changes). App is
   local-only with no public attack surface. Documented, not fixed.

4. Docker build/run could not be verified on this machine (Docker not installed).
   Dockerfile and docker-compose.yml are configured correctly but not
   execution-tested.

## Commands verified (all executed successfully)

- `npm run typecheck` → passes (no errors)
- `npm run build` → passes (web ~1.03 MB, server bundle ~203 KB)
- `npm test` → 50 passed across 6 files
- `npx playwright test` → 6 passed (all E2E journeys)
- `.\start-dev.ps1` → dev server on 127.0.0.1:3000 + 5173
- `.\start-prod.ps1` → build + production server on 127.0.0.1:3000
- `docker compose up -d` → not executed (Docker not installed on this machine)

## Source ZIP verified from fresh extraction

- `Z:\LIFE_RPG_WEB_SOURCE_v1.0.2.zip` → npm ci, typecheck, build, test, E2E all PASSED

## Release verification (Priority 8)

| Check | Result |
|-------|--------|
| typecheck | PASSED |
| build | PASSED |
| unit + integration tests | 50/50 PASSED |
| E2E journeys | 6/6 PASSED |
| Source ZIP (fresh extraction: ci, typecheck, build, test, E2E) | ALL PASSED |
| Fresh install + persistence after restart | PASSED |
| Backup, validate, restore | PASSED (E2E journey 6) |
| Localhost-only access | PASSED (health reports localOnly: true) |
| npm audit review | 11 vulns documented (all dev/transitive, --force breaking) |
| Git milestone commits | Created (v1.0.0, v1.0.1 tags) |
| XP allocation fix (activities.ts) | VERIFIED — corrected allocations used throughout |
| Docker networking (0.0.0.0 container, 127.0.0.1 host) | CONFIGURED — not execution-tested |
| Native loopback enforcement (config.ts) | VERIFIED — 10 config tests pass |
| Version metadata (1.0.2) | VERIFIED across all manifests + lockfile |
