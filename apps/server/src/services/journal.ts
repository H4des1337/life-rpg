import type { Db } from '../db.js';
import type { journalCreateSchema, journalUpdateSchema, stickyNoteCreateSchema, stickyNoteUpdateSchema } from '@liferpg/shared';
import type { z } from 'zod';
import { nowIso, uuid } from '../util.js';

export type JournalCreate = z.infer<typeof journalCreateSchema>;
export type JournalUpdate = z.infer<typeof journalUpdateSchema>;
export type StickyCreate = z.infer<typeof stickyNoteCreateSchema>;
export type StickyUpdate = z.infer<typeof stickyNoteUpdateSchema>;

interface JournalRow {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const LINK_TYPES = ['attribute', 'skill', 'quest', 'achievement', 'inventory'] as const;

export function listJournal(
  db: Db,
  options: { search?: string; category?: string; limit?: number; offset?: number } = {},
) {
  const where = ['deleted_at IS NULL'];
  const values: unknown[] = [];
  if (options.search) {
    where.push('(title LIKE ? OR body LIKE ?)');
    const pattern = `%${options.search.replace(/[%_]/g, '')}%`;
    values.push(pattern, pattern);
  }
  if (options.category) {
    where.push('category = ?');
    values.push(options.category);
  }
  const limit = Math.min(200, Math.max(1, options.limit ?? 100));
  const offset = Math.max(0, options.offset ?? 0);
  const rows = db
    .prepare(`SELECT * FROM journal_entries WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as JournalRow[];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM journal_entries WHERE ${where.join(' AND ')}`).get(...values) as { c: number }
  ).c;
  return { items: rows.map((row) => mapJournal(db, row, true)), total, limit, offset };
}

export function getJournal(db: Db, id: string) {
  const row = db.prepare('SELECT * FROM journal_entries WHERE id = ? AND deleted_at IS NULL').get(id) as JournalRow | undefined;
  if (!row) throw httpError(404, 'Journal entry not found.');
  return mapJournal(db, row, false);
}

function mapJournal(db: Db, row: JournalRow, summary: boolean) {
  const links = db
    .prepare('SELECT target_type AS targetType, target_id AS targetId FROM journal_links WHERE journal_id = ?')
    .all(row.id) as Array<{ targetType: string; targetId: string }>;
  const resolved = links.map((link) => ({ ...link, label: labelFor(db, link.targetType, link.targetId) }));
  const files = db
    .prepare(
      `SELECT f.id, f.original_name AS originalName, f.mime_type AS mimeType, f.size, f.sha256, link.created_at AS linkedAt
       FROM file_links link JOIN stored_files f ON f.id = link.file_id
       WHERE link.owner_type = 'journal' AND link.owner_id = ? AND f.deleted_at IS NULL ORDER BY link.created_at`,
    )
    .all(row.id);
  return {
    id: row.id,
    title: row.title,
    body: summary ? row.body.slice(0, 400) : row.body,
    bodyPreview: row.body.slice(0, 160),
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: resolved,
    attributes: resolved.filter((l) => l.targetType === 'attribute'),
    skills: resolved.filter((l) => l.targetType === 'skill'),
    quests: resolved.filter((l) => l.targetType === 'quest'),
    achievements: resolved.filter((l) => l.targetType === 'achievement'),
    inventory: resolved.filter((l) => l.targetType === 'inventory'),
    files,
    noteCount: (db.prepare('SELECT COUNT(*) AS c FROM sticky_notes WHERE journal_id = ?').get(row.id) as { c: number }).c,
  };
}

export function createJournal(db: Db, input: JournalCreate) {
  const id = uuid();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare('INSERT INTO journal_entries (id, title, body, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      input.title.trim(),
      input.body ?? '',
      input.category ?? '',
      now,
      now,
    );
    linkJournal(db, id, input);
  });
  run();
  return getJournal(db, id);
}

