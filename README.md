# LIFE RPG Web

A complete, polished, persistent, local-first life-progression RPG web application.
Track your XP, levels, attributes, skills, quests, achievements, journal, inventory
and more — everything stays on your machine. No cloud, no telemetry, no browser
database as source of truth.

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Server:** Node.js + Fastify + TypeScript (esbuild-bundled)
- **Database:** SQLite via `better-sqlite3` with hand-written SQL migrations
- **Validation:** Zod schemas (shared between server and client)
- **Testing:** Vitest + React Testing Library + Playwright
- **Container:** Docker / Docker Compose (loopback-only)

## Local-first security (by design)

- Default bind: **127.0.0.1** — never `0.0.0.0`
- Docker publishes: **127.0.0.1:3000:3000** (localhost-only)
- Host-header and Origin protections reject non-loopback requests
- API keys encrypted at rest (AES-256-GCM)
- AI never writes progression values directly; domain validation gate + user approval
- Persistent data under `%LOCALAPPDATA%\LIFE_RPG_WEB` (configurable via `LIFERPG_DATA_DIR`)

## Quick start

### Development (Windows PowerShell)

```powershell
# Clone or open this folder, then:
.\start-dev.ps1
```

This starts the API server on `http://127.0.0.1:3000` and the Vite dev server on
`http://127.0.0.1:5173`.

### Production (Windows PowerShell)

```powershell
.\start-prod.ps1
```

Builds the frontend and server bundle, then starts the production server on
`http://127.0.0.1:3000`.

### Docker

```bash
docker compose up -d
```

Published on `http://127.0.0.1:3000` (loopback-only). Persistent data lives in the
`liferpg-data` named volume.

## Available commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server + web dev server (concurrently) |
| `npm run build` | Build web (Vite) + server (esbuild) |
| `npm start` | Start production server (`node apps/server/dist/index.js`) |
| `npm test` | Run unit + integration tests (Vitest) |
| `npm run typecheck` | TypeScript project check |
| `npx playwright test` | Run Playwright E2E journeys |
| `npm run data:dir` | Print the resolved data directory |

## Data directory

Default: `%LOCALAPPDATA%\LIFE_RPG_WEB` (Windows) or `~/.local/share/LIFE_RPG_WEB`
(Linux/macOS). Override with `LIFERPG_DATA_DIR`.

Contains:
- `database/liferpg.db` — SQLite database (source of truth)
- `backups/` — ZIP archives (manual + automatic safety snapshots)
- `settings/secret.key` — AES-256-GCM key for encrypted API keys
- `storage/` — inventory/journal/activity/character attachments

## Required modules

Profile, XP/levels, 7 seeded attributes, nested skill trees, decay, activity logging
with heuristic/AI proposals + approval, AI providers (Ollama / OpenAI-compatible,
optional), quests, achievements, optional streaks, analytics, journal, sticky notes,
inventory + real uploads, timeline, original chibi SVG character, backup/restore.

## Documentation

| Document | Contents |
|----------|----------|
| `ARCHITECTURE.md` | System design, stack, monorepo layout |
| `DATABASE_SCHEMA.md` | Tables, migrations, seeding |
| `PROGRESSION_SYSTEM.md` | XP formula, levels, decay, 2:1 attribute rule |
| `AI_SYSTEM.md` | AI providers, heuristic, validation gate |
| `BUILD_LOG.md` | Build notes, test results, known issues |
| `CHANGELOG.md` | Version history |
| `TODO.md` | Remaining work |
| `HANDOFF.md` | Operational handoff |
| `README.md` | This file |

## License

Private / internal use. Local-first by design.
