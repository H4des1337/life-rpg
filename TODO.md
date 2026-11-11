# LIFE RPG — TODO

## Release verification (complete)

- [x] Verify `npm run typecheck` passes
- [x] Verify `npm run build` passes
- [x] Verify `npm test` passes (50 tests across 6 files)
- [x] Verify `npx playwright test` passes (6 journeys)
- [x] Verify fresh installation and persistence after restart
- [x] Verify backup, validation and restore
- [x] Verify localhost-only access (no 0.0.0.0 exposure)
- [x] Review `npm audit` findings (11 vulns, all dev/transitive — documented, not fixed)
- [x] Create Git milestone commits (v1.0.0)
- [x] Create v1.0.1 patch tag after second-pass fixes
- [x] Produce final report with actual test results and known limitations

## Critical fixes applied (v1.0.1)

- [x] Fix XP allocation application in activities.ts — corrected allocations now
  used for insert, apply, spillover, ledger, and reversal
- [x] Fix Docker networking — container binds 0.0.0.0 internally, host publishes
  127.0.0.1:3000:3000 only
- [x] Fix Docker frontend build — devDependencies included for Vite build
- [x] Enforce native local-only binding in config.ts — non-loopback HOST rejected
  unless LIFERPG_DOCKER=1
- [x] Add config tests — 10 tests for native/Docker bind modes
- [x] Add progression regression tests — 7 new tests for multi-allocation parity,
  diminishing + spillover, exact reversal, persisted vs transaction matching

## Code quality

- [ ] Normalize mojibake `Â·` → `·` and corrupted punctuation across source,
  JSON, HTML, and docs (files are valid UTF-8; cosmetic only — not performed)
- [ ] `npm audit` — 11 vulnerabilities documented; none fixed (breaking changes
  required, local-only attack surface)

## Optional enhancements

- [ ] Streaks module (optional, already in schema)
- [ ] Analytics dashboard refinements
- [ ] Additional AI provider types

## Docker verification (not execution-tested)

- [ ] docker compose build --no-cache — not executed (Docker not installed)
- [ ] docker compose up — not executed (Docker not installed)
- [ ] Container health check — not executed (Docker not installed)
- [ ] Host reachability via http://127.0.0.1:3000/api/health — not executed
- [ ] Host port restricted to 127.0.0.1 — configured in docker-compose.yml
- [ ] Data survives container recreation — not executed (Docker not installed)
