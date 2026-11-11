import type { Db } from '../db.js';
import { nowIso, uuid } from '../util.js';

export interface StreakRow {
  id: string;
  name: string;
  description: string;
  cadence: 'daily' | 'weekly';
  enabled: number;
  created_at: string;
}

export interface StreakEntryRow {
  id: string;
  streak_id: string;
  entry_date: string;
  note: string;
  created_at: string;
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function weekKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

export function computeStreakLengths(dates: string[], cadence: 'daily' | 'weekly', today = todayKey()): { current: number; longest: number } {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return { current: 0, longest: 0 };
  const keys = cadence === 'weekly' ? [...new Set(unique.map(weekKey))].sort() : unique;
  const daily = cadence !== 'weekly';
  const step = daily ? 86_400_000 : 7 * 86_400_000;
  const keyToTime = (key: string) => new Date(`${daily ? key : `${key}T00:00:00.000Z`}`).getTime();

  let longest = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = keyToTime(keys[i - 1]);
    const curr = keyToTime(keys[i]);
    if (Math.round((curr - prev) / step) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }

  const todayTime = new Date(`${today}T00:00:00.000Z`).getTime();
  const last = keyToTime(keys[keys.length - 1]);
  const gap = Math.round((todayTime - last) / step);
  let current = 0;
  if (gap === 0 || gap === 1) {
    current = 1;
    for (let i = keys.length - 1; i > 0; i--) {
      if (Math.round((keyToTime(keys[i]) - keyToTime(keys[i - 1])) / step) === 1) current += 1;
      else break;
    }
  }
  return { current, longest };
}

export function streakStats(db: Db, streak: StreakRow) {
  const entries = db
    .prepare('SELECT * FROM streak_entries WHERE streak_id = ? ORDER BY entry_date DESC')
    .all(streak.id) as StreakEntryRow[];
  const lengths = computeStreakLengths(
    entries.map((entry) => entry.entry_date),
    streak.cadence,
  );
  return {
    ...streak,
    enabled: streak.enabled === 1,
    entries: entries.map((entry) => ({ id: entry.id, date: entry.entry_date, note: entry.note })),
    current: lengths.current,
    longest: lengths.longest,
    checkedToday: entries.some((entry) => entry.entry_date === todayKey()),
  };
}

export function listStreaks(db: Db) {
  const rows = db.prepare('SELECT * FROM streaks ORDER BY created_at').all() as StreakRow[];
  return rows.map((row) => streakStats(db, row));
}

export function createStreak(db: Db, input: { name: string; description?: string; cadence?: 'daily' | 'weekly'; enabled?: boolean }) {
  const id = uuid();
  db.prepare('INSERT INTO streaks (id, name, description, cadence, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    input.name.trim(),
    input.description ?? '',
    input.cadence ?? 'daily',
    input.enabled === false ? 0 : 1,
    nowIso(),
  );
  return streakStats(db, db.prepare('SELECT * FROM streaks WHERE id = ?').get(id) as StreakRow);
}

export function updateStreak(
  db: Db,
  id: string,
  input: { name?: string; description?: string; cadence?: 'daily' | 'weekly'; enabled?: boolean },
) {
  const row = db.prepare('SELECT * FROM streaks WHERE id = ?').get(id) as StreakRow | undefined;
  if (!row) throw notFound('Streak not found.');
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name.trim()); }
  if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
  if (input.cadence !== undefined) { updates.push('cadence = ?'); values.push(input.cadence); }
  if (input.enabled !== undefined) { updates.push('enabled = ?'); values.push(input.enabled ? 1 : 0); }
  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE streaks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return streakStats(db, db.prepare('SELECT * FROM streaks WHERE id = ?').get(id) as StreakRow);
}

export function deleteStreak(db: Db, id: string): void {
  db.prepare('DELETE FROM streaks WHERE id = ?').run(id);
}

export function checkInStreak(db: Db, id: string, date?: string, note = '', remove = false) {
  const row = db.prepare('SELECT * FROM streaks WHERE id = ?').get(id) as StreakRow | undefined;
  if (!row) throw notFound('Streak not found.');
  const entryDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
  if (remove) {
    db.prepare('DELETE FROM streak_entries WHERE streak_id = ? AND entry_date = ?').run(id, entryDate);
  } else {
    db.prepare(
      'INSERT INTO streak_entries (id, streak_id, entry_date, note, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(streak_id, entry_date) DO UPDATE SET note = excluded.note',
    ).run(uuid(), id, entryDate, note, nowIso());
  }
  return streakStats(db, row);
}

export function maxCurrentStreak(db: Db): number {
  const rows = db.prepare('SELECT * FROM streaks WHERE enabled = 1').all() as StreakRow[];
  return rows.reduce((max, row) => Math.max(max, streakStats(db, row).current), 0);
}

function notFound(message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = 404;
  return error;
}
