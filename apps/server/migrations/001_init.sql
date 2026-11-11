-- LIFE RPG — initial schema (version 1)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_activity_at TEXT,
  lifetime_xp INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1)
);

CREATE TABLE IF NOT EXISTS player_progression (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  lifetime_xp INTEGER NOT NULL,
  xp_required INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'level_up',
  activity_id TEXT,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_progression_profile ON player_progression(profile_id, recorded_at);

CREATE TABLE IF NOT EXISTS attributes (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#cfa960',
  weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_core INTEGER NOT NULL DEFAULT 0,
  lifetime_xp INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
  proficiency REAL NOT NULL DEFAULT 0,
  peak_proficiency REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attributes_sort ON attributes(sort_order);

CREATE TABLE IF NOT EXISTS sub_attributes (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES attributes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_certification INTEGER NOT NULL DEFAULT 0,
  lifetime_xp INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
  proficiency REAL NOT NULL DEFAULT 0,
  peak_proficiency REAL NOT NULL DEFAULT 0,
  debt REAL NOT NULL DEFAULT 0,
  last_practice_at TEXT,
  decay_enabled INTEGER NOT NULL DEFAULT 0,
  decay_grace_days INTEGER NOT NULL DEFAULT 14,
  decay_interval_days INTEGER NOT NULL DEFAULT 7,
  decay_rate REAL NOT NULL DEFAULT 1,
  decay_minimum REAL NOT NULL DEFAULT 10,
  recovery_per_xp REAL NOT NULL DEFAULT 0.02,
  decay_anchor_at TEXT,
  decay_applied_intervals INTEGER NOT NULL DEFAULT 0,
  last_decay_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_attributes_attribute ON sub_attributes(attribute_id, sort_order);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  parent_skill_id TEXT REFERENCES skills(id) ON DELETE RESTRICT,
  sub_attribute_id TEXT REFERENCES sub_attributes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_certification INTEGER NOT NULL DEFAULT 0,
  lifetime_xp INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
  proficiency REAL NOT NULL DEFAULT 0,
  peak_proficiency REAL NOT NULL DEFAULT 0,
  debt REAL NOT NULL DEFAULT 0,
  last_practice_at TEXT,
  decay_enabled INTEGER NOT NULL DEFAULT 0,
  decay_grace_days INTEGER NOT NULL DEFAULT 30,
  decay_interval_days INTEGER NOT NULL DEFAULT 14,
  decay_rate REAL NOT NULL DEFAULT 1,
  decay_minimum REAL NOT NULL DEFAULT 15,
  recovery_per_xp REAL NOT NULL DEFAULT 0.02,
  decay_anchor_at TEXT,
  decay_applied_intervals INTEGER NOT NULL DEFAULT 0,
  last_decay_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_parent ON skills(parent_skill_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_skills_sub ON skills(sub_attribute_id);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  duration_minutes INTEGER,
  difficulty INTEGER NOT NULL DEFAULT 1,
  effort INTEGER NOT NULL DEFAULT 1,
  significance INTEGER NOT NULL DEFAULT 1,
  relevance INTEGER NOT NULL DEFAULT 3,
  fingerprint TEXT NOT NULL,
  base_xp INTEGER NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  player_xp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','reversed')),
  source TEXT NOT NULL DEFAULT 'manual',
  provider_name TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  classification TEXT NOT NULL DEFAULT '',
  reasoning TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1,
  is_milestone INTEGER NOT NULL DEFAULT 0,
  quest_id TEXT REFERENCES quests(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  reversal_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_occurred ON activities(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_fingerprint ON activities(fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_activities_quest ON activities(quest_id);

CREATE TABLE IF NOT EXISTS activity_allocations (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('attribute','sub_attribute','skill')),
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK (xp >= 0),
  weight REAL NOT NULL DEFAULT 1,
  rationale TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_activity_allocations_activity ON activity_allocations(activity_id);

CREATE TABLE IF NOT EXISTS xp_transactions (
  id TEXT PRIMARY KEY,
  activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('player','attribute','sub_attribute','skill')),
  target_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'award' CHECK (kind IN ('award','reversal','manual','decay')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_target ON xp_transactions(target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_activity ON xp_transactions(activity_id);

CREATE TABLE IF NOT EXISTS attribute_history (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  lifetime_xp INTEGER NOT NULL,
  proficiency REAL NOT NULL,
  peak_proficiency REAL NOT NULL,
  activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attribute_history_attribute ON attribute_history(attribute_id, recorded_at);

CREATE TABLE IF NOT EXISTS proficiency_history (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('attribute','sub_attribute','skill')),
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL DEFAULT '',
  lifetime_xp INTEGER NOT NULL,
  proficiency REAL NOT NULL,
  peak_proficiency REAL NOT NULL,
  activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proficiency_history_target ON proficiency_history(target_type, target_id, recorded_at);

CREATE TABLE IF NOT EXISTS decay_events (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('sub_attribute','skill')),
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL DEFAULT '',
  intervals INTEGER NOT NULL,
  points_removed REAL NOT NULL,
  proficiency_after REAL NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decay_events_target ON decay_events(target_type, target_id, applied_at);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  target_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quests_status ON quests(status);

CREATE TABLE IF NOT EXISTS quest_milestones (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quest_milestones_quest ON quest_milestones(quest_id, sort_order);

CREATE TABLE IF NOT EXISTS quest_links (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('attribute','skill')),
  target_id TEXT NOT NULL,
  UNIQUE (quest_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS achievement_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'trophy',
  condition_type TEXT NOT NULL DEFAULT 'custom',
  threshold REAL NOT NULL DEFAULT 1,
  hidden INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL UNIQUE REFERENCES achievement_definitions(id) ON DELETE CASCADE,
  unlocked_at TEXT NOT NULL,
  progress_snapshot REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked ON achievements(unlocked_at);

CREATE TABLE IF NOT EXISTS streaks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cadence TEXT NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily','weekly')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS streak_entries (
  id TEXT PRIMARY KEY,
  streak_id TEXT NOT NULL REFERENCES streaks(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (streak_id, entry_date)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_journal_updated ON journal_entries(updated_at DESC);

CREATE TABLE IF NOT EXISTS journal_links (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('attribute','skill','quest','achievement','inventory')),
  target_id TEXT NOT NULL,
  UNIQUE (journal_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS sticky_notes (
  id TEXT PRIMARY KEY,
  journal_id TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Note',
  body TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL DEFAULT 40,
  y REAL NOT NULL DEFAULT 40,
  width REAL NOT NULL DEFAULT 260,
  height REAL NOT NULL DEFAULT 220,
  z_index INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#e3c27a',
  collapsed INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
  acquired_at TEXT,
  expires_at TEXT,
  external_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category_id);

CREATE TABLE IF NOT EXISTS inventory_links (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('attribute','skill','achievement')),
  target_id TEXT NOT NULL,
  UNIQUE (item_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stored_files_hash ON stored_files(sha256);

CREATE TABLE IF NOT EXISTS file_links (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('inventory','journal','activity','character')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (file_id, owner_type, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_file_links_owner ON file_links(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'personal',
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_occurred ON timeline_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS timeline_links (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('activity','attribute','skill','quest','inventory','achievement')),
  target_id TEXT NOT NULL,
  UNIQUE (event_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS character_appearance (
  profile_id TEXT PRIMARY KEY REFERENCES player_profile(id) ON DELETE CASCADE,
  skin_tone TEXT NOT NULL DEFAULT 'warm',
  hair_style TEXT NOT NULL DEFAULT 'short',
  hair_color TEXT NOT NULL DEFAULT 'brown',
  outfit TEXT NOT NULL DEFAULT 'tunic',
  outfit_color TEXT NOT NULL DEFAULT 'midnight',
  accessory TEXT NOT NULL DEFAULT 'none',
  background TEXT NOT NULL DEFAULT 'arch',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unlocked_cosmetics (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES player_profile(id) ON DELETE CASCADE,
  cosmetic_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'achievement',
  unlocked_at TEXT NOT NULL,
  UNIQUE (profile_id, cosmetic_key)
);

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ollama','openai')),
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  external_consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','auto')),
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Seed the seven core attributes.
INSERT OR IGNORE INTO attributes (id, key, name, description, color, weight, sort_order, is_core, created_at) VALUES
  ('attr-physical', 'physical', 'Physical', 'Strength, endurance, health and physical capability.', '#b06a54', 1, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('attr-intellect', 'intellect', 'Intellect', 'Knowledge, reasoning, learning and depth of understanding.', '#6d8fb8', 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('attr-competence', 'competence', 'Competence', 'Craft, execution and the ability to build and ship.', '#cfa960', 1, 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('attr-social', 'social', 'Social', 'Communication, relationships and presence with others.', '#b07a9c', 1, 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('attr-character', 'character', 'Character', 'Discipline, integrity, resilience and self-mastery.', '#7fa88b', 1, 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('attr-financial', 'financial', 'Financial', 'Income, stewardship, assets and financial freedom.', '#a89155', 1, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('attr-lifestyle', 'lifestyle', 'Lifestyle', 'Environment, nutrition, rest and quality of life.', '#7f9fa8', 1, 6, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO inventory_categories (id, name, sort_order, created_at) VALUES
  ('cat-education', 'Education', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-certifications', 'Certifications', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-projects', 'Projects', 2, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-skills', 'Skills', 3, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-languages', 'Languages', 4, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-licences', 'Licences', 5, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-awards', 'Awards', 6, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-equipment', 'Equipment', 7, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cat-experiences', 'Experiences', 8, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Real achievement definitions. They unlock only from recorded progress.
INSERT OR IGNORE INTO achievement_definitions (id, name, description, icon, condition_type, threshold, hidden, is_builtin, created_at) VALUES
  ('ach-first-step', 'First Step', 'Log your first activity.', 'spark', 'total_activities', 1, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-ten-acts', 'Momentum', 'Log 10 activities.', 'flame', 'total_activities', 10, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-fifty-acts', 'Compounding', 'Log 50 activities.', 'layers', 'total_activities', 50, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-level-5', 'Awakened', 'Reach player level 5.', 'star', 'player_level', 5, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-level-10', 'Initiate No More', 'Reach player level 10.', 'star', 'player_level', 10, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-level-25', 'Adept of the Path', 'Reach player level 25.', 'crown', 'player_level', 25, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-level-50', 'Expert', 'Reach player level 50.', 'crown', 'player_level', 50, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-skill-10', 'Grove of Skill', 'Own 10 skills in your skill forest.', 'tree', 'skill_count', 10, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-quest-1', 'Quest Complete', 'Complete your first quest.', 'flag', 'quest_completed', 1, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-quest-5', 'Questbearer', 'Complete 5 quests.', 'flag', 'quest_completed', 5, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-journal-10', 'Chronicler', 'Write 10 journal entries.', 'book', 'journal_count', 10, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-inventory-5', 'Curator', 'Record 5 inventory items.', 'archive', 'inventory_count', 5, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-streak-7', 'Seven Days Steady', 'Maintain a 7-day streak.', 'sun', 'streak_days', 7, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ach-streak-30', 'Thirty Dawns', 'Maintain a 30-day streak.', 'sun', 'streak_days', 30, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (1, '001_init.sql', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
