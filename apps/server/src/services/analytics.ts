import type { Db } from '../db.js';
import { Progression } from '@liferpg/domain';
import { getProgressionConfig } from './settings.js';
import { getTaxonomy } from './taxonomy.js';
import { listStreaks } from './streaks.js';

export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsRange {
  from: string;
  to: string;
  label: string;
  granularity: Granularity;
}

export function resolveRange(db: Db, range = '30', customFrom?: string, customTo?: string): AnalyticsRange {
  const now = new Date();
  const to = customTo ? new Date(customTo) : now;
  const safeTo = Number.isNaN(to.getTime()) ? now : to;
  let from: Date;
  let label = range;
  if (range === 'custom' && customFrom) {
    from = new Date(customFrom);
    if (Number.isNaN(from.getTime())) from = new Date(safeTo.getTime() - 30 * 86_400_000);
    label = 'custom';
  } else if (range === 'all') {
    const earliest = db
      .prepare(
        `SELECT MIN(ts) AS ts FROM (
          SELECT MIN(occurred_at) AS ts FROM activities
          UNION ALL SELECT MIN(created_at) FROM journal_entries
          UNION ALL SELECT MIN(created_at) FROM player_profile
        )`,
      )
      .get() as { ts: string | null };
    from = earliest.ts ? new Date(earliest.ts) : new Date(safeTo.getTime() - 30 * 86_400_000);
    label = 'all';
  } else {
    const days = { '7': 7, '30': 30, '90': 90, '180': 180, '365': 365 }[range] ?? 30;
    from = new Date(safeTo.getTime() - days * 86_400_000);
  }
  const spanDays = Math.max(1, Math.ceil((safeTo.getTime() - from.getTime()) / 86_400_000));
  const granularity: Granularity = spanDays <= 120 ? 'day' : spanDays <= 500 ? 'week' : 'month';
  return { from: from.toISOString(), to: safeTo.toISOString(), label, granularity };
}

