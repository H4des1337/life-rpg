import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { parse } from '../http.js';
import {
  journalCreateSchema,
  journalUpdateSchema,
  stickyNoteCreateSchema,
  stickyNoteUpdateSchema,
} from '@liferpg/shared';
import {
  createJournal,
  createStickyNote,
  deleteJournal,
  deleteStickyNote,
  getJournal,
  listJournal,
  listJournalCategories,
  listStickyNotes,
  updateJournal,
  updateStickyNote,
} from '../services/journal.js';

export function registerJournalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/journal/categories', async () => ({ categories: listJournalCategories(ctx.db) }));

  app.get('/api/journal', async (request) => {
    const query = request.query as { search?: string; category?: string; limit?: string; offset?: string };
    return listJournal(ctx.db, {
      search: query.search,
      category: query.category,
      limit: Number(query.limit) || 100,
      offset: Number(query.offset) || 0,
    });
  });

  app.get('/api/journal/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { entry: getJournal(ctx.db, id) };
  });

  app.post('/api/journal', async (request, reply) => {
    const input = parse(journalCreateSchema, request.body);
    reply.code(201);
    return { entry: createJournal(ctx.db, input) };
  });

  app.patch('/api/journal/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(journalUpdateSchema, request.body);
    return { entry: updateJournal(ctx.db, id, input) };
  });

  app.delete('/api/journal/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteJournal(ctx.db, id);
    return { ok: true };
  });

  app.get('/api/sticky-notes', async (request) => {
    const query = request.query as { includeHidden?: string };
    return { notes: listStickyNotes(ctx.db, query.includeHidden !== 'false') };
  });

  app.post('/api/sticky-notes', async (request, reply) => {
    const input = parse(stickyNoteCreateSchema, request.body);
    reply.code(201);
    return { note: createStickyNote(ctx.db, input) };
  });

  app.patch('/api/sticky-notes/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(stickyNoteUpdateSchema, request.body);
    return { note: updateStickyNote(ctx.db, id, input) };
  });

  app.delete('/api/sticky-notes/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteStickyNote(ctx.db, id);
    return { ok: true, journalPreserved: true };
  });
}
