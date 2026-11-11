import type { ActivityAnalysis, AllocationSuggestion, Taxonomy, XpTargetType } from './heuristic.js';

export const MAX_PLAYER_XP_PER_ACTIVITY = 50_000;
export const MAX_ATTRIBUTE_XP_PER_ACTIVITY = 100_000;
export const MAX_ALLOCATIONS = 24;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  analysis: ActivityAnalysis;
}

/**
 * The gate between AI/heuristic suggestions and persistence. The model never writes
 * progression values directly; only validated, user-approved allocations are applied.
 */
export function validateAnalysis(input: ActivityAnalysis, taxonomy: Taxonomy): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.reasoning || !input.reasoning.trim()) {
    warnings.push('Analysis reasoning was empty; a default explanation was recorded.');
  }
  const playerXp = clampInt(input.suggestedPlayerXp, 0, MAX_PLAYER_XP_PER_ACTIVITY);
  if (playerXp !== input.suggestedPlayerXp) {
    warnings.push(`Player XP was clamped to ${MAX_PLAYER_XP_PER_ACTIVITY.toLocaleString()}.`);
  }

  const resolved = new Map<string, AllocationSuggestion>();
  const raw = Array.isArray(input.allocations) ? input.allocations.slice(0, MAX_ALLOCATIONS) : [];
  if (Array.isArray(input.allocations) && input.allocations.length > MAX_ALLOCATIONS) {
    errors.push(`Too many allocations; the maximum is ${MAX_ALLOCATIONS}.`);
  }

  for (const allocation of raw) {
    if (!allocation || allocation.xp <= 0) continue;
    const target = resolveTarget(allocation.targetType, allocation.targetId, taxonomy);
    if (!target) {
      errors.push(`Allocation target "${allocation.targetName || allocation.targetId}" does not exist.`);
      continue;
    }
    const xp = clampInt(allocation.xp, 1, MAX_ATTRIBUTE_XP_PER_ACTIVITY);
    if (xp !== allocation.xp) warnings.push(`Allocation to "${target.name}" was clamped.`);
    const key = `${allocation.targetType}:${target.id}`;
    const existing = resolved.get(key);
    if (existing) {
      existing.xp += xp;
    } else {
      resolved.set(key, {
        targetType: allocation.targetType,
        targetId: target.id,
        targetName: target.name,
        xp,
        weight: Math.max(0, Number.isFinite(allocation.weight) ? allocation.weight : 0),
        rationale: (allocation.rationale || '').slice(0, 500),
        confidence: clampNumber(allocation.confidence, 0, 1),
      });
    }
  }

  let allocations = [...resolved.values()].sort((a, b) => b.xp - a.xp);
  let total = allocations.reduce((sum, a) => sum + a.xp, 0);
  if (total > MAX_ATTRIBUTE_XP_PER_ACTIVITY) {
    const factor = MAX_ATTRIBUTE_XP_PER_ACTIVITY / total;
    allocations = allocations.map((a) => ({ ...a, xp: Math.max(1, Math.floor(a.xp * factor)) }));
    total = allocations.reduce((sum, a) => sum + a.xp, 0);
    warnings.push('Attribute XP total was scaled down to the per-activity maximum.');
  }

  const weightTotal = allocations.reduce((sum, a) => sum + (a.weight > 0 ? a.weight : a.xp), 0);
  if (weightTotal > 0) {
    allocations = allocations.map((a) => ({
      ...a,
      weight: (a.weight > 0 ? a.weight : a.xp) / weightTotal,
    }));
  }

  // WPF parity: when player XP is awarded, total attribute XP across all
  // allocations must equal 2 × player XP. This is a hard invariant enforced
  // at the validation gate so AI, heuristic and manual suggestions can never
  // break the 2:1 rule. When player XP is 0 (pure practice), allocations are
  // left untouched — the rule only couples attribute progression to leveling.
  if (playerXp > 0 && allocations.length > 0 && total > 0) {
    const targetAttributeXp = playerXp * 2;
    if (total !== targetAttributeXp) {
      const factor = targetAttributeXp / total;
      allocations = allocations.map((a) => ({ ...a, xp: Math.max(1, Math.floor(a.xp * factor)) }));
      total = allocations.reduce((sum, a) => sum + a.xp, 0);
      warnings.push('Attribute XP was rebalanced to equal twice player XP (WPF parity).');
    }
  } else if (allocations.length === 0) {
    total = 0;
  }

  if (playerXp === 0 && total === 0 && !input.isMilestone) {
    warnings.push('This activity awards no XP. Increase significance, duration or allocations to record progression.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    analysis: {
      ...input,
      source: input.source === 'ai' || input.source === 'manual' ? input.source : 'heuristic',
      suggestedPlayerXp: playerXp,
      suggestedAttributeXp: total,
      confidence: clampNumber(input.confidence, 0, 1),
      allocations,
      warnings: [...new Set([...(input.warnings ?? []), ...warnings])],
      providerName: input.providerName || 'Unknown',
      modelName: input.modelName || '',
      classification: (input.classification || input.suggestedTimelineTitle || 'Activity').slice(0, 200),
      isMilestone: Boolean(input.isMilestone),
      suggestedInventoryName: input.suggestedInventoryName ?? '',
      suggestedInventoryCategory: input.suggestedInventoryCategory ?? '',
      suggestedTimelineTitle: input.suggestedTimelineTitle ?? '',
      suggestedTimelineDescription: input.suggestedTimelineDescription ?? '',
    },
  };
}

function resolveTarget(type: XpTargetType, id: string, taxonomy: Taxonomy): { id: string; name: string } | null {
  if (type === 'attribute') return taxonomy.attributes.find((a) => a.id === id) ?? null;
  if (type === 'sub_attribute') return taxonomy.subAttributes.find((a) => a.id === id) ?? null;
  if (type === 'skill') return taxonomy.skills.find((a) => a.id === id) ?? null;
  return null;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(max, Math.max(min, n));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}
