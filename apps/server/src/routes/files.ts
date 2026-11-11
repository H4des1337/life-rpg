import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context.js';
import { storeFile, getFile, listFilesForOwner, unlinkFile, verifyIntegrity, absolutePath, type FileOwnerType } from '../services/files.js';
import { createReadStream } from 'node:fs';
import { httpError } from '../http.js';

const OWNER_TYPES = new Set<FileOwnerType>(['inventory', 'journal', 'activity', 'character']);

export function registerFileRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/files', async (request) => {
    const query = request.query as { ownerType?: string; ownerId?: string };
    if (!query.ownerType || !OWNER_TYPES.has(query.ownerType as FileOwnerType) || !query.ownerId) {
      throw httpError(400, 'ownerType and ownerId are required.');
    }
    return { files: listFilesForOwner(ctx.db, query.ownerType as FileOwnerType, query.ownerId) };
  });

  app.post('/api/files', async (request, reply) => {
    const query = request.query as { ownerType?: string; ownerId?: string };
    if (!query.ownerType || !OWNER_TYPES.has(query.ownerType as FileOwnerType) || !query.ownerId) {
      throw httpError(400, 'ownerType and ownerId query parameters are required.');
    }
    if (!request.isMultipart()) throw httpError(415, 'A multipart/form-data upload is required.');
    const part = await request.file();
    if (!part) throw httpError(400, 'No file was uploaded.');
    const buffer = await part.toBuffer();
    const file = storeFile(ctx.db, ctx.paths, {
      buffer,
      filename: part.filename,
      mimeType: part.mimetype,
      ownerType: query.ownerType as FileOwnerType,
      ownerId: query.ownerId,
    });
    reply.code(201);
    return { file };
  });

  app.get('/api/files/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendStoredFile(ctx, reply, id, false);
  });

  app.get('/api/files/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendStoredFile(ctx, reply, id, true);
  });

  app.get('/api/files/:id/verify', async (request) => {
    const { id } = request.params as { id: string };
    return verifyIntegrity(ctx.db, ctx.paths, id);
  });

  app.delete('/api/files/:id', async (request) => {
    const query = request.query as { ownerType?: string; ownerId?: string };
    if (!query.ownerType || !OWNER_TYPES.has(query.ownerType as FileOwnerType) || !query.ownerId) {
      throw httpError(400, 'ownerType and ownerId are required.');
    }
    const { id } = request.params as { id: string };
    return unlinkFile(ctx.db, id, query.ownerType as FileOwnerType, query.ownerId);
  });
}

function sendStoredFile(
  ctx: AppContext,
  reply: FastifyReply,
  id: string,
  inline: boolean,
) {
  const file = getFile(ctx.db, id);
  if (inline && !file.previewable) {
    throw httpError(415, 'This file type is not safe to preview. Download it instead.');
  }
  const abs = absolutePath(ctx.paths, file);
  const encoded = encodeURIComponent(file.original_name);
  reply
    .header('Content-Type', file.mime_type)
    .header('Content-Length', String(file.size))
    .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'private, max-age=0, must-revalidate')
    .header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  return reply.send(createReadStream(abs));
}
