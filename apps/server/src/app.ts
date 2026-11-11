import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { ensurePaths, loadConfig, MAX_UPLOAD_BYTES, type ServerConfig } from './config.js';
import { openDatabase, type DbHandle } from './db.js';
import type { AppContext } from './context.js';
import { registerCoreRoutes } from './routes/core.js';
import { registerTaxonomyRoutes } from './routes/taxonomy.js';
import { registerActivityRoutes } from './routes/activities.js';
import { registerModuleRoutes } from './routes/modules.js';
import { registerJournalRoutes } from './routes/journal.js';
import { registerInventoryRoutes } from './routes/inventory.js';
import { registerFileRoutes } from './routes/files.js';
import { registerDataRoutes } from './routes/data.js';

export interface BuildAppOptions {
  config?: ServerConfig;
  databaseFile?: string;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function hostOnly(value: string): string {
  const host = (value ?? '').trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end > 0 ? host.slice(0, end + 1) : host;
  }
  return host.split(':')[0];
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host) || host === '0000:0000:0000:0000:0000:0000:0000:0001';
}

function parseAllowedHosts(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  );
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin || origin === 'null') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && isLoopbackHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const ALLOWED_REMOTE_HOSTS = parseAllowedHosts(process.env.LIFERPG_ALLOW_REMOTE_HOSTS);

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  ensurePaths(config.paths);
  let handle: DbHandle = openDatabase(config.paths);
  const ctx: AppContext = {
    db: handle.db,
    paths: config.paths,
    config,
    close: () => {
      handle.close();
    },
    reopen: () => {
      handle = openDatabase(config.paths);
      ctx.db = handle.db;
      return handle.db;
    },
  };

  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8, parts: 10 },
  });

  // Local-only boundary: reject DNS-rebinding hosts and cross-origin browser calls.
  // Only loopback hosts are allowed by default. LIFERPG_ALLOW_REMOTE_HOSTS may list
  // additional comma-separated hostnames (never 0.0.0.0 or a public interface).
  app.addHook('onRequest', async (request, reply) => {
    const host = hostOnly(request.headers.host ?? '');
    if (!isLoopbackHost(host) && !ALLOWED_REMOTE_HOSTS.has(host)) {
      reply.code(421).send({ error: 'Misdirected Request', message: 'LIFE RPG only accepts requests addressed to loopback (127.0.0.1).' });
      return reply;
    }
    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      reply.code(403).send({ error: 'Forbidden', message: 'Cross-origin requests are not allowed.' });
      return reply;
    }
    return undefined;
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (!reply.getHeader('content-security-policy')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
    }
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      reply.code(500).send({ error: 'Internal Server Error', message: 'An unexpected local server error occurred.' });
      return;
    }
    reply.code(statusCode).send({ error: err.name || 'Request Error', message: err.message });
  });

  registerCoreRoutes(app, ctx);
  registerTaxonomyRoutes(app, ctx);
  registerActivityRoutes(app, ctx);
  registerModuleRoutes(app, ctx);
  registerJournalRoutes(app, ctx);
  registerInventoryRoutes(app, ctx);
  registerFileRoutes(app, ctx);
  registerDataRoutes(app, ctx);

  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', wildcard: true });
  }

  app.setNotFoundHandler((request, reply) => {
    const isHtml = (request.headers.accept ?? '').includes('text/html');
    if (request.method === 'GET' && !request.url.startsWith('/api') && isHtml && existsSync(config.webDist)) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found', message: 'The requested resource does not exist.' });
  });

  app.addHook('onClose', async () => {
    ctx.close();
  });

  return { app, ctx };
}
