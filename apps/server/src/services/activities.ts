import type { Db } from '../db.js';
import {
  activityFingerprint,
  analyzeActivityHeuristically,
  diminishingMultiplier,
  validateAnalysis,
  type ActivityAnalysis,
} from '@liferpg/domain';
import type { ActivityCreateInput, ActivityDraftInput } from '@liferpg/shared';
import { getDiminishingConfig } from './settings.js';
import { getAnalysisTaxonomy, getTaxonomy } from './taxonomy.js';
import { applyPlayerDelta, applyTargetDelta, readTarget, snapshotAttribute } from './xp.js';
import { evaluateAchievements } from './achievements.js';
import { createTimelineEvent } from './timeline.js';
import { nowIso, uuid } from '../util.js';
import { getProfileRow } from './profile.js';

export interface ActivityRow {
  id: string;
  title: string;
  description: string;
  category: string;
  occurred_at: string;
  duration_minutes: number | null;
  difficulty: number;
  effort: number;
  significance: number;
  relevance: number;
  fingerprint: string;
  base_xp: number;
  multiplier: number;
  player_xp: number;
  status: 'approved' | 'reversed';
  source: string;
  provider_name: string;
  model_name: string;
  classification: string;
  reasoning: string;
  confidence: number;
  is_milestone: number;
  quest_id: string | null;
  created_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
}

interface AllocationRow {
  id: string;
  activity_id: string;
  target_type: 'attribute' | 'sub_attribute' | 'skill';
  target_id: string;
  target_name: string;
  xp: number;
  weight: number;
  rationale: string;
  confidence: number;
}

export function analyzeActivity(db: Db, input: ActivityDraftInput): ActivityAnalysis {
  const taxonomy = getAnalysisTaxonomy(db);
  // Server-side fallback ensures core functionality never depends on AI.
  const fallback = analyzeActivityHeuristically(input.input || input.description || '', input, taxonomy);
  return validateAnalysis(fallback, taxonomy).analysis;
}

