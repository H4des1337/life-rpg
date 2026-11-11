import type { Db } from '../db.js';
import { nowIso, uuid } from '../util.js';
import { maxCurrentStreak } from './streaks.js';
import { createTimelineEvent } from './timeline.js';

export interface AchievementDefinitionRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition_type: string;
  threshold: number;
  hidden: number;
  is_builtin: number;
  created_at: string;
}

const COSMETICS: Record<string, string> = {
  'ach-first-step': 'badge-spark',
  'ach-ten-acts': 'ember-sash',
  'ach-level-5': 'circlet-bronze',
  'ach-level-10': 'halo-gold',
  'ach-level-25': 'cloak-ember',
  'ach-level-50': 'crown-eternal',
  'ach-skill-10': 'branch-pin',
  'ach-quest-1': 'banner-quest',
  'ach-journal-10': 'quill-ink',
  'ach-streak-30': 'sun-medallion',
};

function conditionValue(db: Db, type: string): number {
  switch (type) {
    case 'player_level':
      return (db.prepare('SELECT level FROM player_profile LIMIT 1').get() as { level: number } | undefined)?.level ?? 1;
    case 'total_activities':
      return (db.prepare("SELECT COUNT(*) AS c FROM activities WHERE status = 'approved'").get() as { c: number }).c;
    case 'attribute_level': {
      const a = db.prepare('SELECT MAX(proficiency) AS m FROM attributes').get() as { m: number | null };
      const s = db.prepare('SELECT MAX(proficiency) AS m FROM sub_attributes').get() as { m: number | null };
      const k = db.prepare('SELECT MAX(proficiency) AS m FROM skills').get() as { m: number | null };
      return Math.max(a.m ?? 0, s.m ?? 0, k.m ?? 0);
    }
    case 'skill_count':
      return (db.prepare('SELECT COUNT(*) AS c FROM skills').get() as { c: number }).c;
    case 'quest_completed':
      return (db.prepare("SELECT COUNT(*) AS c FROM quests WHERE status = 'completed'").get() as { c: number }).c;
    case 'journal_count':
      return (db.prepare('SELECT COUNT(*) AS c FROM journal_entries WHERE deleted_at IS NULL').get() as { c: number }).c;
    case 'inventory_count':
      return (db.prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE deleted_at IS NULL').get() as { c: number }).c;
    case 'streak_days':
      return maxCurrentStreak(db);
    case 'custom':
    default:
      return 0;
  }
}

export function listAchievements(db: Db) {
  const defs = db.prepare('SELECT * FROM achievement_definitions ORDER BY is_builtin DESC, threshold, name').all() as AchievementDefinitionRow[];
  const unlocked = db.prepare('SELECT * FROM achievements').all() as Array<{
    id: string;
    definition_id: string;
    unlocked_at: string;
    progress_snapshot: number;
  }>;
  const byDef = new Map(unlocked.map((row) => [row.definition_id, row]));
  return defs.map((def) => {
    const unlock = byDef.get(def.id);
    const progress = unlock ? unlock.progress_snapshot : conditionValue(db, def.condition_type);
    const hidden = def.hidden === 1 && !unlock;
    return {
      id: def.id,
      name: hidden ? 'Hidden Achievement' : def.name,
      description: hidden ? 'Continue your path to reveal this achievement.' : def.description,
      icon: def.icon,
      conditionType: def.condition_type,
      threshold: def.threshold,
      hidden: def.hidden === 1,
      isBuiltin: def.is_builtin === 1,
      unlocked: Boolean(unlock),
      unlockedAt: unlock?.unlocked_at ?? null,
      progress: Math.round(progress * 100) / 100,
      progressFraction: def.threshold > 0 ? Math.min(1, progress / def.threshold) : progress > 0 ? 1 : 0,
      achievementId: unlock?.id ?? null,
    };
  });
}

export function evaluateAchievements(db: Db): Array<{ id: string; name: string; description: string; icon: string; unlockedAt: string }> {
  const defs = db.prepare('SELECT * FROM achievement_definitions').all() as AchievementDefinitionRow[];
  const existing = new Set(
    (db.prepare('SELECT definition_id FROM achievements').all() as Array<{ definition_id: string }>).map((r) => r.definition_id),
  );
  const newly: Array<{ id: string; name: string; description: string; icon: string; unlockedAt: string }> = [];

  for (const def of defs) {
    if (existing.has(def.id)) continue;
    const value = conditionValue(db, def.condition_type);
    if (value < def.threshold) continue;
    const achievementId = uuid();
    const unlockedAt = nowIso();
    db.prepare(
      'INSERT OR IGNORE INTO achievements (id, definition_id, unlocked_at, progress_snapshot, note) VALUES (?, ?, ?, ?, ?)',
    ).run(achievementId, def.id, unlockedAt, value, '');
    const cosmetic = COSMETICS[def.id];
    if (cosmetic) {
      const profile = db.prepare('SELECT id FROM player_profile LIMIT 1').get() as { id: string } | undefined;
      if (profile) {
        db.prepare(
          'INSERT OR IGNORE INTO unlocked_cosmetics (id, profile_id, cosmetic_key, source, unlocked_at) VALUES (?, ?, ?, ?, ?)',
        ).run(uuid(), profile.id, cosmetic, 'achievement', unlockedAt);
      }
    }
    createTimelineEvent(db, {
      title: `Achievement unlocked: ${def.name}`,
      description: def.description,
      eventType: 'achievement',
      occurredAt: unlockedAt,
      source: 'achievement',
      links: [{ type: 'achievement', id: achievementId }],
    });
    newly.push({ id: achievementId, name: def.name, description: def.description, icon: def.icon, unlockedAt });
  }
  return newly;
}

export function createAchievementDefinition(
  db: Db,
  input: {
    name: string;
    description?: string;
    icon?: string;
    conditionType?: string;
    threshold?: number;
    hidden?: boolean;
  },
) {
  const id = uuid();
  db.prepare(
    'INSERT INTO achievement_definitions (id, name, description, icon, condition_type, threshold, hidden, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(
    id,
    input.name.trim(),
    input.description ?? '',
    input.icon || 'trophy',
    input.conditionType || 'custom',
    input.threshold ?? 1,
    input.hidden ? 1 : 0,
    nowIso(),
  );
  evaluateAchievements(db);
  return db.prepare('SELECT * FROM achievement_definitions WHERE id = ?').get(id);
}

export function deleteAchievementDefinition(db: Db, id: string): void {
  const row = db.prepare('SELECT is_builtin FROM achievement_definitions WHERE id = ?').get(id) as
    | { is_builtin: number }
    | undefined;
  if (!row) {
    const error = new Error('Achievement not found.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  if (row.is_builtin === 1) {
    const error = new Error('Built-in achievements cannot be deleted.');
    (error as Error & { statusCode?: number }).statusCode = 409;
    throw error;
  }
  db.prepare('DELETE FROM achievement_definitions WHERE id = ?').run(id);
}

export function getUnlockedCosmetics(db: Db): string[] {
  const rows = db.prepare('SELECT cosmetic_key FROM unlocked_cosmetics').all() as Array<{ cosmetic_key: string }>;
  return rows.map((row) => row.cosmetic_key);
}
