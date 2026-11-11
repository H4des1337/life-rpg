# LIFE RPG — Database Schema

All tables are created by the hand-written migration `apps/server/migrations/001_init.sql`.
SQLite via `better-sqlite3`, WAL mode. The database file is the source of truth —
no browser database is used for persistent data.

## Core tables

### player_profile
One row (`id = 'profile-primary'`). Tracks lifetime XP, level, last activity, creation time.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `'profile-primary'` |
| name | TEXT | Character name |
| lifetime_xp | INTEGER | Total XP earned |
| level | INTEGER | Current computed level |
| last_activity_at | TEXT | ISO timestamp |
| created_at | TEXT | ISO timestamp |

### player_progression
Level-up history. One row per level reached.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| profile_id | TEXT | `'profile-primary'` |
| level | INTEGER | Level reached |
| lifetime_xp | INTEGER | Cumulative XP at that level |
| xp_required | INTEGER | XP required for that level |
| kind | TEXT | `'level_up'` or `'correction'` |
| activity_id | TEXT | FK to activities (nullable) |
| recorded_at | TEXT | ISO timestamp |

### xp_transactions
Immutable ledger of every XP change (award, reversal, manual).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| activity_id | TEXT | FK to activities (nullable) |
| target_type | TEXT | `player` \| `attribute` \| `sub_attribute` \| `skill` |
| target_id | TEXT | Target row id |
| delta | INTEGER | Signed XP change |
| balance_before | INTEGER | Balance before |
| balance_after | INTEGER | Balance after |
| reason | TEXT | Human-readable reason |
| kind | TEXT | `award` \| `reversal` \| `manual` |
| created_at | TEXT | ISO timestamp |

### activities
Approved or reversed activity log entries.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT | Activity title |
| description | TEXT | Description |
| category | TEXT | Category |
| occurred_at | TEXT | ISO timestamp |
| duration_minutes | INTEGER | Nullable |
| difficulty | INTEGER | 1–5 |
| effort | INTEGER | 1–5 |
| significance | INTEGER | 1–5 |
| relevance | INTEGER | 1–5 |
| fingerprint | TEXT | Activity fingerprint for diminishing |
| base_xp | INTEGER | Pre-diminishing player XP |
| multiplier | INTEGER | Diminishing multiplier applied |
| player_xp | INTEGER | Final player XP awarded |
| status | TEXT | `approved` \| `reversed` |
| source | TEXT | `heuristic` \| `ai` \| `manual` |
| provider_name | TEXT | AI provider name |
| model_name | TEXT | AI model name |
| classification | TEXT | Activity classification |
| reasoning | TEXT | Analysis reasoning |
| confidence | REAL | 0–1 |
| is_milestone | INTEGER | 0/1 |
| quest_id | TEXT | Nullable FK |
| created_at | TEXT | ISO timestamp |
| reversed_at | TEXT | Nullable |
| reversal_reason | TEXT | Nullable |

### activity_allocations
Per-activity XP allocation to attributes/sub-attributes/skills.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| activity_id | TEXT | FK to activities |
| target_type | TEXT | `attribute` \| `sub_attribute` \| `skill` |
| target_id | TEXT | Target row id |
| target_name | TEXT | Human name |
| xp | INTEGER | XP awarded (post-diminishing) |
| weight | REAL | Normalized weight |
| rationale | TEXT | Why this target |
| confidence | REAL | 0–1 |

### attributes
Seven seeded attribute domains.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID (e.g. `attr-competence`) |
| key | TEXT | Slug (e.g. `competence`) |
| name | TEXT | Display name |
| description | TEXT | |
| color | TEXT | Hex color |
| weight | REAL | Blending weight |
| sort_order | INTEGER | |
| is_core | INTEGER | 0/1 |
| lifetime_xp | INTEGER | |
| proficiency | INTEGER | 0–100 effective |
| peak_proficiency | INTEGER | 0–100 peak |
| created_at | TEXT | ISO timestamp |

### sub_attributes
Branches beneath attributes. Can have decay config.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| attribute_id | TEXT | FK to attributes |
| name | TEXT | |
| description | TEXT | |
| weight | REAL | |
| sort_order | INTEGER | |
| is_certification | INTEGER | 0/1 |
| lifetime_xp | INTEGER | |
| proficiency | INTEGER | 0–100 |
| peak_proficiency | INTEGER | 0–100 |
| debt | INTEGER | Decay debt below capacity |
| last_practice_at | TEXT | Nullable |
| decay_enabled | INTEGER | 0/1 |
| decay_grace_days | INTEGER | |
| decay_interval_days | INTEGER | |
| decay_rate | INTEGER | Points per interval |
| decay_minimum | INTEGER | Floor proficiency |
| recovery_per_xp | REAL | Debt recovered per XP |
| decay_anchor_at | TEXT | Nullable |
| decay_applied_intervals | INTEGER | |
| last_decay_at | TEXT | Nullable |
| created_at | TEXT | ISO timestamp |

