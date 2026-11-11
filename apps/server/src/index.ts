import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { autoBackupIfDue } from './services/backups.js';

const config = loadConfig();
const { app, ctx } = await buildApp({ config });

const timestamp = new Date().toISOString();
app.log.info(
  { app: 'LIFE RPG', version: '1.0.0', host: config.host, port: config.port, startedAt: timestamp },
  'starting',
);

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { url: `http://${config.host}:${config.port}`, dataMode: 'local-filesystem' },
    config.host === '127.0.0.1'
      ? 'LIFE RPG is listening on loopback only'
      : 'WARNING: LIFE RPG is not bound to loopback. Do not expose this port to the internet.',
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Automatic daily backup plus a lightweight retry cadence while the app stays open.
if (config.autoBackup) {
  setTimeout(() => {
    try {
      const backup = autoBackupIfDue(ctx.db, ctx.paths);
      if (backup) app.log.info({ filename: backup.filename }, 'automatic backup created');
    } catch (error) {
      app.log.error({ err: error }, 'automatic backup failed');
    }
  }, 2500).unref();
  setInterval(() => {
    try {
      autoBackupIfDue(ctx.db, ctx.paths);
    } catch {
      /* logged on next manual inspection; never crash the app for a backup */
    }
  }, 6 * 3600_000).unref();
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