export function createActivity(db: Db, input: ActivityCreateInput) {
  const profile = getProfileRow(db);
  if (!profile) {
    throw httpError(409, 'Create a character profile before logging activities.');
  }
  const taxonomy = getAnalysisTaxonomy(db);
  const analysis = input.analysis
    ? {
        ...input.analysis,
        allocations: input.analysis.allocations ?? [],
        warnings: input.analysis.warnings ?? [],
        suggestedAttributeXp: input.analysis.suggestedAttributeXp ?? 0,
        isMilestone: input.analysis.isMilestone ?? input.isMilestone,
        suggestedInventoryName: input.analysis.suggestedInventoryName ?? '',
        suggestedInventoryCategory: input.analysis.suggestedInventoryCategory ?? '',
        suggestedTimelineTitle: input.analysis.suggestedTimelineTitle ?? '',
        suggestedTimelineDescription: input.analysis.suggestedTimelineDescription ?? '',
        providerName: input.analysis.providerName ?? 'Manual',
        modelName: input.analysis.modelName ?? '',
        classification: input.analysis.classification ?? input.title,
        confidence: input.analysis.confidence ?? 1,
        reasoning: input.analysis.reasoning ?? '',
      }
    : analyzeActivityHeuristically(input.input || input.description || '', input, taxonomy);

  const validated = validateAnalysis(analysis as ActivityAnalysis, taxonomy);
  if (!validated.ok) {
    throw httpError(400, `Activity analysis failed validation: ${validated.errors.join(' ')}`);
  }
  const finalAnalysis = validated.analysis;
  const occurredAt = normalizeDate(input.occurredAt) ?? nowIso();
  const diminishing = getDiminishingConfig(db);
  const windowStart = new Date(new Date(occurredAt).getTime() - diminishing.windowHours * 3_600_000).toISOString();
  const fingerprint = activityFingerprint(input.title, input.category);
  const prior = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM activities WHERE fingerprint = ? AND status = 'approved' AND occurred_at >= ? AND occurred_at <= ?",
      )
      .get(fingerprint, windowStart, occurredAt) as { c: number }
  ).c;
  const multiplier = diminishingMultiplier(prior, diminishing);
  const baseXp = finalAnalysis.suggestedPlayerXp;
  const playerXp = Math.max(0, Math.round(baseXp * multiplier));

  if (input.questId) {
    const quest = db.prepare('SELECT id FROM quests WHERE id = ?').get(input.questId);
    if (!quest) throw httpError(400, 'Linked quest not found.');
  }

  const run = db.transaction(() => {
    const id = uuid();
    const createdAt = nowIso();
    db.prepare(
      `INSERT INTO activities
       (id, title, description, category, occurred_at, duration_minutes, difficulty, effort, significance, relevance,
        fingerprint, base_xp, multiplier, player_xp, status, source, provider_name, model_name, classification,
        reasoning, confidence, is_milestone, quest_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.title.trim(),
      input.description ?? '',
      input.category ?? '',
      occurredAt,
      input.durationMinutes ?? null,
      input.difficulty ?? 1,
      input.effort ?? 1,
      input.significance ?? 1,
      input.relevance ?? 3,
      fingerprint,
      baseXp,
      multiplier,
      playerXp,
      finalAnalysis.source,
      finalAnalysis.providerName,
      finalAnalysis.modelName,
      finalAnalysis.classification,
      finalAnalysis.reasoning,
      finalAnalysis.confidence,
      finalAnalysis.isMilestone ? 1 : 0,
      input.questId ?? null,
      createdAt,
    );

    const affectedAttributes = new Set<string>();
    // Apply the same diminishing multiplier to attribute/skill allocations so the
    // WPF-parity rule (attribute XP = 2 × player XP) holds after diminishing returns.
    const diminishedAllocations = finalAnalysis.allocations.map((a) => ({
      ...a,
      xp: Math.max(0, Math.round(a.xp * multiplier)),
    }));
    let attributeTotal = diminishedAllocations.reduce((sum, a) => sum + a.xp, 0);
    const targetAttributeXp = playerXp * 2;
    // `finalAllocations` holds the exact allocations that are persisted and
    // applied. When parity rebalancing runs, it replaces `diminishedAllocations`
    // so the award loop, spillover, ledger and reversal all use the same values.
    let finalAllocations: typeof diminishedAllocations = diminishedAllocations;
    // WPF parity: when player XP is awarded, total allocation XP must equal
    // 2 × player XP. When player XP is 0 (pure practice), allocations are
    // left as-is — the rule only couples attribute progression to leveling.
    if (
      playerXp > 0 &&
      diminishedAllocations.length > 0 &&
      attributeTotal > 0 &&
      attributeTotal !== targetAttributeXp
    ) {
      const factor = targetAttributeXp / attributeTotal;
      const adjusted = diminishedAllocations.map((a) => ({
        ...a,
        xp: Math.max(1, Math.floor(a.xp * factor)),
      }));
      attributeTotal = adjusted.reduce((sum, a) => sum + a.xp, 0);
      if (attributeTotal !== targetAttributeXp && adjusted.length > 0) {
        const gap = targetAttributeXp - attributeTotal;
        adjusted[0] = { ...adjusted[0], xp: Math.max(0, adjusted[0].xp + gap) };
        attributeTotal = adjusted.reduce((sum, a) => sum + a.xp, 0);
      }
      finalAllocations = adjusted;
    }
    for (const allocation of finalAllocations) {
      db.prepare(
        'INSERT INTO activity_allocations (id, activity_id, target_type, target_id, target_name, xp, weight, rationale, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        uuid(),
        id,
        allocation.targetType,
        allocation.targetId,
        allocation.targetName,
        allocation.xp,
        allocation.weight,
        allocation.rationale,
        allocation.confidence,
      );

      const target = readTarget(db, allocation.targetType, allocation.targetId);
      if (!target) continue;
      applyTargetDelta(
        db,
        allocation.targetType,
        allocation.targetId,
        allocation.xp,
        `Activity: ${input.title}`,
        id,
        occurredAt,
        'award',
      );
      if (allocation.targetType === 'attribute') {
        affectedAttributes.add(allocation.targetId);
      } else if (allocation.targetType === 'sub_attribute') {
        const row = db.prepare('SELECT attribute_id FROM sub_attributes WHERE id = ?').get(allocation.targetId) as
          | { attribute_id: string }
          | undefined;
        if (row) affectedAttributes.add(row.attribute_id);
      } else {
        const row = db
          .prepare(
            'SELECT s.sub_attribute_id, sub.attribute_id FROM skills s LEFT JOIN sub_attributes sub ON sub.id = s.sub_attribute_id WHERE s.id = ?',
          )
          .get(allocation.targetId) as { sub_attribute_id: string | null; attribute_id: string | null } | undefined;
        // Skills feed their parent sub-attribute at 35%, matching the original design.
        const spillover = Math.floor(allocation.xp * 0.35);
        if (row?.sub_attribute_id && spillover > 0) {
          applyTargetDelta(
            db,
            'sub_attribute',
            row.sub_attribute_id,
            spillover,
            `Skill practice spillover: ${input.title}`,
            id,
            occurredAt,
            'award',
          );
        }
        if (row?.attribute_id) affectedAttributes.add(row.attribute_id);
      }
    }
    for (const attributeId of affectedAttributes) snapshotAttribute(db, attributeId, id);

    const playerResult = playerXp > 0 ? applyPlayerDelta(db, playerXp, `Activity: ${input.title}`, id) : null;

    let inventoryId: string | null = null;
    if (input.createInventory) {
      const name = finalAnalysis.suggestedInventoryName || input.title;
      const categoryName = finalAnalysis.suggestedInventoryCategory || 'Experiences';
      const category = getOrCreateCategory(db, categoryName);
      inventoryId = uuid();
      db.prepare(
        'INSERT INTO inventory_items (id, name, description, category_id, acquired_at, external_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(inventoryId, name, finalAnalysis.suggestedTimelineDescription || input.description || '', category, occurredAt, '', createdAt, createdAt);
      for (const allocation of finalAnalysis.allocations) {
        if (allocation.targetType === 'attribute' || allocation.targetType === 'skill') {
          db.prepare(
            'INSERT OR IGNORE INTO inventory_links (id, item_id, target_type, target_id) VALUES (?, ?, ?, ?)',
          ).run(uuid(), inventoryId, allocation.targetType, allocation.targetId);
        }
      }
    }

    if (input.createTimeline || finalAnalysis.isMilestone) {
      createTimelineEvent(db, {
        title: finalAnalysis.suggestedTimelineTitle || input.title,
        description: finalAnalysis.suggestedTimelineDescription || input.description || '',
        eventType: finalAnalysis.isMilestone ? 'milestone' : 'activity',
        occurredAt,
        source: 'activity',
        links: [
          { type: 'activity', id },
          ...(input.questId ? [{ type: 'quest' as const, id: input.questId }] : []),
          ...finalAnalysis.allocations
            .filter((a) => a.targetType === 'attribute' || a.targetType === 'skill')
            .map((a) => ({ type: a.targetType as 'attribute' | 'skill', id: a.targetId })),
        ],
      });
    }

    const unlocked = evaluateAchievements(db);
    if (playerResult && playerResult.levelUps.length > 0) {
      createTimelineEvent(db, {
        title: `Reached level ${playerResult.levelAfter}`,
        description: `Player level ${playerResult.levelBefore} → ${playerResult.levelAfter}.`,
        eventType: 'level',
        occurredAt,
        source: 'progression',
        links: [],
      });
    }

    return {
      activity: getActivity(db, id),
      multiplier,
      priorSimilar: prior,
      levelUps: playerResult?.levelUps ?? [],
      levelAfter: playerResult?.levelAfter ?? profile.level,
      newlyUnlocked: unlocked,
      inventoryId,
    };
  });

  return run();
}

export function listActivities(
  db: Db,
  options: { search?: string; limit?: number; offset?: number; status?: string; from?: string; to?: string; questId?: string } = {},
) {
  const where: string[] = [];
  const values: unknown[] = [];
  if (options.search) {
    where.push('(a.title LIKE ? ESCAPE \'\\\' OR a.description LIKE ? ESCAPE \'\\\' OR a.category LIKE ? ESCAPE \'\\\')');
    const pattern = `%${options.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    values.push(pattern, pattern, pattern);
  }
  if (options.status) { where.push('a.status = ?'); values.push(options.status); }
  if (options.from) { where.push('a.occurred_at >= ?'); values.push(options.from); }
  if (options.to) { where.push('a.occurred_at <= ?'); values.push(options.to); }
  if (options.questId) { where.push('a.quest_id = ?'); values.push(options.questId); }
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const rows = db
    .prepare(
      `SELECT a.*, q.title AS quest_title FROM activities a LEFT JOIN quests q ON q.id = a.quest_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.occurred_at DESC, a.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset) as Array<ActivityRow & { quest_title: string | null }>;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM activities a ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`).get(...values) as {
      c: number;
    }
  ).c;
  return { items: rows.map((row) => mapActivity(db, row)), total, limit, offset };
}

export function getActivity(db: Db, id: string) {
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as ActivityRow | undefined;
  if (!row) throw httpError(404, 'Activity not found.');
  const transactions = db
    .prepare(
      'SELECT id, target_type AS targetType, target_id AS targetId, delta, balance_before AS balanceBefore, balance_after AS balanceAfter, reason, kind, created_at AS createdAt FROM xp_transactions WHERE activity_id = ? ORDER BY created_at',
    )
    .all(id);
  return { ...mapActivity(db, row), transactions };
}

function mapActivity(db: Db, row: ActivityRow) {
  const allocations = db
    .prepare(
      'SELECT target_type AS targetType, target_id AS targetId, target_name AS targetName, xp, weight, rationale, confidence FROM activity_allocations WHERE activity_id = ? ORDER BY xp DESC',
    )
    .all(row.id);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    occurredAt: row.occurred_at,
    durationMinutes: row.duration_minutes,
    difficulty: row.difficulty,
    effort: row.effort,
    significance: row.significance,
    relevance: row.relevance,
    baseXp: row.base_xp,
    multiplier: row.multiplier,
    playerXp: row.player_xp,
    status: row.status,
    source: row.source,
    providerName: row.provider_name,
    modelName: row.model_name,
    classification: row.classification,
    reasoning: row.reasoning,
    confidence: row.confidence,
    isMilestone: row.is_milestone === 1,
    questId: row.quest_id,
    createdAt: row.created_at,
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
    allocations,
  };
}

