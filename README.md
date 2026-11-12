# LIFE RPG

**A local-first life-progression RPG built as an independent student software project.**

LIFE RPG turns personal development into a progression system. Log real activities, build skills, complete quests, and track your growth through experience points, attributes, levels, and achievements.

The goal is to make progress visible without turning personal data into a cloud service: the application is designed to run on your own computer, with SQLite as its persistent source of truth.

> **Project status:** Active development. The core application, local persistence, and Docker deployment have been implemented and manually exercised. Features and documentation may continue to evolve.

## What it does

- **Character progression** — a player profile, levels, lifetime XP, and attributes.
- **Skill trees** — organize skills into nested branches and develop them over time.
- **Activity logging** — record real-world activities and review proposed progression changes before approving them.
- **Quests and achievements** — define goals and recognize milestones.
- **Journal and notes** — keep personal reflections and supporting context alongside progression.
- **Inventory and attachments** — organize items and associated uploads.
- **Analytics and timeline** — review activity and progression over time.
- **Backups and restore** — create local safety snapshots of application data.

The progression system is intended to reward consistent, meaningful effort rather than simply counting time spent in the application.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Fastify, TypeScript |
| Database | SQLite with `better-sqlite3` |
| Validation | Zod, with shared schemas |
| Build | npm workspaces, Vite, esbuild |
| Tests | Vitest, React Testing Library, Playwright |
| Deployment | Docker and Docker Compose |

The codebase is organized as a TypeScript monorepo:

```text
apps/
  web/          React application
  server/       Fastify API and persistence layer
packages/       Shared types, schemas, and domain logic
scripts/        Development and utility scripts
```

## Run locally

### Prerequisites

- Node.js 22 or a compatible Node.js 22 release
- npm
- Windows PowerShell for the included Windows helper scripts

### Development

Clone the repository, enter the project directory, and install dependencies:

```powershell
git clone https://github.com/H4des1337/life-rpg.git
cd life-rpg
npm ci
npm run dev
```

The development setup starts the API and Vite development server. By default:

- Web application: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- API server: [http://127.0.0.1:3000](http://127.0.0.1:3000)

On Windows, the repository also includes helper scripts:

```powershell
.\start-dev.ps1
```

For a local production build and run:

```powershell
.\start-prod.ps1
```

### Docker

Docker is an alternative way to run the production application:

```bash
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000).

The Compose configuration publishes the service on `127.0.0.1:3000`, restricting host access to the local machine. The application listens on the container interface internally so Docker port forwarding can reach it.

Docker stores persistent application data in the named volume `liferpg-data`, mounted at `/data/liferpg` inside the container. Stopping or recreating the container does not remove that volume. **Do not use `docker compose down -v` unless you intentionally want to delete the application's persistent volume.**

## Data storage and privacy

LIFE RPG is designed around local ownership of personal data:

- SQLite is the persistent source of truth; the browser is not the primary database.
- In a native run, the default data directory is `%LOCALAPPDATA%\LIFE_RPG_WEB` on Windows or `~/.local/share/LIFE_RPG_WEB` on Linux and macOS.
- Set `LIFERPG_DATA_DIR` to choose a different data directory.
- In Docker, the configured data directory is `/data/liferpg` and should be backed by the Compose volume.
- The default Docker port publication is loopback-only. Do not expose the service publicly without reviewing and strengthening its security configuration.

The data directory contains the SQLite database, backups, settings, and uploaded application files.

### Optional AI integrations

Activity analysis supports a built-in heuristic path as well as optional provider integrations, including Ollama and OpenAI-compatible endpoints. The heuristic path does not require a hosted AI service.

If an external AI provider is configured and used, relevant activity/context submitted for analysis is sent to that configured endpoint. The provider's own processing and retention policies then apply. Review the provider configuration and its privacy terms before enabling it, especially when using personal information. AI-generated progression is treated as a proposal for user review rather than an automatic write to progression values.

## Useful commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the web and API development servers |
| `npm run build` | Build the frontend and backend |
| `npm start` | Start the production server bundle |
| `npm test` | Run the Vitest test suite |
| `npm run typecheck` | Run the TypeScript project check |
| `npm run test:e2e` | Run the Playwright end-to-end suite |
| `npm run data:dir` | Print the resolved application data directory |

## Project documentation

Additional engineering notes are maintained in the repository:

- [Architecture](ARCHITECTURE.md) — system design and monorepo layout.
- [Database schema](DATABASE_SCHEMA.md) — tables and migrations.
- [Progression system](PROGRESSION_SYSTEM.md) — XP, levels, decay, and attribute progression.
- [AI system](AI_SYSTEM.md) — provider integrations, heuristic analysis, and validation.
- [Build log](BUILD_LOG.md) — implementation and build notes.
- [Changelog](CHANGELOG.md) — version history.
- [TODO](TODO.md) — planned work and known follow-ups.
- [Handoff](HANDOFF.md) — operational notes.

## Motivation

LIFE RPG is an exploration of how game-design ideas can support real-world self-development, combined with practical engineering work in full-stack TypeScript, data modeling, local persistence, API design, and containerized deployment.

It is being developed iteratively: build a working system, use it, test the important paths, and improve the design based on what breaks or feels useful.

## License

**Proprietary — All Rights Reserved.**

Copyright (c) 2026 Rishab Raju. This repository is publicly accessible for viewing and evaluation only. No permission is granted to copy, modify, distribute, or otherwise reuse the software without prior written permission from the copyright holder. See [LICENSE](LICENSE) for the full notice.
