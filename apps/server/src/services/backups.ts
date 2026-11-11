import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Db } from '../db.js';
import type { AppPaths } from '../config.js';
import { getSettings, setSetting } from '../db.js';
import { nowIso, uuid } from '../util.js';
import { getAppearance } from './profile.js';

export interface BackupRow {
  id: string;
  filename: string;
  kind: 'manual' | 'auto';
  size: number;
  sha256: string;
  note: string;
  created_at: string;
}

export interface BackupManifest {
  app: string;
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  kind: string;
  note: string;
  database: { name: string; size: number; sha256: string };
  files: Array<{ path: string; size: number; sha256: string }>;
  settings: Record<string, string>;
  appearance: Record<string, unknown>;
}

export function listBackups(db: Db): BackupRow[] {
  return db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as BackupRow[];
}

export function createBackup(
  db: Db,
  paths: AppPaths,
  kind: 'manual' | 'auto' = 'manual',
  note = '',
): BackupRow {
  mkdirSync(paths.backupsDir, { recursive: true });
  db.pragma('wal_checkpoint(TRUNCATE)');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  let filename = `liferpg-backup-${stamp}-${kind}.zip`;
  let counter = 1;
  while (existsSync(join(paths.backupsDir, filename))) {
    filename = `liferpg-backup-${stamp}-${kind}-${counter}.zip`;
    counter += 1;
  }
  const zip = new AdmZip();

  const dbBuffer = readFileSync(paths.databaseFile);
  const dbSha = sha256(dbBuffer);
  zip.addFile('database/liferpg.db', dbBuffer);

  const files: BackupManifest['files'] = [];
  if (existsSync(paths.storageDir)) {
    walk(paths.storageDir).forEach((abs) => {
      const rel = relative(paths.storageDir, abs).replace(/\\/g, '/');
      const buffer = readFileSync(abs);
      files.push({ path: `storage/${rel}`, size: buffer.length, sha256: sha256(buffer) });
      zip.addFile(`storage/${rel}`, buffer);
    });
  }

  const schemaVersion = (
    db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as { v: number }
  ).v;
  const manifest: BackupManifest = {
    app: 'LIFE RPG',
    formatVersion: 1,
    schemaVersion,
    createdAt: nowIso(),
    kind,
    note: note.slice(0, 300),
    database: { name: 'database/liferpg.db', size: dbBuffer.length, sha256: dbSha },
    files,
    settings: getSettings(db),
    appearance: getAppearance(db),
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.addFile('settings.json', Buffer.from(JSON.stringify(manifest.settings, null, 2), 'utf8'));

  const fullPath = join(paths.backupsDir, filename);
  writeFileSync(fullPath, zip.toBuffer(), { flag: 'wx' });
  const buffer = readFileSync(fullPath);
  const row: BackupRow = {
    id: uuid(),
    filename,
    kind,
    size: buffer.length,
    sha256: sha256(buffer),
    note: note.slice(0, 300),
    created_at: nowIso(),
  };
  db.prepare('INSERT INTO backups (id, filename, kind, size, sha256, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    row.id,
    row.filename,
    row.kind,
    row.size,
    row.sha256,
    row.note,
    row.created_at,
  );
  if (kind === 'auto') setSetting(db, 'lastAutoBackupAt', row.created_at);
  pruneAutoBackups(db, paths);
  return row;
}

export function pruneAutoBackups(db: Db, paths: AppPaths): void {
  const retention = Number(getSettings(db).autoBackupRetention ?? '30');
  const auto = db.prepare("SELECT * FROM backups WHERE kind = 'auto' ORDER BY created_at DESC").all() as BackupRow[];
  for (const backup of auto.slice(Math.max(1, retention))) {
    const file = join(paths.backupsDir, backup.filename);
    if (existsSync(file)) rmSync(file, { force: true });
    db.prepare('DELETE FROM backups WHERE id = ?').run(backup.id);
  }
}

export function backupFilePath(paths: AppPaths, row: BackupRow): string {
  const candidate = resolve(paths.backupsDir, basename(row.filename));
  if (!candidate.startsWith(resolve(paths.backupsDir))) throw new Error('Invalid backup path.');
  return candidate;
}

export function validateBackup(paths: AppPaths, backup: BackupRow): {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest: BackupManifest | null;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let zip: AdmZip;
  try {
    zip = new AdmZip(backupFilePath(paths, backup));
  } catch {
    return { ok: false, errors: ['The backup archive cannot be opened.'], warnings, manifest: null };
  }
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    return { ok: false, errors: ['manifest.json is missing.'], warnings, manifest: null };
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(zip.readAsText(manifestEntry)) as BackupManifest;
  } catch {
    return { ok: false, errors: ['manifest.json is not valid JSON.'], warnings, manifest: null };
  }
  if (manifest.app !== 'LIFE RPG' || manifest.formatVersion !== 1) {
    errors.push('This is not a LIFE RPG backup in a supported format.');
  }
  const dbEntry = zip.getEntry('database/liferpg.db');
  if (!dbEntry) errors.push('The database file is missing from the backup.');
  else {
    const data = dbEntry.getData();
    if (sha256(data) !== manifest.database.sha256) errors.push('Database checksum does not match the manifest.');
    if (data.length !== manifest.database.size) errors.push('Database size does not match the manifest.');
    try {
      const tempPath = join(tmpdir(), `liferpg-verify-${uuid()}.db`);
      writeFileSync(tempPath, data);
      const probe = new Database(tempPath, { readonly: true });
      const integrity = probe.pragma('integrity_check') as Array<{ integrity_check: string }>;
      if (integrity[0]?.integrity_check !== 'ok') errors.push('SQLite integrity check failed.');
      const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
      for (const required of ['player_profile', 'attributes', 'activities', 'journal_entries']) {
        if (!tables.some((t) => t.name === required)) errors.push(`Required table "${required}" is missing.`);
      }
      probe.close();
      rmSync(tempPath, { force: true });
    } catch {
      errors.push('The embedded database could not be verified.');
    }
  }

  for (const file of manifest.files) {
    if (!isSafeArchivePath(file.path)) {
      errors.push(`Unsafe path in manifest: ${file.path}`);
      continue;
    }
    const entry = zip.getEntry(file.path);
    if (!entry) {
      warnings.push(`Attachment listed in manifest is missing: ${file.path}`);
      continue;
    }
    const data = entry.getData();
    if (sha256(data) !== file.sha256) errors.push(`Checksum mismatch for ${file.path}.`);
  }
  for (const entry of zip.getEntries()) {
    if (!isSafeArchivePath(entry.entryName)) errors.push(`Unsafe archive entry: ${entry.entryName}`);
  }

  return { ok: errors.length === 0, errors, warnings, manifest };
}