export function reverseActivity(db: Db, id: string, reason = 'Correction') {
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as ActivityRow | undefined;
  if (!activity) throw httpError(404, 'Activity not found.');
  if (activity.status === 'reversed') throw httpError(409, 'This activity has already been reversed.');
  const allocations = db.prepare('SELECT * FROM activity_allocations WHERE activity_id = ?').all(id) as AllocationRow[];

  const run = db.transaction(() => {
    applyPlayerDelta(db, -activity.player_xp, `Reversal: ${activity.title}`, id, 'reversal');
    const affectedAttributes = new Set<string>();
    for (const allocation of allocations) {
      const target = readTarget(db, allocation.target_type, allocation.target_id);
      if (!target) continue;
      applyTargetDelta(
        db,
        allocation.target_type,
        allocation.target_id,
        -allocation.xp,
        `Reversal: ${activity.title}`,
        id,
        nowIso(),
        'reversal',
      );
      if (allocation.target_type === 'attribute') affectedAttributes.add(allocation.target_id);
      else if (allocation.target_type === 'sub_attribute') {
        const row = db.prepare('SELECT attribute_id FROM sub_attributes WHERE id = ?').get(allocation.target_id) as
          | { attribute_id: string }
          | undefined;
        if (row) affectedAttributes.add(row.attribute_id);
      } else {
        const row = db
          .prepare(
            'SELECT s.sub_attribute_id, sub.attribute_id FROM skills s LEFT JOIN sub_attributes sub ON sub.id = s.sub_attribute_id WHERE s.id = ?',
          )
          .get(allocation.target_id) as { sub_attribute_id: string | null; attribute_id: string | null } | undefined;
        const spillover = Math.floor(allocation.xp * 0.35);
        if (row?.sub_attribute_id && spillover > 0) {
          applyTargetDelta(
            db,
            'sub_attribute',
            row.sub_attribute_id,
            -spillover,
            `Reversal of skill spillover: ${activity.title}`,
            id,
            nowIso(),
            'reversal',
          );
        }
        if (row?.attribute_id) affectedAttributes.add(row.attribute_id);
      }
    }
    for (const attributeId of affectedAttributes) snapshotAttribute(db, attributeId, id);
    db.prepare("UPDATE activities SET status = 'reversed', reversed_at = ?, reversal_reason = ? WHERE id = ?").run(
      nowIso(),
      reason.slice(0, 500),
      id,
    );
    return getActivity(db, id);
  });
  return run();
}

function getOrCreateCategory(db: Db, name: string): string {
  const normalized = name.trim().slice(0, 80) || 'Experiences';
  const existing = db.prepare('SELECT id FROM inventory_categories WHERE name = ? COLLATE NOCASE').get(normalized) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = uuid();
  const sort = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM inventory_categories').get() as { next: number }).next;
  db.prepare('INSERT INTO inventory_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)').run(id, normalized, sort, nowIso());
  return id;
}

function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function httpError(statusCode: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

export { getTaxonomy };
