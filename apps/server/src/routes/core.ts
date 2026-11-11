import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { parse } from '../http.js';
import { profileCreateSchema, profileUpdateSchema, settingsUpdateSchema } from '@liferpg/shared';
import { createProfile, getAppearance, getProfile, updateAppearance, updateProfile } from '../services/profile.js';
import { getTaxonomy } from '../services/taxonomy.js';
import { listAchievements, getUnlockedCosmetics } from '../services/achievements.js';
import { listQuests } from '../services/quests.js';
import { listStreaks } from '../services/streaks.js';
import { listTimeline } from '../services/timeline.js';
import { listActivities } from '../services/activities.js';
import { getSettings, publicSettings, updateSettings } from '../services/settings.js';
import { listBackups } from '../services/backups.js';
import { listProviders } from '../services/ai.js';
import { listJournal } from '../services/journal.js';
import { listItems } from '../services/inventory.js';

export function registerCoreRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', async () => {
    const ok = (() => {
      try {
        ctx.db.prepare('SELECT 1').get();
        return true;
      } catch {
        return false;
      }
    })();
    return {
      status: ok ? 'ok' : 'degraded',
      app: 'LIFE RPG',
      version: '1.0.0',
      time: new Date().toISOString(),
      network: { binding: ctx.config.host, localOnly: ctx.config.host === '127.0.0.1' },
    };
  });

  app.get('/api/bootstrap', async () => {
    const profile = getProfile(ctx.db);
    const taxonomy = getTaxonomy(ctx.db);
    const activities = listActivities(ctx.db, { limit: 8 });
    const achievements = listAchievements(ctx.db);
    const quests = listQuests(ctx.db, { status: 'active' });
    const streaks = listStreaks(ctx.db);
    const timeline = listTimeline(ctx.db, { limit: 12 });
    const settings = publicSettings(ctx.db);
    const journal = listJournal(ctx.db, { limit: 5 });
    const inventory = listItems(ctx.db);
    const backups = listBackups(ctx.db);
    const providers = listProviders(ctx.db);
    const counts = {
      activities: (ctx.db.prepare("SELECT COUNT(*) AS c FROM activities WHERE status = 'approved'").get() as { c: number }).c,
      journal: (ctx.db.prepare('SELECT COUNT(*) AS c FROM journal_entries WHERE deleted_at IS NULL').get() as { c: number }).c,
      inventory: (ctx.db.prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE deleted_at IS NULL').get() as { c: number }).c,
      questsActive: quests.length,
      achievementsUnlocked: achievements.filter((a) => a.unlocked).length,
      skills: (ctx.db.prepare('SELECT COUNT(*) AS c FROM skills').get() as { c: number }).c,
      subAttributes: (ctx.db.prepare('SELECT COUNT(*) AS c FROM sub_attributes').get() as { c: number }).c,
      learningHours: Math.round(
        ((ctx.db.prepare("SELECT COALESCE(SUM(duration_minutes),0) AS m FROM activities WHERE status = 'approved'").get() as { m: number }).m / 60) * 10,
      ) / 10,
    };
    return {
      hasProfile: Boolean(profile),
      profile,
      taxonomy,
      recentActivities: activities.items,
      achievements: achievements.slice(0, 6),
      quests,
      streaks,
      timeline,
      journal: journal.items,
      inventory: inventory.slice(0, 5),
      settings,
      providers,
      backups: backups.slice(0, 3),
      cosmetics: getUnlockedCosmetics(ctx.db),
      counts,
      serverTime: new Date().toISOString(),
    };
  });

  app.post('/api/profile', async (request, reply) => {
    const input = parse(profileCreateSchema, request.body);
    const profile = createProfile(ctx.db, input);
    reply.code(201);
    return { profile, taxonomy: getTaxonomy(ctx.db) };
  });

  app.patch('/api/profile', async (request) => {
    const input = parse(profileUpdateSchema, request.body);
    return { profile: updateProfile(ctx.db, input) };
  });

  app.get('/api/profile/progression', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const history = ctx.db
      .prepare(
        'SELECT level, lifetime_xp AS lifetimeXp, xp_required AS xpRequired, kind, recorded_at AS recordedAt FROM player_progression ORDER BY recorded_at DESC LIMIT ?',
      )
      .all(limit);
    const transactions = ctx.db
      .prepare(
        "SELECT id, activity_id AS activityId, target_type AS targetType, target_id AS targetId, delta, balance_before AS balanceBefore, balance_after AS balanceAfter, reason, kind, created_at AS createdAt FROM xp_transactions WHERE target_type = 'player' ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit);
    return { history, transactions };
  });

  app.get('/api/xp/transactions', async (request) => {
    const query = request.query as { targetType?: string; targetId?: string; limit?: string };
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const where: string[] = [];
    const values: unknown[] = [];
    if (query.targetType) { where.push('target_type = ?'); values.push(query.targetType); }
    if (query.targetId) { where.push('target_id = ?'); values.push(query.targetId); }
    return ctx.db
      .prepare(
        `SELECT id, activity_id AS activityId, target_type AS targetType, target_id AS targetId, delta, balance_before AS balanceBefore, balance_after AS balanceAfter, reason, kind, created_at AS createdAt
         FROM xp_transactions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...values, limit);
  });

  app.get('/api/settings', async () => {
    const settings = publicSettings(ctx.db);
    const raw = getSettings(ctx.db);
    return {
      ...settings,
      hasProfile: Boolean(getProfile(ctx.db)),
      dataMode: 'local-filesystem',
      autoBackupLastAt: raw.lastAutoBackupAt || null,
    };
  });

  app.patch('/api/settings', async (request) => {
    const input = parse(settingsUpdateSchema, request.body);
    updateSettings(ctx.db, input);
    return { settings: publicSettings(ctx.db) };
  });

  app.get('/api/character', async () => {
    const profile = getProfile(ctx.db);
    return {
      appearance: getAppearance(ctx.db),
      cosmetics: getUnlockedCosmetics(ctx.db),
      profile,
      level: profile?.progression.level ?? 1,
    };
  });

  app.patch('/api/character/appearance', async (request) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const allowed = ['skinTone', 'hairStyle', 'hairColor', 'outfit', 'outfitColor', 'accessory', 'background'];
    const patch: Record<string, string> = {};
    for (const key of allowed) {
      if (typeof body[key] === 'string') patch[key] = String(body[key]).slice(0, 30);
    }
    return { appearance: updateAppearance(ctx.db, patch) };
  });
}