export interface RestoreHooks {
  close: () => void;
  reopen: () => Db;
}

/**
 * Restores a backup after creating a pre-restore safety snapshot. The current
 * storage directory is renamed, never deleted, so a failed restore is recoverable.
 */
export function restoreBackup(
  db: Db,
  paths: AppPaths,
  backupId: string,
  hooks: RestoreHooks,
): { restored: boolean; preRestoreBackup: string; warnings: string[] } {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as BackupRow | undefined;
  if (!backup) throw httpError(404, 'Backup not found.');
  const validation = validateBackup(paths, backup);
  if (!validation.ok || !validation.manifest) {
    throw httpError(400, `Backup validation failed: ${validation.errors.join(' ')}`);
  }

  const safety = createBackup(db, paths, 'auto', 'Automatic pre-restore safety snapshot');
  // The archived database predates the archive catalog. Keep the current rows so
  // the restored instance can still see every ZIP that exists on disk, including
  // the safety snapshot just created.
  const catalog = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as BackupRow[];
  const stamp = Date.now();
  const staging = join(paths.root, `restore-staging-${stamp}`);
  mkdirSync(staging, { recursive: true });
  const zip = new AdmZip(backupFilePath(paths, backup));
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (!isSafeArchivePath(entry.entryName)) throw httpError(400, 'The archive contains an unsafe path.');
    if (!['database/liferpg.db', 'manifest.json', 'settings.json'].includes(entry.entryName) && !entry.entryName.startsWith('storage/')) {
      continue;
    }
    const destination = join(staging, ...entry.entryName.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, entry.getData());
  }

  const stagedDb = join(staging, 'database', 'liferpg.db');
  if (!existsSync(stagedDb)) throw httpError(400, 'The backup does not contain a database.');

  const oldDb = `${paths.databaseFile}.pre-restore-${stamp}`;
  const oldStorage = `${paths.storageDir}.pre-restore-${stamp}`;
  let closed = false;
  try {
    hooks.close();
    closed = true;
    if (existsSync(paths.databaseFile)) copyFileSync(paths.databaseFile, oldDb);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${paths.databaseFile}${suffix}`;
      if (existsSync(sidecar)) rmSync(sidecar, { force: true });
    }
    if (existsSync(paths.storageDir)) renameSync(paths.storageDir, oldStorage);
    mkdirSync(paths.storageDir, { recursive: true });
    const stagedStorage = join(staging, 'storage');
    if (existsSync(stagedStorage)) {
      for (const file of walk(stagedStorage)) {
        const rel = relative(stagedStorage, file);
        const dest = join(paths.storageDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
      }
    }
    copyFileSync(stagedDb, paths.databaseFile);
    const reopened = hooks.reopen();
    reindexBackups(reopened, catalog);
    return { restored: true, preRestoreBackup: safety.filename, warnings: validation.warnings };
  } catch (error) {
    // Roll back the database and storage to the pre-restore state.
    if (closed) {
      try {
        if (existsSync(oldDb)) copyFileSync(oldDb, paths.databaseFile);
        if (existsSync(oldStorage)) {
          if (existsSync(paths.storageDir)) renameSync(paths.storageDir, `${paths.storageDir}.failed-${stamp}`);
          renameSync(oldStorage, paths.storageDir);
        }
        hooks.reopen();
      } catch {
        /* the pre-restore backup remains available if rollback itself fails */
      }
    }
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function deleteBackup(db: Db, paths: AppPaths, id: string): void {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(id) as BackupRow | undefined;
  if (!backup) throw httpError(404, 'Backup not found.');
  const file = backupFilePath(paths, backup);
  if (existsSync(file)) rmSync(file, { force: true });
  db.prepare('DELETE FROM backups WHERE id = ?').run(id);
}

export function autoBackupIfDue(db: Db, paths: AppPaths): BackupRow | null {
  const settings = getSettings(db);
  if (settings.autoBackupEnabled !== 'true') return null;
  const last = settings.lastAutoBackupAt;
  if (last) {
    const age = Date.now() - new Date(last).getTime();
    if (age < 24 * 3_600_000) return null;
  }
  return createBackup(db, paths, 'auto', 'Daily automatic backup');
}

function reindexBackups(db: Db, rows: BackupRow[]): void {
  if (rows.length === 0) return;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO backups (id, filename, kind, size, sha256, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run(row.id, row.filename, row.kind, row.size, row.sha256, row.note, row.created_at);
    }
  });
  tx();
}

function walk(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function isSafeArchivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return false;
  if (normalized.split('/').includes('..')) return false;
  return true;
}

function httpError(statusCode: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

export { sha256 };
