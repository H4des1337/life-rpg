import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../src/app.js';
import { resolvePaths, type ServerConfig } from '../src/config.js';
import type { AppContext } from '../src/context.js';

let dataDir: string;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let ctx: AppContext;
let close: () => void;

async function inject(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  const response = await app.inject({ method, url, payload: payload as never });
  return { status: response.statusCode, body: response.json(), raw: response };
}

function logActivity(input: {
  title: string;
  playerXp: number;
  allocations?: Array<{ targetType: 'attribute' | 'sub_attribute' | 'skill'; targetId: string; targetName?: string; xp: number }>;
  questId?: string | null;
  category?: string;
  occurredAt?: string;
}) {
  return inject('POST', '/api/activities', {
    title: input.title,
    description: `${input.title} description`,
    category: input.category ?? '',
    occurredAt: input.occurredAt,
    questId: input.questId ?? null,
    analysis: {
      source: 'manual',
      suggestedPlayerXp: input.playerXp,
      allocations: (input.allocations ?? []).map((allocation) => ({
        ...allocation,
        targetName: allocation.targetName ?? '',
        weight: 1,
      })),
    },
  });
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'liferpg-modules-'));
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
  ctx = built.ctx;
  close = () => void built.app.close();
  await app.ready();
  const created = await inject('POST', '/api/profile', { name: 'Milestone Tester' });
  expect(created.status).toBe(201);
});

afterAll(async () => {
  await close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* Windows may hold the WAL handle briefly; the temp folder is disposable. */
  }
});