export function getAnalytics(db: Db, rangeInput: AnalyticsRange) {
  const { from, to, granularity } = rangeInput;
  const profile = db.prepare('SELECT lifetime_xp, level FROM player_profile LIMIT 1').get() as
    | { lifetime_xp: number; level: number }
    | undefined;
  const progression = new Progression(getProgressionConfig(db));

  const activities = db
    .prepare(
      `SELECT id, title, category, occurred_at, player_xp, duration_minutes, status
       FROM activities WHERE occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at`,
    )
    .all(from, to) as Array<{
    id: string;
    title: string;
    category: string;
    occurred_at: string;
    player_xp: number;
    duration_minutes: number | null;
    status: string;
  }>;

  const approved = activities.filter((a) => a.status === 'approved');
  const totalActivities = approved.length;
  const earnedXp = approved.reduce((sum, a) => sum + a.player_xp, 0);
  const learningMinutes = approved.reduce((sum, a) => sum + (a.duration_minutes ?? 0), 0);
  const lifetime = profile?.lifetime_xp ?? 0;
  const baselineXp = Math.max(0, lifetime - earnedXp);

  const buckets = new Map<string, { xp: number; count: number }>();
  for (const activity of approved) {
    const key = bucketKey(activity.occurred_at, granularity);
    const entry = buckets.get(key) ?? { xp: 0, count: 0 };
    entry.xp += activity.player_xp;
    entry.count += 1;
    buckets.set(key, entry);
  }
  const xpSeries: Array<{ date: string; xp: number; cumulativeXp: number; level: number }> = [];
  let running = baselineXp;
  const start = new Date(from);
  const end = new Date(to);
  const cursor = bucketStart(start, granularity);
  const guard = 0;
  while (cursor.getTime() <= end.getTime() && xpSeries.length < 800) {
    const key = bucketKey(cursor.toISOString(), granularity);
    const entry = buckets.get(key);
    running += entry?.xp ?? 0;
    xpSeries.push({
      date: key,
      xp: entry?.xp ?? 0,
      cumulativeXp: running,
      level: progression.getState(running).level,
    });
    advance(cursor, granularity);
    if (guard > 10000) break;
  }
  if (xpSeries.length === 0) {
    xpSeries.push({ date: bucketKey(to, granularity), xp: 0, cumulativeXp: lifetime, level: progression.getState(lifetime).level });
  }

  const levelRows = db
    .prepare('SELECT level, recorded_at AS recordedAt FROM player_progression WHERE recorded_at >= ? AND recorded_at <= ? ORDER BY recorded_at')
    .all(from, to) as Array<{ level: number; recordedAt: string }>;
  const levelSeries = levelRows.map((row) => ({ date: row.recordedAt.slice(0, 10), level: row.level }));
  if (levelSeries.length === 0) {
    levelSeries.push({ date: to.slice(0, 10), level: profile?.level ?? 1 });
  }

  const taxonomy = getTaxonomy(db, { applyDecay: false });
  const attributeRadar = taxonomy.map((attribute) => ({
    attribute: attribute.name,
    current: attribute.proficiency,
    peak: attribute.peakProficiency,
    color: attribute.color,
  }));

  const breakdownRows = db
    .prepare(
      `SELECT CASE WHEN category = '' THEN 'Uncategorised' ELSE category END AS name, COUNT(*) AS count, SUM(player_xp) AS xp
       FROM activities WHERE status = 'approved' AND occurred_at >= ? AND occurred_at <= ?
       GROUP BY name ORDER BY xp DESC`,
    )
    .all(from, to) as Array<{ name: string; count: number; xp: number }>;

  const attributeHistory = db
    .prepare(
      `SELECT h.recorded_at AS recordedAt, h.proficiency, a.id, a.name
       FROM attribute_history h JOIN attributes a ON a.id = h.attribute_id
       WHERE h.recorded_at >= ? AND h.recorded_at <= ? ORDER BY h.recorded_at`,
    )
    .all(from, to) as Array<{ recordedAt: string; proficiency: number; id: string; name: string }>;
  const attrMap = new Map<string, { name: string; points: Array<{ date: string; value: number }> }>();
  for (const row of attributeHistory) {
    const entry = attrMap.get(row.id) ?? { name: row.name, points: [] };
    const date = bucketKey(row.recordedAt, granularity);
    const existing = entry.points.find((p) => p.date === date);
    if (existing) existing.value = Math.round(row.proficiency * 10) / 10;
    else entry.points.push({ date, value: Math.round(row.proficiency * 10) / 10 });
    attrMap.set(row.id, entry);
  }
  // Always show current condition so a fresh profile still has an honest frame of reference.
  for (const attribute of taxonomy) {
    if (!attrMap.has(attribute.id)) {
      attrMap.set(attribute.id, { name: attribute.name, points: [{ date: to.slice(0, 10), value: attribute.proficiency }] });
    }
  }

  const skillHistory = db
    .prepare(
      `SELECT h.recorded_at AS recordedAt, h.proficiency, h.target_id AS id, h.target_name AS name
       FROM proficiency_history h JOIN skills s ON s.id = h.target_id
       WHERE h.target_type = 'skill' AND h.recorded_at >= ? AND h.recorded_at <= ? ORDER BY h.recorded_at`,
    )
    .all(from, to) as Array<{ recordedAt: string; proficiency: number; id: string; name: string }>;
  const skillMap = new Map<string, { name: string; points: Array<{ date: string; value: number }> }>();
  for (const row of skillHistory) {
    const entry = skillMap.get(row.id) ?? { name: row.name, points: [] };
    const date = bucketKey(row.recordedAt, granularity);
    const existing = entry.points.find((p) => p.date === date);
    if (existing) existing.value = Math.round(row.proficiency * 10) / 10;
    else entry.points.push({ date, value: Math.round(row.proficiency * 10) / 10 });
    skillMap.set(row.id, entry);
  }

  const lastPractice = db
    .prepare(
      `SELECT COALESCE(a.id, s.attribute_id, sub.attribute_id) AS attributeId, MAX(act.occurred_at) AS lastAt
       FROM activity_allocations al
       JOIN activities act ON act.id = al.activity_id AND act.status = 'approved'
       LEFT JOIN attributes a ON a.id = al.target_id AND al.target_type = 'attribute'
       LEFT JOIN sub_attributes s ON s.id = al.target_id AND al.target_type = 'sub_attribute'
       LEFT JOIN skills k ON k.id = al.target_id AND al.target_type = 'skill'
       LEFT JOIN sub_attributes sub ON sub.id = k.sub_attribute_id
       GROUP BY COALESCE(a.id, s.attribute_id, sub.attribute_id)`,
    )
    .all() as Array<{ attributeId: string | null; lastAt: string }>;
  const practiceMap = new Map(lastPractice.map((row) => [row.attributeId, row.lastAt]));
  const now = Date.now();
  const neglect = taxonomy
    .map((attribute) => {
      const lastAt = practiceMap.get(attribute.id) ?? null;
      const daysInactive = lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86_400_000) : null;
      return {
        id: attribute.id,
        name: attribute.name,
        color: attribute.color,
        proficiency: attribute.proficiency,
        lastActivityAt: lastAt,
        daysInactive,
      };
    })
    .sort((a, b) => (b.daysInactive ?? 99999) - (a.daysInactive ?? 99999))
    .slice(0, 7);

  const spanMs = new Date(to).getTime() - new Date(from).getTime();
  const prevFrom = new Date(new Date(from).getTime() - spanMs).toISOString();
  const prev = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(player_xp),0) AS xp, COALESCE(SUM(duration_minutes),0) AS minutes
       FROM activities WHERE status = 'approved' AND occurred_at >= ? AND occurred_at < ?`,
    )
    .get(prevFrom, from) as { count: number; xp: number; minutes: number };

  const financialAttr = taxonomy.find((a) => a.key === 'financial');
  let financialXp = 0;
  if (financialAttr) {
    financialXp = (
      db
        .prepare(
          `SELECT COALESCE(SUM(al.xp),0) AS xp FROM activity_allocations al
           JOIN activities act ON act.id = al.activity_id AND act.status = 'approved'
           WHERE act.occurred_at >= ? AND act.occurred_at <= ?
             AND (
               (al.target_type = 'attribute' AND al.target_id = ?)
               OR (al.target_type = 'sub_attribute' AND al.target_id IN (SELECT id FROM sub_attributes WHERE attribute_id = ?))
               OR (al.target_type = 'skill' AND al.target_id IN (
                 SELECT s.id FROM skills s LEFT JOIN sub_attributes sub ON sub.id = s.sub_attribute_id WHERE sub.attribute_id = ?
               ))
             )`,
        )
        .get(from, to, financialAttr.id, financialAttr.id, financialAttr.id) as { xp: number }
    ).xp;
  }

  const achievementCount = (
    db.prepare('SELECT COUNT(*) AS c FROM achievements WHERE unlocked_at >= ? AND unlocked_at <= ?').get(from, to) as { c: number }
  ).c;
  const streaks = listStreaks(db);
  const recentActivities = db
    .prepare(
      `SELECT a.id, a.title, a.category, a.occurred_at AS occurredAt, a.player_xp AS playerXp, a.status
       FROM activities a ORDER BY a.occurred_at DESC LIMIT 12`,
    )
    .all();

  return {
    range: rangeInput,
    summary: {
      totalActivities,
      earnedXp,
      lifetimeXp: lifetime,
      level: progression.getState(lifetime).level,
      learningHours: Math.round((learningMinutes / 60) * 10) / 10,
      achievementsUnlocked: achievementCount,
      financialXp,
      netActivityCount: approved.length,
      currentStreak: Math.max(0, ...streaks.map((s) => s.current)),
      furthestStreak: Math.max(0, ...streaks.map((s) => s.longest)),
    },
    comparison: {
      activities: prev.count,
      playerXp: prev.xp,
      learningHours: Math.round((prev.minutes / 60) * 10) / 10,
      activityDelta: prev.count > 0 ? Math.round(((totalActivities - prev.count) / prev.count) * 100) : null,
      xpDelta: prev.xp > 0 ? Math.round(((earnedXp - prev.xp) / prev.xp) * 100) : null,
    },
    xpSeries,
    levelSeries,
    attributeRadar,
    attributeProgression: [...attrMap.values()],
    skillProgression: [...skillMap.values()].slice(0, 8),
    activityBreakdown: breakdownRows,
    neglect,
    streaks: streaks.map((s) => ({ id: s.id, name: s.name, current: s.current, longest: s.longest, cadence: s.cadence })),
    recentActivities,
    recentActivityList: activities.slice(-20).reverse(),
    hasData: approved.length > 0 || attributeHistory.length > 0 || skillHistory.length > 0,
  };
}

export function bucketKey(iso: string, granularity: Granularity): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  if (granularity === 'month') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  if (granularity === 'week') {
    const day = (date.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
    return monday.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function bucketStart(date: Date, granularity: Granularity): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === 'month') copy.setUTCDate(1);
  if (granularity === 'week') {
    const day = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - day);
  }
  return copy;
}

function advance(date: Date, granularity: Granularity): void {
  if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else if (granularity === 'week') date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCDate(date.getUTCDate() + 1);
}
