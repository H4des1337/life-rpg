import type { Db } from '../db.js';
import type { AppPaths } from '../config.js';
import {
  analyzeActivityHeuristically,
  type ActivityAnalysis,
  type AllocationSuggestion,
  type Taxonomy,
  type XpTargetType,
} from '@liferpg/domain';
import type { ActivityDraftInput } from '@liferpg/shared';
import { nowIso, uuid } from '../util.js';
import { decryptSecret, encryptSecret, loadOrCreateKey } from '../secrets.js';

interface ProviderRow {
  id: string;
  name: string;
  kind: 'ollama' | 'openai';
  endpoint: string;
  model: string;
  api_key: string;
  enabled: number;
  is_default: number;
  external_consent_at: string | null;
  created_at: string;
}

function keyFor(paths: AppPaths): Buffer {
  return loadOrCreateKey(`${paths.settingsDir}/secret.key`);
}

export function listProviders(db: Db) {
  const rows = db.prepare('SELECT * FROM ai_provider_configs ORDER BY created_at').all() as ProviderRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    endpoint: row.endpoint,
    model: row.model,
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    hasApiKey: Boolean(row.api_key),
    consentGiven: Boolean(row.external_consent_at),
    createdAt: row.created_at,
  }));
}

export function createProvider(
  db: Db,
  paths: AppPaths,
  input: { name: string; kind: 'ollama' | 'openai'; endpoint: string; model: string; apiKey?: string; enabled?: boolean },
) {
  const key = keyFor(paths);
  const id = uuid();
  const now = nowIso();
  const count = (db.prepare('SELECT COUNT(*) AS c FROM ai_provider_configs').get() as { c: number }).c;
  db.prepare(
    `INSERT INTO ai_provider_configs (id, name, kind, endpoint, model, api_key, enabled, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name.trim(),
    input.kind,
    input.endpoint.replace(/\/+$/, ''),
    input.model.trim(),
    encryptSecret(input.apiKey ?? '', key),
    input.enabled === false ? 0 : 1,
    count === 0 ? 1 : 0,
    now,
    now,
  );
  return listProviders(db).find((p) => p.id === id);
}

export function updateProvider(
  db: Db,
  paths: AppPaths,
  id: string,
  input: { name?: string; kind?: 'ollama' | 'openai'; endpoint?: string; model?: string; apiKey?: string; enabled?: boolean },
) {
  const existing = db.prepare('SELECT * FROM ai_provider_configs WHERE id = ?').get(id) as ProviderRow | undefined;
  if (!existing) throw notFound('AI provider not found.');
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name.trim()); }
  if (input.kind !== undefined) { updates.push('kind = ?'); values.push(input.kind); }
  if (input.endpoint !== undefined) { updates.push('endpoint = ?'); values.push(input.endpoint.replace(/\/+$/, '')); }
  if (input.model !== undefined) { updates.push('model = ?'); values.push(input.model.trim()); }
  if (input.enabled !== undefined) { updates.push('enabled = ?'); values.push(input.enabled ? 1 : 0); }
  if (input.apiKey !== undefined) {
    updates.push('api_key = ?');
    values.push(input.apiKey === '' ? '' : encryptSecret(input.apiKey, keyFor(paths)));
  }
  updates.push('updated_at = ?');
  values.push(nowIso());
  values.push(id);
  db.prepare(`UPDATE ai_provider_configs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return listProviders(db).find((p) => p.id === id);
}

export function setDefaultProvider(db: Db, id: string): void {
  const exists = db.prepare('SELECT id FROM ai_provider_configs WHERE id = ?').get(id);
  if (!exists) throw notFound('AI provider not found.');
  const tx = db.transaction(() => {
    db.prepare('UPDATE ai_provider_configs SET is_default = 0').run();
    db.prepare('UPDATE ai_provider_configs SET is_default = 1, updated_at = ? WHERE id = ?').run(nowIso(), id);
  });
  tx();
}

export function deleteProvider(db: Db, id: string): void {
  db.prepare('DELETE FROM ai_provider_configs WHERE id = ?').run(id);
}

export function recordConsent(db: Db, id: string): void {
  db.prepare('UPDATE ai_provider_configs SET external_consent_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), id);
}

export function getDefaultProvider(db: Db): ProviderRow | null {
  return (
    (db.prepare('SELECT * FROM ai_provider_configs WHERE enabled = 1 AND is_default = 1 LIMIT 1').get() as ProviderRow | undefined) ??
    (db.prepare('SELECT * FROM ai_provider_configs WHERE enabled = 1 LIMIT 1').get() as ProviderRow | undefined) ??
    null
  );
}

/**
 * Sends ONLY the activity text and taxonomy names/IDs. No inventory documents,
 * journal entries or credentials are ever included. The user must opt in per request.
 */
export async function analyzeWithProvider(
  db: Db,
  paths: AppPaths,
  providerId: string | null,
  input: ActivityDraftInput,
  taxonomy: Taxonomy,
): Promise<ActivityAnalysis> {
  const provider = providerId
    ? (db.prepare('SELECT * FROM ai_provider_configs WHERE id = ?').get(providerId) as ProviderRow | undefined)
    : getDefaultProvider(db);
  if (!provider) throw new Error('No AI provider is configured.');
  if (provider.enabled !== 1) throw new Error('The selected AI provider is disabled.');

  const allowed = {
    attributes: taxonomy.attributes.map((a) => ({ id: a.id, name: a.name })),
    subAttributes: taxonomy.subAttributes.map((s) => ({ id: s.id, name: s.name, attributeId: s.attributeId })),
    skills: taxonomy.skills.map((s) => ({ id: s.id, name: s.name, subAttributeId: s.subAttributeId })),
  };

  const system = [
    'You are the activity classifier for LIFE RPG, a private life-progression journal.',
    'Return ONLY a JSON object. Never invent IDs; use only IDs from the provided taxonomy.',
    'Allocate attribute XP (equal to twice the player XP by design) across at most 3 matching targets.',
    'The deterministic server engine validates and applies your suggestion; you are not writing values.',
    'Schema: {"classification":string,"confidence":0..1,"reasoning":string,"playerXp":integer,',
    '"isMilestone":boolean,"inventoryName":string,"inventoryCategory":string,',
    '"allocations":[{"targetType":"attribute"|"sub_attribute"|"skill","targetId":string,"xp":integer,"rationale":string}]}',
  ].join(' ');

  const user = JSON.stringify({
    activity: {
      title: input.title,
      description: input.description,
      category: input.category,
      durationMinutes: input.durationMinutes,
      difficulty: input.difficulty,
      effort: input.effort,
      significance: input.significance,
      relevance: input.relevance,
    },
    allowedTargets: allowed,
  });

  const key = decryptSecret(provider.api_key, keyFor(paths));
  let content: string;

  if (provider.kind === 'ollama') {
    const response = await fetch(`${provider.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const payload = (await response.json()) as { message?: { content?: string } };
    content = payload.message?.content ?? '';
  } else {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (key) headers.authorization = `Bearer ${key}`;
    const response = await fetch(`${provider.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = payload.choices?.[0]?.message?.content ?? '';
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;
  const rawAllocations = Array.isArray(parsed.allocations) ? parsed.allocations : [];
  const allocations = rawAllocations
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const a = raw as Record<string, unknown>;
      const targetType = a.targetType;
      const targetId = String(a.targetId ?? '');
      if (targetType !== 'attribute' && targetType !== 'sub_attribute' && targetType !== 'skill') return null;
      const available =
        targetType === 'attribute'
          ? taxonomy.attributes
          : targetType === 'sub_attribute'
            ? taxonomy.subAttributes
            : taxonomy.skills;
      const target = available.find((t) => t.id === targetId);
      if (!target) return null;
      return {
        targetType: targetType as XpTargetType,
        targetId,
        targetName: target.name,
        xp: Math.max(0, Math.round(Number(a.xp) || 0)),
        weight: 0,
        rationale: String(a.rationale ?? 'Suggested by AI provider.').slice(0, 500),
        confidence: Math.min(1, Math.max(0, Number(a.confidence) || 0.6)),
      } satisfies AllocationSuggestion;
    })
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const playerXp = Math.max(0, Math.min(5000, Math.round(Number(parsed.playerXp) || 0)));
  const category = String(parsed.inventoryCategory ?? '');
  const name = String(parsed.inventoryName ?? '');
  return {
    source: 'ai',
    providerName: provider.name,
    modelName: provider.model,
    classification: String(parsed.classification ?? input.title).slice(0, 200),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
    reasoning: String(parsed.reasoning ?? 'AI classification.').slice(0, 2000),
    suggestedPlayerXp: playerXp,
    suggestedAttributeXp: allocations.reduce((sum, a) => sum + a.xp, 0),
    isMilestone: Boolean(parsed.isMilestone),
    allocations,
    suggestedInventoryName: name.slice(0, 200),
    suggestedInventoryCategory: category.slice(0, 80),
    suggestedTimelineTitle: String(parsed.classification ?? input.title).slice(0, 200),
    suggestedTimelineDescription: `Logged: ${input.title}`,
    warnings: [],
  };
}

export function heuristicFor(input: ActivityDraftInput, taxonomy: Taxonomy): ActivityAnalysis {
  return analyzeActivityHeuristically(input.input || input.description || '', input, taxonomy);
}

function notFound(message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = 404;
  return error;
}
