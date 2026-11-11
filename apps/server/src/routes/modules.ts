import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { parse } from '../http.js';
import {
  achievementDefinitionCreateSchema,
  questCreateSchema,
  questUpdateSchema,
  streakCreateSchema,
  timelineCreateSchema,
  timelineUpdateSchema,
} from '@liferpg/shared';
import { createQuest, deleteQuest, getQuest, listQuests, updateQuest } from '../services/quests.js';
import { createAchievementDefinition, deleteAchievementDefinition, listAchievements } from '../services/achievements.js';
import { checkInStreak, createStreak, deleteStreak, listStreaks, updateStreak } from '../services/streaks.js';
import { createTimelineEvent, deleteTimelineEvent, listTimeline, updateTimelineEvent } from '../services/timeline.js';
import { z } from 'zod';

const timelineLinkTypes = ['activity', 'attribute', 'skill', 'quest', 'inventory', 'achievement'] as const;

function linksFromBody(body: Record<string, unknown>): Array<{ type: (typeof timelineLinkTypes)[number]; id: string }> {
  const links: Array<{ type: (typeof timelineLinkTypes)[number]; id: string }> = [];
  const pairs: Array<[string, string]> = [
    ['attributeIds', 'attribute'],
    ['skillIds', 'skill'],
    ['questIds', 'quest'],
    ['inventoryIds', 'inventory'],
    ['achievementIds', 'achievement'],
  ];
  for (const [field, type] of pairs) {
    const values = body[field];
    if (Array.isArray(values)) {
      for (const id of values) {
        if (typeof id === 'string') links.push({ type: type as (typeof timelineLinkTypes)[number], id });
      }
    }
  }
  return links;
}

export function registerModuleRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/quests', async (request) => {
    const query = request.query as { status?: string; search?: string };
    return { quests: listQuests(ctx.db, query) };
  });

  app.get('/api/quests/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { quest: getQuest(ctx.db, id) };
  });

  app.post('/api/quests', async (request, reply) => {
    const input = parse(questCreateSchema, request.body);
    reply.code(201);
    return { quest: createQuest(ctx.db, input) };
  });

  app.patch('/api/quests/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(questUpdateSchema, request.body);
    return { quest: updateQuest(ctx.db, id, input) };
  });

  app.delete('/api/quests/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteQuest(ctx.db, id);
    return { ok: true };
  });

  app.get('/api/achievements', async () => ({ achievements: listAchievements(ctx.db) }));

  app.post('/api/achievements', async (request, reply) => {
    const input = parse(achievementDefinitionCreateSchema, request.body);
    reply.code(201);
    return { achievement: createAchievementDefinition(ctx.db, input), achievements: listAchievements(ctx.db) };
  });

  app.delete('/api/achievements/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteAchievementDefinition(ctx.db, id);
    return { achievements: listAchievements(ctx.db) };
  });

  app.get('/api/streaks', async () => ({ streaks: listStreaks(ctx.db) }));

  app.post('/api/streaks', async (request, reply) => {
    const input = parse(streakCreateSchema, request.body);
    reply.code(201);
    return { streak: createStreak(ctx.db, input), streaks: listStreaks(ctx.db) };
  });

  app.patch('/api/streaks/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(streakCreateSchema.partial(), request.body);
    return { streak: updateStreak(ctx.db, id, input), streaks: listStreaks(ctx.db) };
  });

  app.delete('/api/streaks/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteStreak(ctx.db, id);
    return { streaks: listStreaks(ctx.db) };
  });

  const checkinSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(1000).optional().default(''),
    remove: z.boolean().optional().default(false),
  });

  app.post('/api/streaks/:id/checkin', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(checkinSchema, request.body);
    return { streak: checkInStreak(ctx.db, id, input.date, input.note, input.remove), streaks: listStreaks(ctx.db) };
  });

  app.get('/api/timeline', async (request) => {
    const query = request.query as { from?: string; to?: string; type?: string; limit?: string };
    return { events: listTimeline(ctx.db, { ...query, limit: Number(query.limit) || 300 }) };
  });

  app.post('/api/timeline', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const input = parse(timelineCreateSchema, body);
    const id = createTimelineEvent(ctx.db, {
      title: input.title,
      description: input.description,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      source: 'manual',
      links: linksFromBody(body),
    });
    reply.code(201);
    return { id, events: listTimeline(ctx.db) };
  });

  app.patch('/api/timeline/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const input = parse(timelineUpdateSchema, body);
    updateTimelineEvent(ctx.db, id, {
      title: input.title,
      description: input.description,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      links: linksFromBody(body),
    });
    return { events: listTimeline(ctx.db) };
  });

  app.delete('/api/timeline/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteTimelineEvent(ctx.db, id);
    return { ok: true };
  });
}
