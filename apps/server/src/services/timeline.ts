import type { Db } from '../db.js';
import { nowIso, uuid } from '../util.js';

export type TimelineTargetType = 'activity' | 'attribute' | 'skill' | 'quest' | 'inventory' | 'achievement';

export interface TimelineInput {
  title: string;
  description?: string;
  eventType?: string;
  occurredAt?: string;
  source?: string;
  links?: Array<{ type: TimelineTargetType; id: string }>;
}

export function createTimelineEvent(db: Db, input: TimelineInput): string {
  const id = uuid();
  db.prepare(
    'INSERT INTO timeline_events (id, title, description, event_type, occurred_at, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.title.trim().slice(0, 200),
    input.description ?? '',
    input.eventType ?? 'personal',
    input.occurredAt ?? nowIso(),
    input.source ?? 'manual',
    nowIso(),
  );
  for (const link of input.links ?? []) {
    db.prepare(
      'INSERT OR IGNORE INTO timeline_links (id, event_id, target_type, target_id) VALUES (?, ?, ?, ?)',
    ).run(uuid(), id, link.type, link.id);
  }
  return id;
}

export function listTimeline(db: Db, options: { from?: string; to?: string; type?: string; limit?: number } = {}) {
  const where: string[] = [];
  const values: unknown[] = [];
  if (options.from) { where.push('occurred_at >= ?'); values.push(options.from); }
  if (options.to) { where.push('occurred_at <= ?'); values.push(options.to); }
  if (options.type) { where.push('event_type = ?'); values.push(options.type); }
  const events = db
    .prepare(
      `SELECT id, title, description, event_type AS eventType, occurred_at AS occurredAt, source, created_at AS createdAt
       FROM timeline_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY occurred_at DESC LIMIT ?`,
    )
    .all(...values, Math.min(1000, Math.max(1, options.limit ?? 300))) as Array<Record<string, unknown> & { id: string }>;

  const linkStmt = db.prepare('SELECT target_type AS type, target_id AS id FROM timeline_links WHERE event_id = ?');
  return events.map((event) => ({
    ...event,
    links: (linkStmt.all(event.id) as Array<{ type: TimelineTargetType; id: string }>).map((link) => ({
      ...link,
      label: labelForTarget(db, link.type, link.id),
    })),
  }));
}

export function updateTimelineEvent(
  db: Db,
  id: string,
  input: Partial<TimelineInput>,
): void {
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) { updates.push('title = ?'); values.push(input.title.trim()); }
  if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
  if (input.eventType !== undefined) { updates.push('event_type = ?'); values.push(input.eventType); }
  if (input.occurredAt !== undefined) { updates.push('occurred_at = ?'); values.push(input.occurredAt); }
  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE timeline_events SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  if (input.links) {
    db.prepare('DELETE FROM timeline_links WHERE event_id = ?').run(id);
    for (const link of input.links) {
      db.prepare('INSERT OR IGNORE INTO timeline_links (id, event_id, target_type, target_id) VALUES (?, ?, ?, ?)').run(
        uuid(),
        id,
        link.type,
        link.id,
      );
    }
  }
}

export function deleteTimelineEvent(db: Db, id: string): void {
  db.prepare('DELETE FROM timeline_events WHERE id = ?').run(id);
}

export function labelForTarget(db: Db, type: string, id: string): string {
  try {
    switch (type) {
      case 'activity': {
        const row = db.prepare('SELECT title FROM activities WHERE id = ?').get(id) as { title: string } | undefined;
        return row?.title ?? 'Activity';
      }
      case 'attribute': {
        const row = db.prepare('SELECT name FROM attributes WHERE id = ?').get(id) as { name: string } | undefined;
        return row?.name ?? 'Attribute';
      }
      case 'skill': {
        const row = db.prepare('SELECT name FROM skills WHERE id = ?').get(id) as { name: string } | undefined;
        return row?.name ?? 'Skill';
      }
      case 'quest': {
        const row = db.prepare('SELECT title FROM quests WHERE id = ?').get(id) as { title: string } | undefined;
        return row?.title ?? 'Quest';
      }
      case 'inventory': {
        const row = db.prepare('SELECT name FROM inventory_items WHERE id = ?').get(id) as { name: string } | undefined;
        return row?.name ?? 'Item';
      }
      case 'achievement': {
        const row = db
          .prepare('SELECT d.name FROM achievements a JOIN achievement_definitions d ON d.id = a.definition_id WHERE a.id = ? OR d.id = ?')
          .get(id, id) as { name: string } | undefined;
        return row?.name ?? 'Achievement';
      }
      default:
        return 'Record';
    }
  } catch {
    return 'Record';
  }
}
