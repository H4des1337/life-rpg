import type { Db } from '../db.js';
import type { AppPaths } from '../config.js';
import { ALLOWED_MIME_TYPES, EXTENSION_BY_MIME, SAFE_INLINE_MIME, MAX_UPLOAD_BYTES } from '../config.js';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { nowIso } from '../util.js';

export type FileOwnerType = 'inventory' | 'journal' | 'activity' | 'character';

const OWNERS: Record<FileOwnerType, { table: string; folder: string }> = {
  inventory: { table: 'inventory_items', folder: 'inventory' },
  journal: { table: 'journal_entries', folder: 'journal' },
  activity: { table: 'activities', folder: 'activity' },
  character: { table: 'character', folder: 'character' },
};

export interface StoredFileRow {
  id: string;
  original_name: string;
  storage_name: string;
  relative_path: string;
  mime_type: string;
  size: number;
  sha256: string;
  created_at: string;
  deleted_at: string | null;
}

export function storeFile(
  db: Db,
  paths: AppPaths,
  input: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    ownerType: FileOwnerType;
    ownerId: string;
  },
) {
  if (input.buffer.length === 0) throw httpError(400, 'The uploaded file is empty.');
  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    throw httpError(413, `Files must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.`);
  }
  const mime = normalizeMime(input.mimeType, input.filename);
  if (!ALLOWED_MIME_TYPES.has(mime)) throw httpError(415, `Unsupported file type: ${mime}`);
  validateMagicBytes(input.buffer, mime);
  const owner = OWNERS[input.ownerType];
  if (!owner) throw httpError(400, 'Unknown attachment owner.');
  const ownerRow = db.prepare(`SELECT id FROM ${owner.table} WHERE id = ?`).get(input.ownerId);
  if (!ownerRow) throw httpError(400, 'The item you are attaching to does not exist.');

  const sha256 = createHash('sha256').update(input.buffer).digest('hex');
  const safeOriginal = sanitizeFilename(input.filename);
  const ext = extensionFor(mime, safeOriginal);
  const storageName = `${randomUUID()}${ext}`;
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const relDir = `${owner.folder}/${year}/${month}`;
  const absDir = join(paths.storageDir, relDir);
  if (!existsSync(absDir)) mkdirSync(absDir, { recursive: true });
  const absPath = join(absDir, storageName);
  writeFileSync(absPath, input.buffer, { flag: 'wx' });

  const id = randomUUID();
  const relPath = `${relDir}/${storageName}`;
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO stored_files (id, original_name, storage_name, relative_path, mime_type, size, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, safeOriginal, storageName, relPath, mime, input.buffer.length, sha256, nowIso());
    db.prepare('INSERT OR IGNORE INTO file_links (id, file_id, owner_type, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      id,
      input.ownerType,
      input.ownerId,
      nowIso(),
    );
  });
  tx();
  return getFile(db, id);
}

export function getFile(db: Db, id: string): StoredFileRow & { previewable: boolean } {
  const row = db.prepare('SELECT * FROM stored_files WHERE id = ? AND deleted_at IS NULL').get(id) as StoredFileRow | undefined;
  if (!row) throw httpError(404, 'File not found.');
  return { ...row, previewable: SAFE_INLINE_MIME.has(row.mime_type) };
}

export function listFilesForOwner(db: Db, ownerType: FileOwnerType, ownerId: string) {
  return db
    .prepare(
      `SELECT f.id, f.original_name AS originalName, f.mime_type AS mimeType, f.size, f.sha256,
              f.created_at AS createdAt, link.created_at AS linkedAt
       FROM file_links link JOIN stored_files f ON f.id = link.file_id
       WHERE link.owner_type = ? AND link.owner_id = ? AND f.deleted_at IS NULL ORDER BY link.created_at`,
    )
    .all(ownerType, ownerId);
}

export function absolutePath(paths: AppPaths, row: StoredFileRow): string {
  const candidate = resolve(paths.storageDir, row.relative_path);
  const base = resolve(paths.storageDir);
  const rel = relative(base, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw httpError(400, 'Invalid stored file path.');
  if (!existsSync(candidate)) throw httpError(410, 'The stored file is missing from disk.');
  return candidate;
}

export function verifyIntegrity(db: Db, paths: AppPaths, id: string) {
  const file = getFile(db, id);
  const abs = absolutePath(paths, file);
  const buffer = readFileSync(abs);
  const hash = createHash('sha256').update(buffer).digest('hex');
  return {
    id,
    ok: hash === file.sha256 && statSync(abs).size === file.size,
    expectedSha256: file.sha256,
    actualSha256: hash,
    expectedSize: file.size,
    actualSize: buffer.length,
    checkedAt: nowIso(),
  };
}

/** Remove one link. The underlying file remains until no links reference it. */
export function unlinkFile(db: Db, id: string, ownerType: FileOwnerType, ownerId: string) {
  db.prepare('DELETE FROM file_links WHERE file_id = ? AND owner_type = ? AND owner_id = ?').run(id, ownerType, ownerId);
  const remaining = (db.prepare('SELECT COUNT(*) AS c FROM file_links WHERE file_id = ?').get(id) as { c: number }).c;
  if (remaining === 0) {
    db.prepare('UPDATE stored_files SET deleted_at = ? WHERE id = ?').run(nowIso(), id);
  }
  return { ok: true, fileRetained: true };
}

function normalizeMime(mimeType: string, filename: string): string {
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (mime && ALLOWED_MIME_TYPES.has(mime)) return mime;
  const ext = extname(filename).toLowerCase();
  const byExt: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return byExt[ext] ?? 'application/octet-stream';
}

function extensionFor(mime: string, filename: string): string {
  const fromName = extname(filename).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return EXTENSION_BY_MIME[mime] ?? '.bin';
}

function sanitizeFilename(name: string): string {
  const safe = basename(name || 'attachment')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .slice(0, 180)
    .trim();
  return safe || 'attachment';
}

function validateMagicBytes(buffer: Buffer, mime: string): void {
  const starts = (bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);
  switch (mime) {
    case 'application/pdf':
      if (!starts([0x25, 0x50, 0x44, 0x46])) throw httpError(415, 'The file does not look like a valid PDF.');
      break;
    case 'image/png':
      if (!starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw httpError(415, 'Invalid PNG file.');
      break;
    case 'image/jpeg':
      if (!starts([0xff, 0xd8, 0xff])) throw httpError(415, 'Invalid JPEG file.');
      break;
    case 'image/gif':
      if (!buffer.subarray(0, 6).toString('ascii').startsWith('GIF8')) throw httpError(415, 'Invalid GIF file.');
      break;
    case 'image/webp':
      if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
        throw httpError(415, 'Invalid WebP file.');
      }
      break;
    case 'application/zip':
    case 'application/x-zip-compressed':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      if (!starts([0x50, 0x4b])) throw httpError(415, 'Invalid ZIP-based document.');
      break;
    default:
      break;
  }
}

function httpError(statusCode: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

export { SAFE_INLINE_MIME };
