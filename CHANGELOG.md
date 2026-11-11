# LIFE RPG — Changelog

## Unreleased

### Added
- WPF-parity enforcement: attribute XP = 2 × player XP at the validation gate
  and re-balanced after diminishing returns at activity creation time
- Diminishing returns now consistently applied to player XP and attribute/skill
  allocations (previously player XP only)
- Regression tests for progression invariants (5 new tests in modules.test.ts)
- 5 new Playwright E2E journeys: onboarding, activity approval, quest milestones,
  journal markdown + XSS sanitisation, inventory attachment + SHA-256,
  backup restore + safety snapshot
- Dockerfile (multi-stage, loopback-only, node:22-alpine)
- docker-compose.yml (publishes 127.0.0.1:3000:3000, named data volume)
- .dockerignore, .env.example
- Windows scripts: start-dev.ps1, start-prod.ps1, reset-e2e.ps1
- Documentation: ARCHITECTURE.md, DATABASE_SCHEMA.md, PROGRESSION_SYSTEM.md,
  AI_SYSTEM.md, BUILD_LOG.md, CHANGELOG.md, TODO.md, HANDOFF.md, README.md
- `LIFERPG_ALLOW_REMOTE_HOSTS` tightened: comma-separated allowlist instead of
  blanket on/off switch; loopback always allowed
- `ConfirmOptions.note` field + restore-specific confirmation text in Settings

### Changed
- E2E journeys now complete onboarding first (each test gets a fresh browser
  context); selectors use `.first()` where multiple buttons match
- Journal XSS check scoped to `.markdown script` (page has legitimate script tags)

### Fixed
- E2E `getByText('Lifetime XP')` strict-mode violation → unique subtitle text
- E2E "Log" button → "Log activity" (header button is `lg:hidden`; sidebar used on
  desktop)
- E2E "New entry" strict-mode violation → `.first()`
- E2E `getByText('local only')` → `{ exact: true }`
- E2E `getByText('proof.png')` → `{ exact: true }`
- E2E "Backups & Data" → `role="tab"` (Tabs component renders tabs, not buttons)
- E2E XSS script check → scoped to `.markdown`
- Typecheck error in CharacterArt.test.tsx (incomplete Appearance object)

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
