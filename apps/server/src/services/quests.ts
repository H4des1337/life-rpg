import type { Db } from '../db.js';
import type { questCreateSchema, questUpdateSchema } from '@liferpg/shared';
import type { z } from 'zod';
import { nowIso, uuid } from '../util.js';
import { evaluateAchievements } from './achievements.js';
import { createTimelineEvent } from './timeline.js';

export type QuestCreate = z.infer<typeof questCreateSchema>;
export type QuestUpdate = z.infer<typeof questUpdateSchema>;

interface QuestRow {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  progress: number;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function listQuests(db: Db, options: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const values: unknown[] = [];
  if (options.status && options.status !== 'all') { where.push('status = ?'); values.push(options.status); }
  if (options.search) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const pattern = `%${options.search.replace(/[%_]/g, '')}%`;
    values.push(pattern, pattern);
  }
  const rows = db
    .prepare(`SELECT * FROM quests ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY
      CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, updated_at DESC`)
    .all(...values) as QuestRow[];
  return rows.map((row) => mapQuest(db, row));
}

export function getQuest(db: Db, id: string) {
  const row = db.prepare('SELECT * FROM quests WHERE id = ?').get(id) as QuestRow | undefined;
  if (!row) throw httpError(404, 'Quest not found.');
  return mapQuest(db, row);
}

function mapQuest(db: Db, row: QuestRow) {
  const milestones = db
    .prepare(
      'SELECT id, title, done, sort_order AS sortOrder, completed_at AS completedAt FROM quest_milestones WHERE quest_id = ? ORDER BY sort_order, title',
    )
    .all(row.id) as Array<{ id: string; title: string; done: number; sortOrder: number; completedAt: string | null }>;
  const links = db
    .prepare('SELECT target_type AS targetType, target_id AS targetId FROM quest_links WHERE quest_id = ?')
    .all(row.id) as Array<{ targetType: string; targetId: string }>;
  const attributes = links
    .filter((l) => l.targetType === 'attribute')
    .map((l) => db.prepare('SELECT id, name FROM attributes WHERE id = ?').get(l.targetId) as { id: string; name: string })
    .filter(Boolean);
  const skills = links
    .filter((l) => l.targetType === 'skill')
    .map((l) => db.prepare('SELECT id, name FROM skills WHERE id = ?').get(l.targetId) as { id: string; name: string })
    .filter(Boolean);
  const activityCount = (
    db.prepare("SELECT COUNT(*) AS c FROM activities WHERE quest_id = ? AND status = 'approved'").get(row.id) as { c: number }
  ).c;
  const activities = db
    .prepare(
      "SELECT id, title, occurred_at AS occurredAt, player_xp AS playerXp FROM activities WHERE quest_id = ? AND status = 'approved' ORDER BY occurred_at DESC LIMIT 20",
    )
    .all(row.id);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    progress: Math.round(row.progress * 10) / 10,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    milestones: milestones.map((m) => ({ ...m, done: m.done === 1 })),
    attributes,
    skills,
    activityCount,
    activities,
  };
}

export function createQuest(db: Db, input: QuestCreate) {
  const id = uuid();
  const now = nowIso();
  const completed = input.status === 'completed';
  const milestones = input.milestones ?? [];
  const milestoneProgress =
    milestones.length > 0
      ? Math.round((milestones.filter((milestone) => milestone.done).length / milestones.length) * 1000) / 10
      : undefined;
  const progress = completed ? 100 : milestoneProgress ?? input.progress ?? 0;
  const run = db.transaction(() => {
    db.prepare(
      'INSERT INTO quests (id, title, description, category, status, progress, target_date, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      input.title.trim(),
      input.description ?? '',
      input.category ?? '',
      input.status ?? 'active',
      progress,
      input.targetDate ?? null,
      completed ? now : null,
      now,
      now,
    );
    milestones.forEach((milestone, index) => {
      db.prepare(
        'INSERT INTO quest_milestones (id, quest_id, title, done, sort_order, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        uuid(),
        id,
        milestone.title.trim(),
        milestone.done ? 1 : 0,
        index,
        milestone.done ? now : null,
      );
    });
    linkTargets(db, id, input.attributeIds ?? [], input.skillIds ?? []);
  });
  run();
  const quest = getQuest(db, id);
  if (completed) {
    evaluateAchievements(db);
    createTimelineEvent(db, {
      title: `Quest completed: ${quest.title}`,
      description: quest.description,
      eventType: 'quest',
      source: 'quest',
      links: [{ type: 'quest', id }],
    });
  }
  return quest;
}

