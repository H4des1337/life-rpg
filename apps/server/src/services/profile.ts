import type { Db } from '../db.js';
import { Progression, defaultDecayConfig } from '@liferpg/domain';
import { getProgressionConfig } from './settings.js';
import { nowIso, uuid } from '../util.js';

export interface ProfileRow {
  id: string;
  name: string;
  created_at: string;
  last_activity_at: string | null;
  lifetime_xp: number;
  level: number;
}

export const PROFILE_ID = 'profile-primary';

export function getProfileRow(db: Db): ProfileRow | null {
  return (db.prepare('SELECT * FROM player_profile WHERE id = ?').get(PROFILE_ID) as ProfileRow | undefined) ?? null;
}

export function getProfile(db: Db) {
  const row = getProfileRow(db);
  if (!row) return null;
  const progression = new Progression(getProgressionConfig(db));
  const state = progression.getState(row.lifetime_xp);
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    progression: state,
    appearance: getAppearance(db),
  };
}

export function createProfile(
  db: Db,
  input: { name: string; appearance?: Record<string, string | undefined> },
) {
  const existing = getProfileRow(db);
  if (existing) {
    const error = new Error('A character profile already exists. Only one local profile is supported.');
    (error as Error & { statusCode?: number }).statusCode = 409;
    throw error;
  }
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO player_profile (id, name, created_at, last_activity_at, lifetime_xp, level) VALUES (?, ?, ?, NULL, 0, 1)',
    ).run(PROFILE_ID, input.name.trim(), now);
    db.prepare(
      `INSERT INTO character_appearance
       (profile_id, skin_tone, hair_style, hair_color, outfit, outfit_color, accessory, background, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      PROFILE_ID,
      input.appearance?.skinTone ?? 'warm',
      input.appearance?.hairStyle ?? 'short',
      input.appearance?.hairColor ?? 'brown',
      input.appearance?.outfit ?? 'tunic',
      input.appearance?.outfitColor ?? 'midnight',
      input.appearance?.accessory ?? 'none',
      input.appearance?.background ?? 'arch',
      now,
    );
    db.prepare(
      'INSERT INTO player_progression (id, profile_id, level, lifetime_xp, xp_required, kind, recorded_at) VALUES (?, ?, 1, 0, ?, ?, ?)',
    ).run(uuid(), PROFILE_ID, 500, 'created', now);
    db.prepare("UPDATE settings SET value = 'true', updated_at = ? WHERE key = 'onboardingCompleted'").run(now);
  });
  tx();
  return getProfile(db);
}

export function updateProfile(db: Db, patch: { name?: string }) {
  const row = getProfileRow(db);
  if (!row) {
    const error = new Error('No profile exists. Create a character first.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  if (patch.name) {
    db.prepare('UPDATE player_profile SET name = ? WHERE id = ?').run(patch.name.trim(), PROFILE_ID);
  }
  return getProfile(db);
}

export function getAppearance(db: Db) {
  const row = db.prepare('SELECT * FROM character_appearance WHERE profile_id = ?').get(PROFILE_ID) as
    | {
        skin_tone: string;
        hair_style: string;
        hair_color: string;
        outfit: string;
        outfit_color: string;
        accessory: string;
        background: string;
        updated_at: string;
      }
    | undefined;
  if (!row) {
    return {
      skinTone: 'warm',
      hairStyle: 'short',
      hairColor: 'brown',
      outfit: 'tunic',
      outfitColor: 'midnight',
      accessory: 'none',
      background: 'arch',
      updatedAt: null,
    };
  }
  return {
    skinTone: row.skin_tone,
    hairStyle: row.hair_style,
    hairColor: row.hair_color,
    outfit: row.outfit,
    outfitColor: row.outfit_color,
    accessory: row.accessory,
    background: row.background,
    updatedAt: row.updated_at,
  };
}

export function updateAppearance(db: Db, patch: Record<string, string | undefined>) {
  const row = getProfileRow(db);
  if (!row) {
    const error = new Error('No profile exists.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  const current = getAppearance(db);
  const next = {
    skinTone: patch.skinTone ?? current.skinTone,
    hairStyle: patch.hairStyle ?? current.hairStyle,
    hairColor: patch.hairColor ?? current.hairColor,
    outfit: patch.outfit ?? current.outfit,
    outfitColor: patch.outfitColor ?? current.outfitColor,
    accessory: patch.accessory ?? current.accessory,
    background: patch.background ?? current.background,
    updatedAt: nowIso(),
  };
  db.prepare(
    `INSERT INTO character_appearance (profile_id, skin_tone, hair_style, hair_color, outfit, outfit_color, accessory, background, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id) DO UPDATE SET
       skin_tone=excluded.skin_tone, hair_style=excluded.hair_style, hair_color=excluded.hair_color,
       outfit=excluded.outfit, outfit_color=excluded.outfit_color, accessory=excluded.accessory,
       background=excluded.background, updated_at=excluded.updated_at`,
  ).run(
    PROFILE_ID,
    next.skinTone,
    next.hairStyle,
    next.hairColor,
    next.outfit,
    next.outfitColor,
    next.accessory,
    next.background,
    next.updatedAt,
  );
  return getAppearance(db);
}

export function defaultDecay() {
  return defaultDecayConfig();
}
