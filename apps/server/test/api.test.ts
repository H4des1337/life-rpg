import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../src/app.js';
import { resolvePaths, type ServerConfig } from '../src/config.js';

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let close: () => void;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'liferpg-api-'));
  const paths = resolvePaths(dataDir);
  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 0,
    paths,
    webDist: join(dataDir, 'no-web-dist'),
    autoBackup: false,
    logLevel: 'silent',
  };
  const built = await buildApp({ config });
  app = built.app;
  close = () => void built.app.close();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* Windows may hold the WAL handle briefly; the temp folder is disposable. */
  }
});

describe('HTTP API security and core flow', () => {
  it('reports health without exposing filesystem paths', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(JSON.stringify(body)).not.toContain(dataDir);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(String(response.headers['content-security-policy'])).toContain("default-src 'self'");
  });

  it('rejects non-loopback Host headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'evil.example.com' },
    });
    expect(response.statusCode).toBe(421);
  });

  it('rejects cross-origin writes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' },
      payload: { name: 'Intruder' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('creates a profile and logs an activity end-to-end', async () => {
    const empty = await app.inject({ method: 'GET', url: '/api/bootstrap' });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().hasProfile).toBe(false);

    const created = await app.inject({
      method: 'POST',
      url: '/api/profile',
      payload: { name: 'Aria' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().profile.name).toBe('Aria');
    expect(created.json().profile.progression.level).toBe(1);

    const analyze = await app.inject({
      method: 'POST',
      url: '/api/activities/analyze',
      payload: {
        title: 'Studied German for two hours',
        description: 'Vocabulary and listening practice',
        durationMinutes: 120,
        difficulty: 3,
        effort: 4,
        significance: 3,
        category: 'Intellect',
      },
    });
    expect(analyze.statusCode).toBe(200);
    const analysis = analyze.json().analysis;
    expect(analysis.suggestedPlayerXp).toBeGreaterThan(0);
    expect(Array.isArray(analysis.allocations)).toBe(true);

    const log = await app.inject({
      method: 'POST',
      url: '/api/activities',
      payload: {
        title: 'Studied German for two hours',
        description: 'Vocabulary and listening practice',
        durationMinutes: 120,
        difficulty: 3,
        effort: 4,
        significance: 3,
        category: 'Intellect',
        analysis,
      },
    });
    expect(log.statusCode).toBe(201);
    const result = log.json();
    expect(result.activity.playerXp).toBeGreaterThan(0);
    expect(result.activity.status).toBe('approved');
    expect(result.newlyUnlocked.some((a: { name: string }) => a.name === 'First Step')).toBe(true);

    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap' });
    const data = bootstrap.json();
    expect(data.hasProfile).toBe(true);
    expect(data.profile.progression.totalLifetimeXp).toBeGreaterThan(0);
    expect(data.counts.activities).toBe(1);
    expect(data.achievements.some((a: { name: string; unlocked: boolean }) => a.name === 'First Step' && a.unlocked)).toBe(true);

    const reversal = await app.inject({
      method: 'POST',
      url: `/api/activities/${result.activity.id}/reverse`,
      payload: { reason: 'Test correction' },
    });
    expect(reversal.statusCode).toBe(200);
    expect(reversal.json().activity.status).toBe('reversed');
  });
});