describe('quest milestones', () => {
  it('derives progress from milestones on create and update', async () => {
    const created = await inject('POST', '/api/quests', {
      title: 'Ship the chronicle',
      description: 'A quest with milestones',
      milestones: [
        { title: 'Draft the schema', done: true },
        { title: 'Build the API', done: false },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.quest.milestones).toHaveLength(2);
    expect(created.body.quest.progress).toBe(50);
    expect(created.body.quest.status).toBe('active');

    const questId = created.body.quest.id as string;
    const draftId = created.body.quest.milestones.find((m: { title: string }) => m.title === 'Draft the schema').id;
    const buildId = created.body.quest.milestones.find((m: { title: string }) => m.title === 'Build the API').id;

    const completed = await inject('PATCH', `/api/quests/${questId}`, {
      milestones: [
        { id: draftId, title: 'Draft the schema', done: true },
        { id: buildId, title: 'Build the API', done: true },
      ],
    });
    expect(completed.status).toBe(200);
    expect(completed.body.quest.progress).toBe(100);
    expect(completed.body.quest.status).toBe('completed');
    expect(completed.body.quest.completedAt).toBeTruthy();
    expect(completed.body.quest.milestones.every((m: { done: boolean }) => m.done)).toBe(true);

    const timeline = await inject('GET', '/api/timeline?type=quest');
    expect(timeline.body.events.some((event: { title: string }) => event.title === 'Quest completed: Ship the chronicle')).toBe(
      true,
    );

    const added = await inject('PATCH', `/api/quests/${questId}`, {
      milestones: [
        { id: draftId, title: 'Draft the schema', done: true },
        { id: buildId, title: 'Build the API', done: true },
        { title: 'Publish the release', done: false },
      ],
    });
    expect(added.status).toBe(200);
    expect(added.body.quest.milestones).toHaveLength(3);
    expect(added.body.quest.progress).toBe(66.7);
    // Completion was explicit history, so adding an open milestone keeps the recorded status.
    expect(added.body.quest.status).toBe('completed');
  });

  it('validates quest input', async () => {
    const missingTitle = await inject('POST', '/api/quests', { description: 'no title' });
    expect(missingTitle.status).toBe(400);
  });
});

describe('activity ledger and history queries', () => {
  it('awards and reverses XP with an auditable ledger', async () => {
    const before = await inject('GET', '/api/bootstrap');
    const startingXp = before.body.profile.progression.totalLifetimeXp as number;

    const created = await logActivity({
      title: 'Wrote the ledger tests',
      playerXp: 120,
      category: 'Engineering',
      allocations: [{ targetType: 'attribute', targetId: 'attr-competence', targetName: 'Competence', xp: 120 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.activity.playerXp).toBe(120);
    expect(created.body.activity.status).toBe('approved');

    const activityId = created.body.activity.id as string;
    const afterAward = await inject('GET', '/api/bootstrap');
    expect(afterAward.body.profile.progression.totalLifetimeXp).toBe(startingXp + 120);

    const detail = await inject('GET', `/api/activities/${activityId}`);
    expect(detail.body.activity.transactions.map((t: { kind: string }) => t.kind)).toEqual(
      expect.arrayContaining(['award']),
    );

    const progression = await inject('GET', '/api/profile/progression');
    expect(progression.body.transactions.some((t: { activityId: string; kind: string }) => t.activityId === activityId && t.kind === 'award')).toBe(
      true,
    );

    const reversed = await inject('POST', `/api/activities/${activityId}/reverse`, { reason: 'Test correction' });
    expect(reversed.status).toBe(200);
    expect(reversed.body.activity.status).toBe('reversed');
    expect(reversed.body.activity.reversalReason).toBe('Test correction');
    expect(reversed.body.activity.transactions.some((t: { kind: string }) => t.kind === 'reversal')).toBe(true);

    const afterReversal = await inject('GET', '/api/bootstrap');
    expect(afterReversal.body.profile.progression.totalLifetimeXp).toBe(startingXp);

    const twice = await inject('POST', `/api/activities/${activityId}/reverse`, { reason: 'Again' });
    expect(twice.status).toBe(409);
  });

  it('filters activities by search, status, date range and quest', async () => {
    const quest = await inject('POST', '/api/quests', { title: 'History quest' });
    const questId = quest.body.quest.id as string;

    const linked = await logActivity({
      title: 'Linked history entry',
      playerXp: 40,
      questId,
      category: 'History',
      occurredAt: '2025-01-15T10:00:00.000Z',
    });
    expect(linked.status).toBe(201);
    await logActivity({
      title: 'Unlinked history entry',
      playerXp: 30,
      category: 'History',
      occurredAt: '2025-02-20T10:00:00.000Z',
    });

    const byQuest = await inject('GET', `/api/activities?questId=${questId}`);
    expect(byQuest.body.items).toHaveLength(1);
    expect(byQuest.body.items[0].title).toBe('Linked history entry');

    const bySearch = await inject('GET', '/api/activities?search=Unlinked');
    expect(bySearch.body.items.map((item: { title: string }) => item.title)).toContain('Unlinked history entry');

    const byRange = await inject(
      'GET',
      '/api/activities?from=2025-01-01T00:00:00.000Z&to=2025-01-31T23:59:59.999Z',
    );
    expect(byRange.body.items.map((item: { title: string }) => item.title)).toEqual(['Linked history entry']);

    const approved = await inject('GET', '/api/activities?status=approved&limit=100');
    expect(approved.body.items.every((item: { status: string }) => item.status === 'approved')).toBe(true);

    const noPanel = await inject('GET', '/api/xp/transactions?targetType=player&limit=200');
    expect(noPanel.status).toBe(200);
    expect(noPanel.body.some((row: { kind: string }) => row.kind === 'reversal')).toBe(true);
  });
});

describe('proficiency decay', () => {
  it('applies once and is idempotent when evaluated again', async () => {
    const skill = await inject('POST', '/api/skills', {
      name: 'Decaying Craft',
      decay: { enabled: true, graceDays: 0, intervalDays: 7, ratePerInterval: 5, minimumProficiency: 5 },
    });
    expect(skill.status).toBe(201);
    const skillId = skill.body.skill.id as string;

    const practice = await logActivity({
      title: 'Practised decaying craft',
      playerXp: 0,
      allocations: [{ targetType: 'skill', targetId: skillId, targetName: 'Decaying Craft', xp: 140 }],
    });
    expect(practice.status).toBe(201);

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 3_600_000).toISOString();
    ctx.db
      .prepare('UPDATE skills SET last_practice_at = ?, decay_anchor_at = NULL, decay_applied_intervals = 0 WHERE id = ?')
      .run(fortyDaysAgo, skillId);

    const first = await inject('GET', '/api/taxonomy');
    expect(first.status).toBe(200);

    const afterFirst = ctx.db
      .prepare('SELECT proficiency, debt, decay_applied_intervals AS applied, lifetime_xp AS lifetimeXp FROM skills WHERE id = ?')
      .get(skillId) as { proficiency: number; debt: number; applied: number; lifetimeXp: number };
    expect(afterFirst.applied).toBe(5);
    expect(afterFirst.debt).toBeGreaterThan(0);
    expect(afterFirst.lifetimeXp).toBe(140);

    const eventsAfterFirst = (
      ctx.db.prepare('SELECT COUNT(*) AS c FROM decay_events WHERE target_id = ?').get(skillId) as { c: number }
    ).c;
    expect(eventsAfterFirst).toBe(1);

    const second = await inject('GET', '/api/taxonomy');
    expect(second.status).toBe(200);
    const afterSecond = ctx.db
      .prepare('SELECT proficiency, debt, decay_applied_intervals AS applied FROM skills WHERE id = ?')
      .get(skillId) as { proficiency: number; debt: number; applied: number };
    expect(afterSecond.proficiency).toBe(afterFirst.proficiency);
    expect(afterSecond.debt).toBe(afterFirst.debt);
    expect(afterSecond.applied).toBe(afterFirst.applied);
    const eventsAfterSecond = (
      ctx.db.prepare('SELECT COUNT(*) AS c FROM decay_events WHERE target_id = ?').get(skillId) as { c: number }
    ).c;
    expect(eventsAfterSecond).toBe(1);
  });

  it('never decays certifications', async () => {
    const cert = await inject('POST', '/api/skills', {
      name: 'Certified Professional',
      isCertification: true,
      decay: { enabled: true, graceDays: 0, intervalDays: 1, ratePerInterval: 10, minimumProficiency: 1 },
    });
    const certId = cert.body.skill.id as string;
    const practice = await logActivity({
      title: 'Certification practice',
      playerXp: 0,
      allocations: [{ targetType: 'skill', targetId: certId, xp: 100 }],
    });
    expect(practice.status).toBe(201);
    ctx.db
      .prepare('UPDATE skills SET decay_enabled = 1, last_practice_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 30 * 24 * 3_600_000).toISOString(), certId);
    const row = ctx.db.prepare('SELECT proficiency FROM skills WHERE id = ?').get(certId) as { proficiency: number };
    expect(row.proficiency).toBeGreaterThan(0);

    await inject('GET', '/api/taxonomy');
    const after = ctx.db.prepare('SELECT proficiency FROM skills WHERE id = ?').get(certId) as { proficiency: number };
    expect(after.proficiency).toBe(row.proficiency);
    const decayCount = (
      ctx.db.prepare('SELECT COUNT(*) AS c FROM decay_events WHERE target_id = ?').get(certId) as { c: number }
    ).c;
    expect(decayCount).toBe(0);
  });
});

describe('attachments', () => {
  it('stores, verifies, previews and detects tampering', async () => {
    const item = await inject('POST', '/api/inventory', { name: 'Field notebook' });
    expect(item.status).toBe(201);
    const itemId = item.body.item.id as string;

    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcff1f0005030201a1f6c6b80000000049454e44ae426082',
      'hex',
    );
    const boundary = '----liferpgtestboundary';
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/files?ownerType=inventory&ownerId=${itemId}`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart,
    });
    expect(uploaded.statusCode).toBe(201);
    const file = uploaded.json().file;
    expect(file.original_name).toBe('note.png');
    expect(file.size).toBe(png.length);
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);

    const listed = await inject('GET', `/api/files?ownerType=inventory&ownerId=${itemId}`);
    expect(listed.body.files).toHaveLength(1);

    const verified = await inject('GET', `/api/files/${file.id}/verify`);
    expect(verified.body.ok).toBe(true);

    const preview = await app.inject({ method: 'GET', url: `/api/files/${file.id}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toContain('image/png');
    expect(Buffer.from(preview.rawPayload).equals(png)).toBe(true);

    const stored = ctx.db.prepare('SELECT relative_path FROM stored_files WHERE id = ?').get(file.id) as {
      relative_path: string;
    };
    const abs = join(ctx.paths.storageDir, stored.relative_path);
    writeFileSync(abs, Buffer.from('tampered'));
    const tampered = await inject('GET', `/api/files/${file.id}/verify`);
    expect(tampered.body.ok).toBe(false);

    const unlinked = await inject('DELETE', `/api/files/${file.id}?ownerType=inventory&ownerId=${itemId}`);
    expect(unlinked.status).toBe(200);
    const after = ctx.db.prepare('SELECT deleted_at FROM stored_files WHERE id = ?').get(file.id) as {
      deleted_at: string | null;
    };
    expect(after.deleted_at).toBeTruthy();
    expect(readFileSync(abs).toString()).toBe('tampered');
  });

  it('rejects unknown owners and unsupported content', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/files?ownerType=inventory&ownerId=does-not-exist',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      payload: Buffer.from('--x\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nhello\r\n--x--\r\n'),
    });
    expect(missing.statusCode).toBe(400);

    const item = await inject('POST', '/api/inventory', { name: 'Rejecting item' });
    const itemId = item.body.item.id as string;
    const spoofed = await app.inject({
      method: 'POST',
      url: `/api/files?ownerType=inventory&ownerId=${itemId}`,
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      payload: Buffer.from(
        '--x\r\nContent-Disposition: form-data; name="file"; filename="fake.png"\r\nContent-Type: image/png\r\n\r\nnot a png\r\n--x--\r\n',
      ),
    });
    expect(spoofed.statusCode).toBe(415);
  });
});

describe('backup round trip', () => {
  it('keeps the archive catalog after restore and never schedules auto backups', async () => {
    const backup = await inject('POST', '/api/backups', { label: 'test snapshot' });
    expect(backup.status).toBe(201);
    const manualId = backup.body.backup.id as string;

    const settings = await inject('GET', '/api/settings');
    expect(settings.body.autoBackupLastAt).toBeNull();

    const validated = await inject('POST', `/api/backups/${manualId}/validate`);
    expect(validated.body.ok).toBe(true);
    expect(validated.body.manifest.app).toBe('LIFE RPG');

    const quest = await inject('POST', '/api/quests', { title: 'Created after the snapshot' });
    expect(quest.status).toBe(201);

    const beforeRestore = await inject('GET', '/api/backups');
    const beforeCount = beforeRestore.body.backups.length as number;

    const restored = await inject('POST', `/api/backups/${manualId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.restored).toBe(true);
    expect(restored.body.preRestoreBackup).toMatch(/auto\.zip$/);

    const afterRestore = await inject('GET', '/api/backups');
    expect(afterRestore.body.backups).toHaveLength(beforeCount + 1);
    expect(afterRestore.body.backups.some((row: { id: string }) => row.id === manualId)).toBe(true);
    expect(afterRestore.body.backups.some((row: { kind: string }) => row.kind === 'auto')).toBe(true);

    const quests = await inject('GET', '/api/quests');
    expect(quests.body.quests.some((row: { title: string }) => row.title === 'Created after the snapshot')).toBe(false);

    const profile = await inject('GET', '/api/bootstrap');
    expect(profile.body.hasProfile).toBe(true);
  });

  it('rejects invalid and missing archives', async () => {
    const missing = await inject('POST', '/api/backups/not-a-real-id/restore');
    expect(missing.status).toBe(404);
  });
});

describe('progression invariants (WPF parity)', () => {
  function attrXp(id: string): number {
    return (
      ctx.db.prepare('SELECT lifetime_xp FROM attributes WHERE id = ?').get(id) as { lifetime_xp: number }
    ).lifetime_xp;
  }

  function playerXp(): number {
    return (
      ctx.db.prepare('SELECT lifetime_xp FROM player_profile WHERE id = ?').get('profile-primary') as {
        lifetime_xp: number;
      }
    ).lifetime_xp;
  }

  it('enforces attribute XP = 2 × player XP for manual activities', async () => {
    const beforeAttr = attrXp('attr-competence');
    const beforePlayer = playerXp();

    const created = await logActivity({
      title: 'Parity test activity',
      playerXp: 100,
      category: 'Engineering',
      allocations: [
        { targetType: 'attribute', targetId: 'attr-competence', targetName: 'Competence', xp: 100 },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.activity.playerXp).toBe(100);

    // Attribute received exactly twice player XP.
    expect(attrXp('attr-competence') - beforeAttr).toBe(200);
    expect(playerXp() - beforePlayer).toBe(100);
  });

  it('maintains 2 × player XP after diminishing returns', async () => {
    const beforeAttr = attrXp('attr-intellect');
    const beforePlayer = playerXp();

    // First activity: full value.
    const first = await logActivity({
      title: 'Diminishing parity test',
      playerXp: 100,
      category: 'Testing',
      allocations: [
        { targetType: 'attribute', targetId: 'attr-intellect', targetName: 'Intellect', xp: 100 },
      ],
    });
    expect(first.status).toBe(201);
    expect(first.body.activity.playerXp).toBe(100);

    // Second identical activity: diminishing multiplier 0.65 (step 0.35, prior=1).
    const second = await logActivity({
      title: 'Diminishing parity test',
      playerXp: 100,
      category: 'Testing',
      allocations: [
        { targetType: 'attribute', targetId: 'attr-intellect', targetName: 'Intellect', xp: 100 },
      ],
    });
    expect(second.status).toBe(201);
    expect(second.body.activity.playerXp).toBe(65); // 100 × 0.65

    // Player XP gained = 65, attribute XP gained = 130 (= 2 × 65).
    expect(playerXp() - beforePlayer).toBe(165); // 100 + 65
    expect(attrXp('attr-intellect') - beforeAttr).toBe(330); // 200 + 130 = 2 × 165
  });

  it('reversal exactly undoes player XP and attribute XP (2 × player)', async () => {
    const beforeAttr = attrXp('attr-competence');
    const beforePlayer = playerXp();

    // playerXp = 100, attribute allocation starts at 100 but validation scales to 200 (2 × player).
    const created = await logActivity({
      title: 'Reversal parity test',
      playerXp: 100,
      category: 'Testing',
      allocations: [
        { targetType: 'attribute', targetId: 'attr-competence', targetName: 'Competence', xp: 100 },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.activity.playerXp).toBe(100);
    expect(attrXp('attr-competence') - beforeAttr).toBe(200);
    expect(playerXp() - beforePlayer).toBe(100);

    const activityId = created.body.activity.id as string;

    const reversed = await inject('POST', `/api/activities/${activityId}/reverse`, {
      reason: 'Test correction',
    });
    expect(reversed.status).toBe(200);

    // Everything exactly back to pre-activity values.
    expect(attrXp('attr-competence')).toBe(beforeAttr);
    expect(playerXp()).toBe(beforePlayer);
  });

  it('reversal exactly undoes skill XP, 35% sub-attribute spillover and player XP', async () => {
    // Create a sub-attribute under Competence.
    const sub = await inject('POST', '/api/sub-attributes', {
      attributeId: 'attr-competence',
      name: 'Reversal Sub-Attribute',
    });
    expect(sub.status).toBe(201);
    const subId = sub.body.subAttribute.id as string;

    // Create a skill under that sub-attribute.
    const skill = await inject('POST', '/api/skills', {
      name: 'Reversal Skill',
      subAttributeId: subId,
    });
    expect(skill.status).toBe(201);
    const skillId = skill.body.skill.id as string;

    const beforeSkillXp = (
      ctx.db.prepare('SELECT lifetime_xp FROM skills WHERE id = ?').get(skillId) as { lifetime_xp: number }
    ).lifetime_xp;
    const beforeSubXp = (
      ctx.db.prepare('SELECT lifetime_xp FROM sub_attributes WHERE id = ?').get(subId) as { lifetime_xp: number }
    ).lifetime_xp;
    const beforeAttr = attrXp('attr-competence');
    const beforePlayer = playerXp();

    // playerXp = 100, skill allocation xp = 100 → validation scales skill to 200 (2 × player).
    // Sub-attribute spillover = floor(200 × 0.35) = 70.
    const created = await logActivity({
      title: 'Reversal spillover test',
      playerXp: 100,
      category: 'Testing',
      allocations: [{ targetType: 'skill', targetId: skillId, targetName: 'Reversal Skill', xp: 100 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.activity.playerXp).toBe(100);

    expect(
      (ctx.db.prepare('SELECT lifetime_xp FROM skills WHERE id = ?').get(skillId) as { lifetime_xp: number })
        .lifetime_xp - beforeSkillXp,
    ).toBe(200);
    expect(
      (ctx.db
        .prepare('SELECT lifetime_xp FROM sub_attributes WHERE id = ?')
        .get(subId) as { lifetime_xp: number }).lifetime_xp - beforeSubXp,
    ).toBe(70);
    expect(playerXp() - beforePlayer).toBe(100);

    const activityId = created.body.activity.id as string;

    const reversed = await inject('POST', `/api/activities/${activityId}/reverse`, {
      reason: 'Test correction',
    });
    expect(reversed.status).toBe(200);

    // Everything exactly back to pre-activity values.
    expect(
      (ctx.db.prepare('SELECT lifetime_xp FROM skills WHERE id = ?').get(skillId) as { lifetime_xp: number })
        .lifetime_xp,
    ).toBe(beforeSkillXp);
    expect(
      (ctx.db.prepare('SELECT lifetime_xp FROM sub_attributes WHERE id = ?').get(subId) as { lifetime_xp: number })
        .lifetime_xp,
    ).toBe(beforeSubXp);
    expect(attrXp('attr-competence')).toBe(beforeAttr);
    expect(playerXp()).toBe(beforePlayer);
  });

  it('keeps 35% skill-to-sub-attribute spillover on every award', async () => {
    const sub = await inject('POST', '/api/sub-attributes', {
      attributeId: 'attr-physical',
      name: 'Spillover Sub-Attribute',
    });
    expect(sub.status).toBe(201);
    const subId = sub.body.subAttribute.id as string;

    const skill = await inject('POST', '/api/skills', {
      name: 'Spillover Skill',
      subAttributeId: subId,
    });
    expect(skill.status).toBe(201);
    const skillId = skill.body.skill.id as string;

    const beforeSubXp = (
      ctx.db.prepare('SELECT lifetime_xp FROM sub_attributes WHERE id = ?').get(subId) as { lifetime_xp: number }
    ).lifetime_xp;

    await logActivity({
      title: 'Spillover test',
      playerXp: 50,
      category: 'Testing',
      allocations: [{ targetType: 'skill', targetId: skillId, targetName: 'Spillover Skill', xp: 100 }],
    });

    const afterSubXp = (
      ctx.db.prepare('SELECT lifetime_xp FROM sub_attributes WHERE id = ?').get(subId) as { lifetime_xp: number }
    ).lifetime_xp;
    expect(afterSubXp - beforeSubXp).toBe(35); // Math.floor(100 × 0.35)
  });
});
