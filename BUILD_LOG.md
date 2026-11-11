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

`npm test` — 5 files, 35 tests, all passing:

| File | Tests |
|------|-------|
| `apps/server/test/modules.test.ts` | 15 (quest milestones, XP ledger/reversal, decay, certifications, attachments, backup round-trip, progression invariants) |
| `apps/server/test/api.test.ts` | 4 |
| `apps/web/src/lib/format.test.ts` | 5 |
| `apps/web/src/components/ui.test.tsx` | 7 |
| `apps/web/src/components/CharacterArt.test.tsx` | 4 |

## Typecheck

`npm run typecheck` — passes with no errors.

## Production build

`npm run build` — passes. Web bundle ~1.03 MB (chunk size warning only).

## Known issues / notes

1. Playwright Chromium is installed at `Z:\ms-playwright` (not default location)
   because C: drive had insufficient free space. Set
   `PLAYWRIGHT_BROWSERS_PATH=Z:\ms-playwright` when running `npx playwright test`.

2. A manual production server was previously running on port 3102 with data dir
   `C:\Users\nrish\AppData\Local\Temp\opencode\liferpg-ui-test-4`. Stop it before
   final port-3000 checks.

3. `LIFERPG_ALLOW_REMOTE_HOSTS` is now a comma-separated allowlist (not a blanket
   on/off switch). Loopback is always allowed. Default: no remote hosts.

4. Source contains mojibake `Â·` (double-encoded middle dot) in several files.
   Files are valid UTF-8 but display corrupted punctuation. Global scan/replacement
   pending — does not affect functionality.

5. `npm audit` reports vulnerabilities (see CHANGELOG.md / audit review). Most are
   transitive dev-dependency issues; none are directly exploitable in local-only
   mode.

## Commands verified (all executed successfully)

- `npm run typecheck` → passes (no errors)
- `npm run build` → passes (web ~1.03 MB, server bundle ~203 KB)
- `npm test` → 35 passed across 5 files
- `npx playwright test` → 6 passed (all E2E journeys)
- `.\start-dev.ps1` → dev server on 127.0.0.1:3000 + 5173
- `.\start-prod.ps1` → build + production server on 127.0.0.1:3000
- `docker compose up -d` → container on 127.0.0.1:3000 (Dockerfile created)

## Release verification (Priority 6)

| Check | Result |
|-------|--------|
| typecheck | PASSED |
| build | PASSED |
| unit + integration tests | 35/35 PASSED |
| E2E journeys | 6/6 PASSED |
| Fresh install + persistence after restart | PASSED |
| Backup, validate, restore | PASSED (E2E journey 6) |
| Localhost-only access | PASSED (health reports localOnly: true) |
| npm audit review | 11 vulns documented (all dev/transitive, --force breaking) |
| Git milestone commits | Created (v1.0.0 tag) |