export function updateQuest(db: Db, id: string, input: QuestUpdate) {
  const existing = db.prepare('SELECT * FROM quests WHERE id = ?').get(id) as QuestRow | undefined;
  if (!existing) throw httpError(404, 'Quest not found.');
  const now = nowIso();

  const run = db.transaction(() => {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { updates.push('title = ?'); values.push(input.title.trim()); }
    if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
    if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
    if (input.targetDate !== undefined) { updates.push('target_date = ?'); values.push(input.targetDate); }
    if (input.progress !== undefined) { updates.push('progress = ?'); values.push(Math.max(0, Math.min(100, input.progress))); }

    let status = existing.status;
    if (input.status !== undefined) {
      status = input.status;
      updates.push('status = ?');
      values.push(status);
    }

    if (input.milestones) {
      const keepIds = new Set<string>();
      input.milestones.forEach((milestone, index) => {
        if (milestone.id) {
          const found = db.prepare('SELECT id FROM quest_milestones WHERE id = ? AND quest_id = ?').get(milestone.id, id);
          if (found) {
            keepIds.add(milestone.id);
            db.prepare('UPDATE quest_milestones SET title = ?, done = ?, sort_order = ?, completed_at = ? WHERE id = ?').run(
              milestone.title.trim(),
              milestone.done ? 1 : 0,
              index,
              milestone.done ? nowIso() : null,
              milestone.id,
            );
            return;
          }
        }
        const milestoneId = uuid();
        keepIds.add(milestoneId);
        db.prepare(
          'INSERT INTO quest_milestones (id, quest_id, title, done, sort_order, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(milestoneId, id, milestone.title.trim(), milestone.done ? 1 : 0, index, milestone.done ? nowIso() : null);
      });
      for (const row of db.prepare('SELECT id FROM quest_milestones WHERE quest_id = ?').all(id) as Array<{ id: string }>) {
        if (!keepIds.has(row.id)) db.prepare('DELETE FROM quest_milestones WHERE id = ?').run(row.id);
      }
      const totals = db
        .prepare('SELECT COUNT(*) AS total, SUM(done) AS done FROM quest_milestones WHERE quest_id = ?')
        .get(id) as { total: number; done: number | null };
      if (totals.total > 0) {
        const progress = Math.round(((totals.done ?? 0) / totals.total) * 1000) / 10;
        updates.push('progress = ?');
        values.push(progress);
      }
    }

    const allMilestones = db
      .prepare('SELECT COUNT(*) AS total, SUM(done) AS done FROM quest_milestones WHERE quest_id = ?')
      .get(id) as { total: number; done: number | null };
    const progressNow = allMilestones.total > 0 ? ((allMilestones.done ?? 0) / allMilestones.total) * 100 : undefined;
    if (status !== 'completed' && progressNow !== undefined && progressNow >= 100) status = 'completed';
    if (status === 'completed' && existing.status !== 'completed') {
      updates.push('status = ?', 'progress = ?', 'completed_at = ?');
      values.push('completed', 100, now);
    } else if (status !== 'completed' && existing.status === 'completed' && input.status !== undefined) {
      updates.push('completed_at = ?');
      values.push(null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now, id);
      db.prepare(`UPDATE quests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    if (input.attributeIds !== undefined || input.skillIds !== undefined) {
      db.prepare('DELETE FROM quest_links WHERE quest_id = ?').run(id);
      linkTargets(db, id, input.attributeIds ?? [], input.skillIds ?? []);
    }
  });
  run();

  const quest = getQuest(db, id);
  if (quest.status === 'completed' && existing.status !== 'completed') {
    evaluateAchievements(db);
    createTimelineEvent(db, {
      title: `Quest completed: ${quest.title}`,
      description: quest.description,
      eventType: 'quest',
      source: 'quest',
      links: [{ type: 'quest', id }],
    });
  }
  return quest;
}

export function deleteQuest(db: Db, id: string): void {
  db.prepare('DELETE FROM quests WHERE id = ?').run(id);
}

function linkTargets(db: Db, questId: string, attributeIds: string[], skillIds: string[]): void {
  for (const attributeId of attributeIds) {
    if (!db.prepare('SELECT id FROM attributes WHERE id = ?').get(attributeId)) continue;
    db.prepare('INSERT OR IGNORE INTO quest_links (id, quest_id, target_type, target_id) VALUES (?, ?, ?, ?)').run(
      uuid(),
      questId,
      'attribute',
      attributeId,
    );
  }
  for (const skillId of skillIds) {
    if (!db.prepare('SELECT id FROM skills WHERE id = ?').get(skillId)) continue;
    db.prepare('INSERT OR IGNORE INTO quest_links (id, quest_id, target_type, target_id) VALUES (?, ?, ?, ?)').run(
      uuid(),
      questId,
      'skill',
      skillId,
    );
  }
}

function httpError(statusCode: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}
