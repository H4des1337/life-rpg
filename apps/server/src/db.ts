import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppPaths } from './config.js';

export type Db = Database.Database;

export interface DbHandle {
  db: Db;
  close: () => void;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  progressionBaseXp: '500',
  progressionQuadratic: '0.98',
  progressionLinear: '0',
  diminishingWindowHours: '24',
  diminishingStep: '0.35',
  diminishingFloor: '0.25',
  autoBackupEnabled: 'true',
  autoBackupRetention: '30',
  lastAutoBackupAt: '',
  selectedAiProviderId: '',
  themeAccent: 'gold',
  onboardingCompleted: 'false',
};

export function openDatabase(paths: AppPaths, options: { fileMustExist?: boolean } = {}): DbHandle {
  const db = new Database(paths.databaseFile, options);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  runMigrations(db, paths.migrationsDir);
  seedSettings(db);
  return {
    db,
    close: () => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        /* ignore checkpoint errors on close */
      }
      db.close();
    },
  };
}

export function runMigrations(db: Db, migrationsDir: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);

  const files = readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (!Number.isFinite(version)) continue;
    const existing = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
    if (existing) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        version,
        file,
        new Date().toISOString(),
      );
    });
    apply();
  }
}

export function seedSettings(db: Db): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, value, now);
  });
  tx();
}

export function getSetting(db: Db, key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

export function getSettings(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