### skills
Nested skill trees under sub-attributes.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| parent_skill_id | TEXT | Nullable FK to skills |
| sub_attribute_id | TEXT | Nullable FK to sub_attributes |
| name | TEXT | |
| description | TEXT | |
| weight | REAL | |
| sort_order | INTEGER | |
| is_certification | INTEGER | 0/1 (never decays) |
| lifetime_xp | INTEGER | |
| proficiency | INTEGER | 0–100 |
| peak_proficiency | INTEGER | 0–100 |
| debt | INTEGER | Decay debt |
| last_practice_at | TEXT | Nullable |
| decay_enabled | INTEGER | 0/1 |
| decay_grace_days | INTEGER | |
| decay_interval_days | INTEGER | |
| decay_rate | INTEGER | |
| decay_minimum | INTEGER | |
| recovery_per_xp | REAL | |
| decay_anchor_at | TEXT | Nullable |
| decay_applied_intervals | INTEGER | |
| last_decay_at | TEXT | Nullable |
| created_at | TEXT | ISO timestamp |

### decay_events
Audit log of decay applications.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| target_type | TEXT | `sub_attribute` \| `skill` |
| target_id | TEXT | |
| target_name | TEXT | |
| intervals | INTEGER | Intervals applied |
| points_removed | REAL | Proficiency points removed |
| proficiency_after | REAL | |
| applied_at | TEXT | ISO timestamp |

### proficiency_history
Snapshot of proficiency over time.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| target_type | TEXT | |
| target_id | TEXT | |
| target_name | TEXT | |
| lifetime_xp | INTEGER | |
| proficiency | INTEGER | |
| peak_proficiency | INTEGER | |
| activity_id | TEXT | Nullable |
| recorded_at | TEXT | ISO timestamp |

### attribute_history
Snapshot of attribute condition after child practice.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| attribute_id | TEXT | FK to attributes |
| lifetime_xp | INTEGER | |
| proficiency | INTEGER | |
| peak_proficiency | INTEGER | |
| activity_id | TEXT | Nullable |
| recorded_at | TEXT | ISO timestamp |

### quests

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT | |
| description | TEXT | |
| category | TEXT | |
| target_date | TEXT | Nullable |
| progress | INTEGER | 0–100 |
| status | TEXT | `active` \| `paused` \| `completed` \| `abandoned` |
| completed_at | TEXT | Nullable |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### quest_milestones

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| quest_id | TEXT | FK to quests |
| title | TEXT | |
| done | INTEGER | 0/1 |
| sort_order | INTEGER | |

### quest_attributes / quest_skills

Junction tables linking quests to attributes/skills.

### journal_entries

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT | |
| body | TEXT | Markdown (sanitised on render) |
| category | TEXT | |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### sticky_notes

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| journal_id | TEXT | Nullable FK |
| title | TEXT | |
| body | TEXT | |
| x | INTEGER | Canvas position |
| y | INTEGER | Canvas position |
| width | INTEGER | |
| height | INTEGER | |
| color | TEXT | Hex |
| collapsed | INTEGER | 0/1 |
| hidden | INTEGER | 0/1 |
| z_index | INTEGER | |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### inventory_categories / inventory_items

| Category columns | Item columns |
|------------------|--------------|
| id, name, sort_order, created_at | id, name, description, category_id, acquired_at, expires_at, external_ref, created_at, updated_at |

### inventory_links

Junction table linking inventory items to attributes/skills.

### timeline_events

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT | |
| description | TEXT | |
| event_type | TEXT | `activity` \| `milestone` \| `level` \| `personal` |
| occurred_at | TEXT | ISO timestamp |
| source | TEXT | `activity` \| `progression` \| `manual` |
| created_at | TEXT | ISO timestamp |

### timeline_links

Junction table linking timeline events to activities/quests/attributes/skills/inventory.

### stored_files

Attachment metadata (soft-delete; file retained on disk).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| owner_type | TEXT | `inventory` \| `journal` \| `activity` etc. |
| owner_id | TEXT | Owner row id |
| original_name | TEXT | |
| mime_type | TEXT | |
| size | INTEGER | Bytes |
| sha256 | TEXT | 64-char hex |
| relative_path | TEXT | Path under `storage/` |
| deleted_at | TEXT | Nullable (soft delete) |
| created_at | TEXT | ISO timestamp |

### ai_provider_configs

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT | |
| kind | TEXT | `ollama` \| `openai` |
| endpoint | TEXT | URL |
| model | TEXT | |
| api_key | TEXT | Encrypted (AES-256-GCM) |
| enabled | INTEGER | 0/1 |
| is_default | INTEGER | 0/1 |
| external_consent_at | TEXT | Nullable |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### streak_definitions / streak_records

Optional streaks module.

### achievement_definitions / achievement_unlocks

Built-in and custom achievements.

### settings

Key-value application settings (progression config, diminishing config, backup policy, theme).
