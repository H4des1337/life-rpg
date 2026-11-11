# LIFE RPG — Changelog

# LIFE RPG — Changelog

## 1.0.2

### Added
- Clean source distribution ZIP (`LIFE_RPG_WEB_SOURCE_v1.0.2.zip`) with buildable
  source excluding node_modules, dist, runtime data, and secrets

### Fixed
- Dockerfile runtime stage: copy `apps/server/package.json` before
  `npm install --workspace=@liferpg/server --omit=dev` so npm recognizes the
  workspace (previously failed with "No workspaces found")
- `.dockerignore`: removed broad `*.mjs` exclusion that blocked
  `apps/server/scripts/copy-migrations.mjs`; replaced with precise exclusions
  for node_modules, dist, databases, WAL/SHM files, backups, secrets, and
  test artifacts while preserving all source files, manifests, and build scripts
- Version metadata bumped to 1.0.2 across root, server, and web package
  manifests and package-lock.json

### Security
- Docker networking preserved: container binds 0.0.0.0 internally
  (LIFERPG_DOCKER=1); host publication remains 127.0.0.1:3000:3000 only
- Native execution binds exclusively to 127.0.0.1; non-loopback HOST rejected
  unless LIFERPG_DOCKER=1

## 1.0.1

### Added
- XP allocation fix: corrected allocations used for activity_allocations insert,
  target application, skill spillover, XP ledger, and exact reversal
- Docker networking distinction: container binds 0.0.0.0 internally, host
  publishes 127.0.0.1:3000:3000 only; LIFERPG_DOCKER=1 flag
- Docker frontend build: devDependencies (Vite, @vitejs/plugin-react) included
  in web-build stage
- Native local-only binding enforcement in config.ts: non-loopback HOST rejected
  unless LIFERPG_DOCKER=1
- 7 new progression regression tests (multi-allocation parity, diminishing +
  spillover, exact reversal, persisted vs transaction matching)
- 10 new config tests for native/Docker bind modes

### Changed
- BUILD_LOG, TODO, README, ARCHITECTURE, HANDOFF updated with Docker networking
  distinction and mojibake status

### Security
- `LIFERPG_ALLOW_REMOTE_HOSTS` changed from blanket allow-all to named allowlist
- Documented Docker networking exception: 127.0.0.1:3000:3000 only

## 1.0.0 (initial release)

- Complete local-first LIFE RPG web application
- React + TypeScript + Vite + Tailwind frontend
- Node/Fastify + TypeScript server with SQLite
- Profile, XP/levels, 7 attributes, nested skill trees, decay, quests,
  achievements, journal, inventory, backups, AI providers (optional)
- Original chibi SVG character art