export function updateJournal(db: Db, id: string, input: JournalUpdate) {
  const exists = db.prepare('SELECT id FROM journal_entries WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!exists) throw httpError(404, 'Journal entry not found.');
  const now = nowIso();
  const run = db.transaction(() => {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { updates.push('title = ?'); values.push(input.title.trim()); }
    if (input.body !== undefined) { updates.push('body = ?'); values.push(input.body); }
    if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
    updates.push('updated_at = ?');
    values.push(now, id);
    db.prepare(`UPDATE journal_entries SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    if (input.attributeIds || input.skillIds || input.questIds || input.achievementIds || input.inventoryIds) {
      db.prepare('DELETE FROM journal_links WHERE journal_id = ?').run(id);
      linkJournal(db, id, input);
    }
  });
  run();
  return getJournal(db, id);
}

export function deleteJournal(db: Db, id: string): void {
  db.prepare('UPDATE journal_entries SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), id);
}

export function listJournalCategories(db: Db): string[] {
  return (
    db
      .prepare("SELECT DISTINCT category FROM journal_entries WHERE deleted_at IS NULL AND category <> '' ORDER BY category")
      .all() as Array<{ category: string }>
  ).map((row) => row.category);
}

function linkJournal(db: Db, journalId: string, input: Partial<JournalCreate>): void {
  const pairs: Array<[string, string[] | undefined]> = [
    ['attribute', input.attributeIds],
    ['skill', input.skillIds],
    ['quest', input.questIds],
    ['achievement', input.achievementIds],
    ['inventory', input.inventoryIds],
  ];
  for (const [type, ids] of pairs) {
    for (const targetId of ids ?? []) {
      db.prepare('INSERT OR IGNORE INTO journal_links (id, journal_id, target_type, target_id) VALUES (?, ?, ?, ?)').run(
        uuid(),
        journalId,
        type,
        targetId,
      );
    }
  }
}

export function listStickyNotes(db: Db, includeHidden = true) {
  const rows = db
    .prepare(
      `SELECT n.*, j.title AS journal_title FROM sticky_notes n
       LEFT JOIN journal_entries j ON j.id = n.journal_id AND j.deleted_at IS NULL
       ${includeHidden ? '' : 'WHERE n.hidden = 0'} ORDER BY n.z_index, n.created_at`,
    )
    .all() as Array<Record<string, unknown> & { id: string }>;
  return rows.map((row) => ({
    id: row.id,
    journalId: row.journal_id,
    journalTitle: row.journal_title ?? null,
    title: row.title,
    body: row.body,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.z_index,
    color: row.color,
    collapsed: row.collapsed === 1,
    hidden: row.hidden === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function createStickyNote(db: Db, input: StickyCreate) {
  if (input.journalId) {
    const journal = db.prepare('SELECT id FROM journal_entries WHERE id = ? AND deleted_at IS NULL').get(input.journalId);
    if (!journal) throw httpError(400, 'Linked journal entry not found.');
  }
  const id = uuid();
  const now = nowIso();
  const maxZ = (db.prepare('SELECT COALESCE(MAX(z_index), 0) AS z FROM sticky_notes').get() as { z: number }).z;
  const body = input.body || (input.journalId
    ? ((db.prepare('SELECT body FROM journal_entries WHERE id = ?').get(input.journalId) as { body: string } | undefined)?.body ?? '')
    : '');
  db.prepare(
    `INSERT INTO sticky_notes (id, journal_id, title, body, x, y, width, height, z_index, color, collapsed, hidden, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.journalId ?? null,
    input.title ?? 'Note',
    body,
    input.x ?? 40,
    input.y ?? 40,
    input.width ?? 260,
    input.height ?? 220,
    maxZ + 1,
    input.color ?? '#e3c27a',
    input.collapsed ? 1 : 0,
    input.hidden ? 1 : 0,
    now,
    now,
  );
  return listStickyNotes(db).find((note) => note.id === id);
}

export function updateStickyNote(db: Db, id: string, input: StickyUpdate) {
  const exists = db.prepare('SELECT id FROM sticky_notes WHERE id = ?').get(id);
  if (!exists) throw httpError(404, 'Sticky note not found.');
  const updates: string[] = [];
  const values: unknown[] = [];
  const map: Array<[keyof StickyUpdate, string, (v: unknown) => unknown]> = [
    ['journalId', 'journal_id', (v) => v ?? null],
    ['title', 'title', (v) => String(v).slice(0, 200)],
    ['body', 'body', (v) => String(v).slice(0, 20_000)],
    ['x', 'x', Number],
    ['y', 'y', Number],
    ['width', 'width', Number],
    ['height', 'height', Number],
    ['zIndex', 'z_index', Number],
    ['color', 'color', String],
    ['collapsed', 'collapsed', (v) => (v ? 1 : 0)],
    ['hidden', 'hidden', (v) => (v ? 1 : 0)],
  ];
  for (const [key, column, transform] of map) {
    if (input[key] === undefined) continue;
    updates.push(`${column} = ?`);
    values.push(transform(input[key]));
  }
  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(nowIso(), id);
    db.prepare(`UPDATE sticky_notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return listStickyNotes(db).find((note) => note.id === id);
}

/** Removing the pin never removes the underlying journal entry. */
export function deleteStickyNote(db: Db, id: string): void {
  db.prepare('DELETE FROM sticky_notes WHERE id = ?').run(id);
}

function labelFor(db: Db, type: string, id: string): string {
  try {
    switch (type) {
      case 'attribute':
        return (db.prepare('SELECT name FROM attributes WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'Attribute';
      case 'skill':
        return (db.prepare('SELECT name FROM skills WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'Skill';
      case 'quest':
        return (db.prepare('SELECT title FROM quests WHERE id = ?').get(id) as { title: string } | undefined)?.title ?? 'Quest';
      case 'achievement':
        return (
          (db.prepare('SELECT name FROM achievement_definitions WHERE id = ?').get(id) as { name: string } | undefined)?.name ??
          'Achievement'
        );
      case 'inventory':
        return (db.prepare('SELECT name FROM inventory_items WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'Item';
      default:
        return 'Record';
    }
  } catch {
    return 'Record';
  }
}

function httpError(statusCode: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

export { LINK_TYPES };
