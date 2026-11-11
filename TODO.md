# LIFE RPG — TODO

## Remaining work (release verification)

- [ ] Verify `npm run typecheck` passes
- [ ] Verify `npm run build` passes
- [ ] Verify `npm test` passes (35 tests)
- [ ] Verify `npx playwright test` passes (6 journeys)
- [ ] Verify fresh installation and persistence after restart
- [ ] Verify backup, validation and restore
- [ ] Verify localhost-only access (no 0.0.0.0 exposure)
- [ ] Review `npm audit` findings and fix safe vulnerabilities
- [ ] Create Git milestone commits
- [ ] Produce final report with actual test results and known limitations

## Code quality

- [ ] Normalize mojibake `Â·` → `·` and corrupted punctuation across source,
  JSON, HTML, and docs (files are valid UTF-8; cosmetic only)
- [ ] Review `npm audit` (11 vulnerabilities, 4 high / 2 critical per earlier
  assessment) — document or fix safe items

## Optional enhancements

- [ ] Streaks module (optional, already in schema)
- [ ] Analytics dashboard refinements
- [ ] Additional AI provider types

## Documentation review

- [ ] Test every documented command (dev, build, start, Docker, typecheck, test)
- [ ] Document backup portability and AI credential recovery (see HANDOFF.md)
