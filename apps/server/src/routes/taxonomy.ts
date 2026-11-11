import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { parse } from '../http.js';
import {
  attributeCreateSchema,
  attributeUpdateSchema,
  skillCreateSchema,
  skillUpdateSchema,
  subAttributeCreateSchema,
  subAttributeUpdateSchema,
} from '@liferpg/shared';
import {
  createAttribute,
  createSkill,
  createSubAttribute,
  deleteAttribute,
  deleteSkill,
  deleteSubAttribute,
  getAttributeHistory,
  getProficiencyHistory,
  getTaxonomy,
  reorder,
  updateAttribute,
  updateSkill,
  updateSubAttribute,
} from '../services/taxonomy.js';

export function registerTaxonomyRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/taxonomy', async (request) => {
    const query = request.query as { decay?: string };
    return { attributes: getTaxonomy(ctx.db, { applyDecay: query.decay !== 'off' }) };
  });

  app.post('/api/attributes', async (request, reply) => {
    const input = parse(attributeCreateSchema, request.body);
    reply.code(201);
    return { attribute: createAttribute(ctx.db, input), attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.patch('/api/attributes/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(attributeUpdateSchema, request.body);
    return { attribute: updateAttribute(ctx.db, id, input), attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.delete('/api/attributes/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteAttribute(ctx.db, id);
    return { attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.post('/api/attributes/reorder', async (request) => {
    const body = request.body as { ids?: string[] };
    if (!Array.isArray(body?.ids)) throw Object.assign(new Error('ids array is required.'), { statusCode: 400 });
    reorder(ctx.db, 'attribute', body.ids.filter((id) => typeof id === 'string'));
    return { attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.post('/api/sub-attributes', async (request, reply) => {
    const input = parse(subAttributeCreateSchema, request.body);
    reply.code(201);
    return { subAttribute: createSubAttribute(ctx.db, input), attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.patch('/api/sub-attributes/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(subAttributeUpdateSchema, request.body);
    return { subAttribute: updateSubAttribute(ctx.db, id, input), attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.delete('/api/sub-attributes/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteSubAttribute(ctx.db, id);
    return { attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.post('/api/sub-attributes/reorder', async (request) => {
    const body = request.body as { ids?: string[] };
    if (!Array.isArray(body?.ids)) throw Object.assign(new Error('ids array is required.'), { statusCode: 400 });
    reorder(ctx.db, 'sub_attribute', body.ids.filter((id) => typeof id === 'string'));
    return { attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.post('/api/skills', async (request, reply) => {
    const input = parse(skillCreateSchema, request.body);
    reply.code(201);
    return { skill: createSkill(ctx.db, input), attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.patch('/api/skills/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(skillUpdateSchema, request.body);
    return { skill: updateSkill(ctx.db, id, input), attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.delete('/api/skills/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteSkill(ctx.db, id);
    return { attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.post('/api/skills/reorder', async (request) => {
    const body = request.body as { ids?: string[] };
    if (!Array.isArray(body?.ids)) throw Object.assign(new Error('ids array is required.'), { statusCode: 400 });
    reorder(ctx.db, 'skill', body.ids.filter((id) => typeof id === 'string'));
    return { attributes: getTaxonomy(ctx.db, { applyDecay: false }) };
  });

  app.get('/api/proficiency/:targetType/:id/history', async (request) => {
    const { targetType, id } = request.params as { targetType: string; id: string };
    if (!['skill', 'sub_attribute'].includes(targetType)) {
      throw Object.assign(new Error('History is available for skills and sub-attributes.'), { statusCode: 400 });
    }
    const query = request.query as { limit?: string };
    return { history: getProficiencyHistory(ctx.db, targetType, id, Number(query.limit) || 100) };
  });

  app.get('/api/attributes/:id/history', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    return { history: getAttributeHistory(ctx.db, id, Number(query.limit) || 100) };
  });
}
