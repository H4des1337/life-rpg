import type { Db } from '../db.js';
import { Progression, applyXp, capacity, clampProficiency, type XpTargetType } from '@liferpg/domain';
import { getProgressionConfig } from './settings.js';
import { PROFILE_ID } from './profile.js';
import { nowIso, uuid } from '../util.js';

interface ProfileLite {
  lifetime_xp: number;
  level: number;
}

export interface PlayerDeltaResult {
  before: number;
  after: number;
  levelBefore: number;
  levelAfter: number;
  levelUps: number[];
}

export function applyPlayerDelta(
  db: Db,
  delta: number,
  reason: string,
  activityId: string | null,
  kind: 'award' | 'reversal' | 'manual' = 'award',
): PlayerDeltaResult {
  const profile = db.prepare('SELECT lifetime_xp, level FROM player_profile WHERE id = ?').get(PROFILE_ID) as
    | ProfileLite
    | undefined;
  if (!profile) {
    const error = new Error('No profile exists.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  const progression = new Progression(getProgressionConfig(db));
  const before = profile.lifetime_xp;
  const after = Math.max(0, before + Math.round(delta));
  const state = progression.getState(after);
  const now = nowIso();

  db.prepare('UPDATE player_profile SET lifetime_xp = ?, level = ?, last_activity_at = COALESCE(?, last_activity_at) WHERE id = ?').run(
    after,
    state.level,
    delta > 0 ? now : null,
    PROFILE_ID,
  );

  db.prepare(
    'INSERT INTO xp_transactions (id, activity_id, target_type, target_id, delta, balance_before, balance_after, reason, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(uuid(), activityId, 'player', PROFILE_ID, after - before, before, after, reason, kind, now);

  const levelUps: number[] = [];
  if (state.level > profile.level) {
    for (let level = profile.level + 1; level <= state.level; level++) {
      levelUps.push(level);
      const required = progression.xpRequiredForLevel(level);
      const cumulative = progression.totalXpForLevel(level);
      db.prepare(
        'INSERT INTO player_progression (id, profile_id, level, lifetime_xp, xp_required, kind, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(uuid(), PROFILE_ID, level, cumulative, required, 'level_up', activityId, now);
    }
  } else if (state.level < profile.level) {
    db.prepare(
      'INSERT INTO player_progression (id, profile_id, level, lifetime_xp, xp_required, kind, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(uuid(), PROFILE_ID, state.level, after, state.xpRequiredForNextLevel, 'correction', activityId, now);
  }

  return { before, after, levelBefore: profile.level, levelAfter: state.level, levelUps };
}

interface TargetRow {
  id: string;
  name: string;
  lifetime_xp: number;
  proficiency: number;
  peak_proficiency: number;
  debt?: number;
  last_practice_at?: string | null;
  decay_enabled?: number;
  recovery_per_xp?: number;
}

const TABLE_BY_TYPE: Record<Exclude<XpTargetType, 'attribute'> | 'attribute', string> = {
  attribute: 'attributes',
  sub_attribute: 'sub_attributes',
  skill: 'skills',
};

export function readTarget(db: Db, targetType: XpTargetType, targetId: string): TargetRow | null {
  const table = TABLE_BY_TYPE[targetType];
  return (db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(targetId) as TargetRow | undefined) ?? null;
}

/**
 * Apply signed XP to an attribute, sub-attribute or skill. Positive values recover
 * decay debt. Negative values represent an explicit correction and never erase peaks.
 */
export function applyTargetDelta(
  db: Db,
  targetType: XpTargetType,
  targetId: string,
  delta: number,
  reason: string,
  activityId: string | null,
  occurredAt = nowIso(),
  kind: 'award' | 'reversal' | 'manual' = 'award',
): { before: number; after: number; proficiency: number; peak: number } {
  const target = readTarget(db, targetType, targetId);
  if (!target) {
    const error = new Error(`Unknown ${targetType.replace('_', ' ')} target.`);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  const table = TABLE_BY_TYPE[targetType];
  const before = target.lifetime_xp;
  const rounded = Math.round(delta);

  if (targetType === 'attribute') {
    const after = Math.max(0, before + rounded);
    const current = capacity(after);
    const peak = Math.max(target.peak_proficiency, current);
    db.prepare('UPDATE attributes SET lifetime_xp = ?, proficiency = ?, peak_proficiency = ? WHERE id = ?').run(
      after,
      current,
      peak,
      targetId,
    );
    insertLedger(db, activityId, targetType, targetId, after - before, before, after, reason, kind);
    insertProficiencyHistory(db, targetType, targetId, target.name, after, current, peak, activityId, occurredAt);
    return { before, after, proficiency: current, peak };
  }

  const debt = Math.max(0, Number(target.debt ?? 0));
  const recovery = Number(target.recovery_per_xp ?? 0.02);
  let after = before;
  let newDebt = debt;
  let current = target.proficiency;
  let peak = target.peak_proficiency;

  if (rounded >= 0) {
    const result = applyXp(before, debt, target.peak_proficiency, rounded, recovery);
    after = result.lifetimeXp;
    newDebt = result.debt;
    current = result.current;
    peak = result.peak;
  } else {
    after = Math.max(0, before + rounded);
    const cap = capacity(after);
    newDebt = Math.min(Math.max(0, debt), cap);
    current = clampProficiency(cap - newDebt);
    peak = Math.max(target.peak_proficiency, current);
  }

  const practicedAt = rounded > 0 ? occurredAt : target.last_practice_at ?? null;
  db.prepare(
    `UPDATE ${table} SET lifetime_xp = ?, proficiency = ?, peak_proficiency = ?, debt = ?, last_practice_at = ?,
     decay_anchor_at = CASE WHEN ? > 0 THEN NULL ELSE decay_anchor_at END,
     decay_applied_intervals = CASE WHEN ? > 0 THEN 0 ELSE decay_applied_intervals END
     WHERE id = ?`,
  ).run(after, current, peak, newDebt, practicedAt, rounded, rounded, targetId);

  insertLedger(db, activityId, targetType, targetId, after - before, before, after, reason, kind);
  insertProficiencyHistory(db, targetType, targetId, target.name, after, current, peak, activityId, occurredAt);
  return { before, after, proficiency: current, peak };
}

function insertLedger(
  db: Db,
  activityId: string | null,
  targetType: string,
  targetId: string,
  delta: number,
  before: number,
  after: number,
  reason: string,
  kind: string,
): void {
  db.prepare(
    'INSERT INTO xp_transactions (id, activity_id, target_type, target_id, delta, balance_before, balance_after, reason, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(uuid(), activityId, targetType, targetId, delta, before, after, reason, kind, nowIso());
}

function insertProficiencyHistory(
  db: Db,
  targetType: string,
  targetId: string,
  targetName: string,
  lifetimeXp: number,
  proficiency: number,
  peak: number,
  activityId: string | null,
  recordedAt: string,
): void {
  db.prepare(
    'INSERT INTO proficiency_history (id, target_type, target_id, target_name, lifetime_xp, proficiency, peak_proficiency, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(uuid(), targetType, targetId, targetName, lifetimeXp, proficiency, peak, activityId, recordedAt);
}

/** Record the parent attribute's weighted condition after child practice. */
export function snapshotAttribute(db: Db, attributeId: string, activityId: string | null): void {
  const attribute = db.prepare('SELECT * FROM attributes WHERE id = ?').get(attributeId) as
    | { name: string; lifetime_xp: number; proficiency: number; peak_proficiency: number }
    | undefined;
  if (!attribute) return;
  const children = db
    .prepare('SELECT weight, proficiency, peak_proficiency FROM sub_attributes WHERE attribute_id = ?')
    .all(attributeId) as Array<{ weight: number; proficiency: number; peak_proficiency: number }>;
  let current = attribute.proficiency;
  let peak = attribute.peak_proficiency;
  if (children.length > 0) {
    const totalWeight = children.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
    if (totalWeight > 0) {
      current = children.reduce((sum, c) => sum + c.proficiency * (Math.max(0, c.weight) / totalWeight), 0);
      peak = children.reduce((sum, c) => sum + c.peak_proficiency * (Math.max(0, c.weight) / totalWeight), 0);
    } else {
      current = children.reduce((sum, c) => sum + c.proficiency, 0) / children.length;
      peak = children.reduce((sum, c) => sum + c.peak_proficiency, 0) / children.length;
    }
  }
  db.prepare(
    'INSERT INTO attribute_history (id, attribute_id, lifetime_xp, proficiency, peak_proficiency, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(uuid(), attributeId, attribute.lifetime_xp, current, peak, activityId, nowIso());
}
