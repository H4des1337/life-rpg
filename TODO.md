# LIFE RPG — TODO

## Release verification (complete — v1.0.2)

- [x] Verify `npm run typecheck` passes
- [x] Verify `npm run build` passes
- [x] Verify `npm test` passes (50 tests across 6 files)
- [x] Verify `npx playwright test` passes (6 journeys)
- [x] Verify fresh installation and persistence after restart
- [x] Verify backup, validation and restore
- [x] Verify localhost-only access (no 0.0.0.0 exposure)
- [x] Review `npm audit` findings (11 vulns, all dev/transitive — documented, not fixed)
- [x] Create Git milestone commits (v1.0.0, v1.0.1)
- [x] Create v1.0.2 tag on final release commit
- [x] Verify source ZIP from fresh extraction (npm ci, typecheck, build, test, E2E all PASSED)
- [x] Produce final report with actual test results and known limitations

## Critical fixes applied

- [x] Fix XP allocation application in activities.ts — corrected allocations now
  used for insert, apply, spillover, ledger, and reversal
- [x] Fix Docker networking — container binds 0.0.0.0 internally; host publishes
  127.0.0.1:3000:3000 only; LIFERPG_DOCKER=1 flag
- [x] Fix Docker frontend build — devDependencies included for Vite build
- [x] Fix Docker runtime workspace installation — copy apps/server/package.json
  before npm install --workspace=@liferpg/server
- [x] Fix .dockerignore — removed broad *.mjs exclusion blocking copy-migrations.mjs
- [x] Enforce native local-only binding in config.ts — non-loopback HOST rejected
  unless LIFERPG_DOCKER=1
- [x] Add config tests — 10 tests for native/Docker bind modes
- [x] Add progression regression tests — multi-allocation parity, diminishing +
  spillover, exact reversal, persisted vs transaction matching
- [x] Bump version metadata to 1.0.2 across all manifests + package-lock.json
- [x] Update CHANGELOG.md with v1.0.2 section
- [x] Create clean source ZIP (Z:\LIFE_RPG_WEB_SOURCE_v1.0.2.zip)
- [x] Verify source ZIP from fresh extraction

## Code quality

- [ ] Normalize mojibake `Â·` → `·` and corrupted punctuation across source,
  JSON, HTML, and docs (files are valid UTF-8; cosmetic only — not performed)
- [ ] `npm audit` — 11 vulnerabilities documented; none fixed (breaking changes
  required, local-only attack surface)

## Optional enhancements

- [ ] Streaks module (optional, already in schema)
- [ ] Analytics dashboard refinements
- [ ] Additional AI provider types

## Docker verification (not execution-tested — Docker not installed)

- [ ] docker compose build --no-cache — not executed (Docker not installed)
- [ ] docker compose up — not executed (Docker not installed)
- [ ] Container health check — not executed (Docker not installed)
- [ ] Host reachability via http://127.0.0.1:3000/api/health — not executed
- [ ] Host port restricted to 127.0.0.1 — configured in docker-compose.yml
- [ ] Data survives container recreation — not executed (Docker not installed)
