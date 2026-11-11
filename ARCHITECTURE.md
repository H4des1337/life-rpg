# LIFE RPG — Architecture

## Overview

LIFE RPG is a local-first, single-user desktop-style web application. The frontend
(React + Vite + Tailwind) communicates with a local API server (Node.js + Fastify)
over HTTP. All data lives in a SQLite database on the local filesystem. Nothing is
ever sent to a remote service unless the user explicitly configures an AI provider.

## Monorepo layout (npm workspaces)

```
/apps/web            — React frontend (Vite, Tailwind)
/apps/server         — Node/Fastify API server (esbuild-bundled)
/packages/domain     — Pure TS: progression, decay, proficiency, heuristic, validation
/packages/shared     — Zod schemas shared by server and client
```

## Server architecture

```
buildApp()  →  Fastify instance
  ├── onRequest hook: loopback host validation + Origin check
  ├── onSend hook: security headers (CSP, X-Frame-Options, etc.)
  ├── Routes:
  │   ├── /api/*             — REST API (activities, taxonomy, quests, journal, inventory, files, backups, settings, AI, profile)
  │   └── /*                 — Static web SPA (served via @fastify/static)
  └── SQLite (better-sqlite3) — single file, WAL mode, hand-written migrations
```

### Security boundary

- Default `HOST=127.0.0.1` (never `0.0.0.0`)
- `onRequest` hook rejects requests whose `Host` header is not loopback unless
  `LIFERPG_ALLOW_REMOTE_HOSTS` lists specific additional hostnames (comma-separated)
- `Origin` header must be a loopback `http(s)://` URL or the request is rejected with 403
- `trustProxy: false` — no X-Forwarded-* header trust
- Content-Security-Policy restricts scripts, styles, and connections to same-origin

## Domain engine (`@liferpg/domain`)

Pure, side-effect-free TypeScript shared by server and browser:

- **`progression.ts`** — `XP_required(L) = 500 + 0.98 × (L−1)²`, level lookup, `getState()`
- **`proficiency.ts`** — capacity ceiling, decay debt, `applyXp()`, `applyManualProficiency()`, idempotent `evaluateDecay()`
- **`heuristic.ts`** — offline activity analysis: keyword matching, XP estimate, 2× attribute rule, 35% skill spillover
- **`diminishing.ts`** — 24h window, step 0.35, floor 0.25, activity fingerprinting
- **`validation.ts`** — gate between AI/heuristic/manual suggestions and persistence; enforces WPF parity (attribute XP = 2 × player XP)
- **`weights.ts`** — `effectiveCondition()`: weighted parent proficiency from children

## Data persistence

- SQLite via `better-sqlite3` (synchronous, single-writer)
- Schema: hand-written SQL migration `001_init.sql`
- Migrations run on server startup
- Seeded data: 7 attributes, inventory categories, built-in achievements
- Attachments: stored as files under `storage/<category>/`, SHA-256 verified, soft-deleted (file retained)
- Backups: ZIP via `adm-zip`, includes DB + settings + attachments + manifest

## Key invariants

| Invariant | Where enforced |
|-----------|---------------|
| `attribute XP = 2 × player XP` | `validation.ts` + `activities.ts` (post-diminishing rebalance) |
| Diminishing returns (step 0.35/floor 0.25/24h) | `activities.ts` (applied to player + attribute/skill XP) |
| Skill → sub-attribute spillover = 35% | `activities.ts` (award + reversal) |
| Reversal exactly undoes award (incl. spillover) | `activities.ts` `reverseActivity()` |
| Decay is idempotent (anchor + appliedIntervals) | `proficiency.ts` `evaluateDecay()` |
| Certifications never decay | `taxonomy.ts` (excludes `is_certification=1`) |
| Lifetime XP never decreases | `proficiency.ts` (debt model, not deletion) |
| Loopback-only binding | `config.ts` (default `127.0.0.1`) + `app.ts` (host validation) |

## AI architecture

AI is optional and never writes progression directly:

1. User opts in per provider (Ollama or OpenAI-compatible)
2. API keys encrypted at rest (AES-256-GCM, key in `settings/secret.key`)
3. AI suggestion → `validateAnalysis()` gate → user approves in UI → server applies
4. Heuristic fallback always available when AI is unavailable or declined

See `AI_SYSTEM.md` for details.

## Docker

- Multi-stage build: web-build → server-build → runner
- Runner image is `node:22-alpine` with runtime deps only
- Container binds `127.0.0.1:3000`; compose publishes `127.0.0.1:3000:3000`
- Data persisted via `liferpg-data` named volume mounted at `/data/liferpg`
