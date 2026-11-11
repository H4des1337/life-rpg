import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { parse } from '../http.js';
import { activityAnalyzeSchema, activityCreateSchema, aiConsentSchema, aiProviderCreateSchema, aiProviderUpdateSchema } from '@liferpg/shared';
import { analyzeActivity, createActivity, getActivity, listActivities, reverseActivity } from '../services/activities.js';
import {
  analyzeWithProvider,
  createProvider,
  deleteProvider,
  getDefaultProvider,
  listProviders,
  recordConsent,
  setDefaultProvider,
  updateProvider,
} from '../services/ai.js';
import { getAnalysisTaxonomy } from '../services/taxonomy.js';
import { validateAnalysis } from '@liferpg/domain';

export function registerActivityRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/activities/analyze', async (request) => {
    const input = parse(activityAnalyzeSchema, request.body);
    const taxonomy = getAnalysisTaxonomy(ctx.db);
    if (!input.useAi) {
      const analysis = analyzeActivity(ctx.db, { ...input });
      return { analysis, usedFallback: false, fallbackReason: null };
    }
    const provider = input.providerId
      ? (ctx.db.prepare('SELECT * FROM ai_provider_configs WHERE id = ?').get(input.providerId) as
          | { id: string; external_consent_at: string | null }
          | undefined)
      : getDefaultProvider(ctx.db);
    if (!provider) {
      const analysis = analyzeActivity(ctx.db, { ...input });
      analysis.warnings.push('No AI provider is configured. The built-in offline heuristic was used.');
      return { analysis, usedFallback: true, fallbackReason: 'No AI provider is configured.' };
    }
    if (!provider.external_consent_at) {
      throw Object.assign(
        new Error('Explicit consent is required before activity text is sent to an external AI provider. Configure consent in Settings → AI.'),
        { statusCode: 428 },
      );
    }
    try {
      const raw = await analyzeWithProvider(ctx.db, ctx.paths, input.providerId ?? provider.id, input, taxonomy);
      const validated = validateAnalysis(raw, taxonomy);
      return { analysis: validated.analysis, usedFallback: false, fallbackReason: null };
    } catch (error) {
      const analysis = analyzeActivity(ctx.db, { ...input });
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      analysis.warnings.push(`AI provider failed (${message}). The offline heuristic was used instead.`);
      return { analysis, usedFallback: true, fallbackReason: message };
    }
  });

  app.post('/api/activities', async (request, reply) => {
    const input = parse(activityCreateSchema, request.body);
    const result = createActivity(ctx.db, input);
    reply.code(201);
    return result;
  });

  app.get('/api/activities', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return listActivities(ctx.db, {
      search: query.search,
      limit: Number(query.limit) || 50,
      offset: Number(query.offset) || 0,
      status: query.status,
      from: query.from,
      to: query.to,
      questId: query.questId,
    });
  });

  app.get('/api/activities/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { activity: getActivity(ctx.db, id) };
  });

  app.post('/api/activities/:id/reverse', async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { reason?: string };
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : 'Correction';
    return { activity: reverseActivity(ctx.db, id, reason) };
  });

  app.get('/api/ai/providers', async () => ({ providers: listProviders(ctx.db) }));

  app.post('/api/ai/providers', async (request, reply) => {
    const input = parse(aiProviderCreateSchema, request.body);
    reply.code(201);
    return { provider: createProvider(ctx.db, ctx.paths, input), providers: listProviders(ctx.db) };
  });

  app.patch('/api/ai/providers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(aiProviderUpdateSchema, request.body);
    return { provider: updateProvider(ctx.db, ctx.paths, id, input), providers: listProviders(ctx.db) };
  });

  app.post('/api/ai/providers/:id/default', async (request) => {
    const { id } = request.params as { id: string };
    setDefaultProvider(ctx.db, id);
    return { providers: listProviders(ctx.db) };
  });

  app.post('/api/ai/providers/:id/consent', async (request) => {
    const { id } = request.params as { id: string };
    parse(aiConsentSchema, request.body);
    recordConsent(ctx.db, id);
    return { providers: listProviders(ctx.db) };
  });

  app.delete('/api/ai/providers/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteProvider(ctx.db, id);
    return { providers: listProviders(ctx.db) };
  });
}
