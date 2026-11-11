import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { getAnalytics, resolveRange } from '../services/analytics.js';
import {
  autoBackupIfDue,
  backupFilePath,
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  validateBackup,
} from '../services/backups.js';
import { createReadStream } from 'node:fs';
import { httpError } from '../http.js';

export function registerDataRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/analytics', async (request) => {
    const query = request.query as { range?: string; from?: string; to?: string };
    const range = resolveRange(ctx.db, query.range || '30', query.from, query.to);
    return getAnalytics(ctx.db, range);
  });

  app.get('/api/backups', async () => ({ backups: listBackups(ctx.db) }));

  app.post('/api/backups', async (request, reply) => {
    const body = (request.body ?? {}) as { note?: string; kind?: string };
    const backup = createBackup(
      ctx.db,
      ctx.paths,
      body.kind === 'auto' ? 'auto' : 'manual',
      typeof body.note === 'string' ? body.note.slice(0, 300) : '',
    );
    reply.code(201);
    return { backup, backups: listBackups(ctx.db) };
  });

  app.post('/api/backups/auto', async () => {
    const backup = autoBackupIfDue(ctx.db, ctx.paths);
    return { backup, backups: listBackups(ctx.db) };
  });

  app.get('/api/backups/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = listBackups(ctx.db).find((backup) => backup.id === id);
    if (!row) throw httpError(404, 'Backup not found.');
    const path = backupFilePath(ctx.paths, row);
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${row.filename.replace(/"/g, '')}"`)
      .header('Cache-Control', 'no-store');
    return reply.send(createReadStream(path));
  });

  app.post('/api/backups/:id/validate', async (request) => {
    const { id } = request.params as { id: string };
    const row = listBackups(ctx.db).find((backup) => backup.id === id);
    if (!row) throw httpError(404, 'Backup not found.');
    return validateBackup(ctx.paths, row);
  });

  app.post('/api/backups/:id/restore', async (request) => {
    const { id } = request.params as { id: string };
    const result = restoreBackup(ctx.db, ctx.paths, id, {
      close: () => ctx.close(),
      reopen: () => ctx.reopen(),
    });
    return { ...result, backups: listBackups(ctx.db) };
  });

  app.delete('/api/backups/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteBackup(ctx.db, ctx.paths, id);
    return { backups: listBackups(ctx.db) };
  });
}
