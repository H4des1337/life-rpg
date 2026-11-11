import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export interface AppPaths {
  root: string;
  databaseDir: string;
  databaseFile: string;
  storageDir: string;
  inventoryDir: string;
  journalDir: string;
  characterDir: string;
  activityDir: string;
  backupsDir: string;
  settingsDir: string;
  migrationsDir: string;
}

export function defaultDataRoot(): string {
  if (process.env.LIFERPG_DATA_DIR) return resolve(process.env.LIFERPG_DATA_DIR);
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
    return join(localAppData, 'LIFE_RPG_WEB');
  }
  return join(os.homedir(), '.local', 'share', 'LIFE_RPG_WEB');
}

export function resolvePaths(root = defaultDataRoot()): AppPaths {
  const storageDir = join(root, 'storage');
  return {
    root,
    databaseDir: join(root, 'database'),
    databaseFile: join(root, 'database', 'liferpg.db'),
    storageDir,
    inventoryDir: join(storageDir, 'inventory'),
    journalDir: join(storageDir, 'journal'),
    characterDir: join(storageDir, 'character'),
    activityDir: join(storageDir, 'activity'),
    backupsDir: join(root, 'backups'),
    settingsDir: join(root, 'settings'),
    migrationsDir:
      process.env.LIFERPG_MIGRATIONS_DIR ||
      fileURLToPath(new URL('../migrations', import.meta.url)),
  };
}

export function ensurePaths(paths: AppPaths): void {
  for (const dir of [
    paths.root,
    paths.databaseDir,
    paths.storageDir,
    paths.inventoryDir,
    paths.journalDir,
    paths.characterDir,
    paths.activityDir,
    paths.backupsDir,
    paths.settingsDir,
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): ServerConfig {
  const paths = resolvePaths();
  return {
    host: resolveBindHost(),
    port: Number(process.env.PORT || 3000),
    paths,
    webDist:
      process.env.LIFERPG_WEB_DIST ||
      fileURLToPath(new URL('../../web/dist', import.meta.url)),
    autoBackup: process.env.LIFERPG_DISABLE_AUTO_BACKUP !== '1',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || host === '0000:0000:0000:0000:0000:0000:0000:0001';
}

/**
 * Resolves the effective bind host with native local-only enforcement.
 *
 * Native (non-Docker) execution binds exclusively to 127.0.0.1. The HOST
 * environment variable cannot override this to a non-loopback address —
 * Host-header validation alone is insufficient because headers can be forged.
 *
 * Docker container runtime (LIFERPG_DOCKER=1) may bind to 0.0.0.0 so that
 * Docker bridge port forwarding works; host-side publication remains
 * 127.0.0.1:3000 via docker-compose.
 */
export function resolveBindHost(): string {
  const configured = process.env.HOST?.trim() || '127.0.0.1';
  const isDocker = process.env.LIFERPG_DOCKER === '1';

  if (!isDocker && !isLoopbackHost(configured)) {
    throw new Error(
      `Refusing to bind to non-loopback host '${configured}'. LIFE RPG binds exclusively to 127.0.0.1 for native execution. Use LIFERPG_DOCKER=1 only inside a container.`,
    );
  }

  return configured;
}

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

export const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/octet-stream': '.bin',
};

export const SAFE_INLINE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

export interface ServerConfig {
  host: string;
  port: number;
  paths: AppPaths;
  webDist: string;
  autoBackup: boolean;
  logLevel: string;
}
