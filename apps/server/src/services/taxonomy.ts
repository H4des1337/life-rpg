import type { Db } from '../db.js';
import {
  applyManualProficiency,
  capacity,
  clampProficiency,
  defaultDecayConfig,
  effectiveCondition,
  evaluateDecay,
  normalizeDecayConfig,
  normalizeWeights,
  type DecayConfig,
  type Taxonomy,
} from '@liferpg/domain';
import type { attributeCreateSchema, attributeUpdateSchema } from '@liferpg/shared';
import type { z } from 'zod';
import { nowIso, slugify, uuid } from '../util.js';

export interface AttributeRow {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  weight: number;
  sort_order: number;
  is_core: number;
  lifetime_xp: number;
  proficiency: number;
  peak_proficiency: number;
}

export interface SubRow {
  id: string;
  attribute_id: string;
  name: string;
  description: string;
  weight: number;
  sort_order: number;
  lifetime_xp: number;
  proficiency: number;
  peak_proficiency: number;
  debt: number;
  last_practice_at: string | null;
  decay_enabled: number;
  decay_grace_days: number;
  decay_interval_days: number;
  decay_rate: number;
  decay_minimum: number;
  recovery_per_xp: number;
  decay_anchor_at: string | null;
  decay_applied_intervals: number;
  last_decay_at: string | null;
}

export interface SkillRow extends Omit<SubRow, 'attribute_id'> {
  parent_skill_id: string | null;
  sub_attribute_id: string | null;
  is_certification: number;
}

interface DecayFields {
  decay_enabled: number;
  decay_grace_days: number;
  decay_interval_days: number;
  decay_rate: number;
  decay_minimum: number;
  recovery_per_xp: number;
  decay_anchor_at: string | null;
  decay_applied_intervals: number;
  last_decay_at: string | null;
}

export function decayFromRow(row: DecayFields): DecayConfig {
  return normalizeDecayConfig({
    enabled: row.decay_enabled === 1,
    graceDays: row.decay_grace_days,
    intervalDays: row.decay_interval_days,
    ratePerInterval: row.decay_rate,
    minimumProficiency: row.decay_minimum,
    recoveryPerXp: row.recovery_per_xp,
    anchorAt: row.decay_anchor_at,
    appliedIntervals: row.decay_applied_intervals,
    lastDecayAt: row.last_decay_at,
  });
}

function decayColumns(config: DecayConfig) {
  return {
    decay_enabled: config.enabled ? 1 : 0,
    decay_grace_days: config.graceDays,
    decay_interval_days: config.intervalDays,
    decay_rate: config.ratePerInterval,
    decay_minimum: config.minimumProficiency,
    recovery_per_xp: config.recoveryPerXp,
  };
}

export function applyDecay(db: Db, now = new Date()): number {
  const subs = db
    .prepare("SELECT * FROM sub_attributes WHERE decay_enabled = 1 AND last_practice_at IS NOT NULL AND lifetime_xp > 0")
    .all() as SubRow[];
  const skills = db
    .prepare(
      "SELECT * FROM skills WHERE decay_enabled = 1 AND is_certification = 0 AND last_practice_at IS NOT NULL AND lifetime_xp > 0",
    )
    .all() as SkillRow[];

  let applied = 0;
  const tx = db.transaction(() => {
    for (const row of subs) {
      if (applyOne(db, row, 'sub_attribute', now)) applied += 1;
    }
    for (const row of skills) {
      if (applyOne(db, row, 'skill', now)) applied += 1;
    }
  });
  tx();
  return applied;
}

function applyOne(db: Db, row: SubRow | SkillRow, targetType: 'sub_attribute' | 'skill', now: Date): boolean {
  const config = decayFromRow(row);
  const result = evaluateDecay(config, row.lifetime_xp, row.debt, row.last_practice_at, now);
  if (result.newIntervals <= 0) return false;
  const table = targetType === 'sub_attribute' ? 'sub_attributes' : 'skills';
  const peak = Math.max(row.peak_proficiency, result.current);
  db.prepare(
    `UPDATE ${table}
     SET proficiency = ?, peak_proficiency = ?, debt = ?, decay_anchor_at = ?, decay_applied_intervals = ?, last_decay_at = ?
     WHERE id = ?`,
  ).run(result.current, peak, result.debt, result.anchorAt, result.appliedIntervals, now.toISOString(), row.id);

  if (result.pointsRemoved > 0) {
    db.prepare(
      'INSERT INTO decay_events (id, target_type, target_id, target_name, intervals, points_removed, proficiency_after, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(uuid(), targetType, row.id, row.name, result.newIntervals, result.pointsRemoved, result.current, now.toISOString());
    db.prepare(
      'INSERT INTO proficiency_history (id, target_type, target_id, target_name, lifetime_xp, proficiency, peak_proficiency, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)',
    ).run(uuid(), targetType, row.id, row.name, row.lifetime_xp, result.current, peak, now.toISOString());
  }
  return result.pointsRemoved > 0;
}

function requireRow<T>(value: T | undefined, message: string): T {
  if (!value) {
    const error = new Error(message);
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return value;
}

function conflict(message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = 409;
  throw error;
}

export function getTaxonomy(db: Db, options: { applyDecay?: boolean } = {}) {
  if (options.applyDecay !== false) {
    applyDecay(db);
  }
  const attributes = db.prepare('SELECT * FROM attributes ORDER BY sort_order, name').all() as AttributeRow[];
  const subs = db.prepare('SELECT * FROM sub_attributes ORDER BY sort_order, name').all() as SubRow[];
  const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, name').all() as SkillRow[];

  const skillsByParent = new Map<string | null, SkillRow[]>();
  for (const skill of skills) {
    const key = skill.parent_skill_id ?? null;
    const list = skillsByParent.get(key) ?? [];
    list.push(skill);
    skillsByParent.set(key, list);
  }

  const effectiveSkill = new Map<string, { current: number; peak: number }>();
  const building = new Set<string>();

  function buildSkill(row: SkillRow): { current: number; peak: number } {
    const cached = effectiveSkill.get(row.id);
    if (cached) return cached;
    if (building.has(row.id)) return { current: row.proficiency, peak: row.peak_proficiency };
    building.add(row.id);
    const children = (skillsByParent.get(row.id) ?? []).map(buildSkill).map((eff, index) => ({
      current: eff.current,
      peak: eff.peak,
      weight: (skillsByParent.get(row.id) ?? [])[index]?.weight ?? 1,
    }));
    const result = effectiveCondition(
      { current: row.proficiency, peak: row.peak_proficiency },
      children,
    );
    building.delete(row.id);
    effectiveSkill.set(row.id, result);
    return result;
  }

  const rootSkillsBySub = new Map<string, SkillRow[]>();
  for (const skill of skills) {
    if (skill.parent_skill_id || !skill.sub_attribute_id) continue;
    const list = rootSkillsBySub.get(skill.sub_attribute_id) ?? [];
    list.push(skill);
    rootSkillsBySub.set(skill.sub_attribute_id, list);
  }
  for (const skill of skills) buildSkill(skill);

  function skillDto(row: SkillRow): Record<string, unknown> {
    const eff = effectiveSkill.get(row.id) ?? { current: row.proficiency, peak: row.peak_proficiency };
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      parentSkillId: row.parent_skill_id,
      subAttributeId: row.sub_attribute_id,
      weight: row.weight,
      sortOrder: row.sort_order,
      isCertification: row.is_certification === 1,
      lifetimeXp: row.lifetime_xp,
      proficiency: round2(eff.current),
      ownProficiency: round2(row.proficiency),
      peakProficiency: round2(Math.max(eff.peak, row.peak_proficiency)),
      lastPracticeAt: row.last_practice_at,
      decay: decayFromRow(row),
      children: (skillsByParent.get(row.id) ?? []).map(skillDto),
    };
  }

  const subsByAttr = new Map<string, SubRow[]>();
  for (const sub of subs) {
    const list = subsByAttr.get(sub.attribute_id) ?? [];
    list.push(sub);
    subsByAttr.set(sub.attribute_id, list);
  }

  function subDto(row: SubRow): Record<string, unknown> {
    const childNodes = (rootSkillsBySub.get(row.id) ?? []).map(skillDto);
    const effective = effectiveCondition(
      { current: row.proficiency, peak: row.peak_proficiency },
      childNodes.map((child) => ({
        current: Number(child.proficiency),
        peak: Number(child.peakProficiency),
        weight: Number(child.weight),
      })),
    );
    return {
      id: row.id,
      attributeId: row.attribute_id,
      name: row.name,
      description: row.description,
      weight: row.weight,
      sortOrder: row.sort_order,
      lifetimeXp: row.lifetime_xp,
      proficiency: round2(effective.current),
      ownProficiency: round2(row.proficiency),
      peakProficiency: round2(Math.max(effective.peak, row.peak_proficiency)),
      lastPracticeAt: row.last_practice_at,
      decay: decayFromRow(row),
      skills: childNodes,
    };
  }

  const attributesDto = attributes.map((row) => {
    const childSubs = (subsByAttr.get(row.id) ?? []).map(subDto);
    const effective = effectiveCondition(
      { current: row.proficiency, peak: row.peak_proficiency },
      childSubs.map((child) => ({
        current: Number(child.proficiency),
        peak: Number(child.peakProficiency),
        weight: Number(child.weight),
      })),
    );
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      color: row.color,
      weight: row.weight,
      sortOrder: row.sort_order,
      isCore: row.is_core === 1,
      lifetimeXp: row.lifetime_xp,
      proficiency: round2(effective.current),
      ownProficiency: round2(row.proficiency),
      peakProficiency: round2(Math.max(effective.peak, row.peak_proficiency)),
      subAttributes: childSubs,
      // Convenience for the character sheet: all direct skills in this attribute's branches.
      skills: childSubs.flatMap((sub) => (sub.skills as unknown[]) ?? []),
    };
  });

  return attributesDto;
}

export function getAnalysisTaxonomy(db: Db): Taxonomy {
  const attributes = db.prepare('SELECT id, key, name FROM attributes ORDER BY sort_order').all() as Array<{
    id: string;
    key: string;
    name: string;
  }>;
  const subs = db
    .prepare('SELECT id, name, attribute_id FROM sub_attributes ORDER BY sort_order')
    .all() as Array<{ id: string; name: string; attribute_id: string }>;
  const skills = db
    .prepare('SELECT id, name, sub_attribute_id, parent_skill_id FROM skills ORDER BY sort_order')
    .all() as Array<{ id: string; name: string; sub_attribute_id: string | null; parent_skill_id: string | null }>;
  return {
    attributes,
    subAttributes: subs.map((s) => ({ id: s.id, name: s.name, attributeId: s.attribute_id })),
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      subAttributeId: s.sub_attribute_id,
      parentSkillId: s.parent_skill_id,
      attributeId: subs.find((sub) => sub.id === s.sub_attribute_id)?.attribute_id ?? null,
    })),
  };
}

export type AttributeCreate = z.infer<typeof attributeCreateSchema>;
export type AttributeUpdate = z.infer<typeof attributeUpdateSchema>;

export function createAttribute(db: Db, input: AttributeCreate) {
  let key = slugify(input.name);
  const existing = db.prepare('SELECT id FROM attributes WHERE key = ?').get(key);
  if (existing) key = `${key}-${uuid().slice(0, 6)}`;
  const sort = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM attributes').get() as { next: number }).next;
  const id = uuid();
  db.prepare(
    'INSERT INTO attributes (id, key, name, description, color, weight, sort_order, is_core, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(id, key, input.name.trim(), input.description ?? '', input.color || '#cfa960', input.weight ?? 1, sort, nowIso());
  return db.prepare('SELECT * FROM attributes WHERE id = ?').get(id);
}

export function updateAttribute(db: Db, id: string, input: AttributeUpdate) {
  requireRow(db.prepare('SELECT id FROM attributes WHERE id = ?').get(id), 'Attribute not found.');
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name.trim()); }
  if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
  if (input.color !== undefined) { updates.push('color = ?'); values.push(input.color); }
  if (input.weight !== undefined) { updates.push('weight = ?'); values.push(input.weight); }
  if (input.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(input.sortOrder); }
  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE attributes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return db.prepare('SELECT * FROM attributes WHERE id = ?').get(id);
}

export function deleteAttribute(db: Db, id: string): void {
  requireRow(db.prepare('SELECT id FROM attributes WHERE id = ?').get(id), 'Attribute not found.');
  const children = db.prepare('SELECT COUNT(*) AS c FROM sub_attributes WHERE attribute_id = ?').get(id) as { c: number };
  if (children.c > 0) conflict('Move or delete this attribute\'s sub-attributes before removing it.');
  db.prepare('DELETE FROM attributes WHERE id = ?').run(id);
}

export function createSubAttribute(
  db: Db,
  input: {
    attributeId: string;
    name: string;
    description?: string;
    weight?: number;
    decay?: Partial<DecayConfig>;
  },
) {
  requireRow(db.prepare('SELECT id FROM attributes WHERE id = ?').get(input.attributeId), 'Attribute not found.');
  const decay = normalizeDecayConfig({ ...defaultDecayConfig({ enabled: false }), ...(input.decay ?? {}) });
  const sort = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM sub_attributes WHERE attribute_id = ?').get(input.attributeId) as {
      next: number;
    }
  ).next;
  const id = uuid();
  const cols = decayColumns(decay);
  db.prepare(
    `INSERT INTO sub_attributes
     (id, attribute_id, name, description, weight, sort_order, is_certification, created_at,
      decay_enabled, decay_grace_days, decay_interval_days, decay_rate, decay_minimum, recovery_per_xp)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.attributeId,
    input.name.trim(),
    input.description ?? '',
    input.weight ?? 1,
    sort,
    nowIso(),
    cols.decay_enabled,
    cols.decay_grace_days,
    cols.decay_interval_days,
    cols.decay_rate,
    cols.decay_minimum,
    cols.recovery_per_xp,
  );
  return db.prepare('SELECT * FROM sub_attributes WHERE id = ?').get(id);
}

export function updateSubAttribute(
  db: Db,
  id: string,
  input: {
    name?: string;
    description?: string;
    weight?: number;
    sortOrder?: number;
    attributeId?: string;
    decay?: Partial<DecayConfig>;
    manualProficiency?: number;
  },
) {
  const row = requireRow(
    db.prepare('SELECT * FROM sub_attributes WHERE id = ?').get(id) as SubRow | undefined,
    'Sub-attribute not found.',
  );
  if (input.attributeId) {
    requireRow(db.prepare('SELECT id FROM attributes WHERE id = ?').get(input.attributeId), 'Attribute not found.');
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name.trim()); }
  if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
  if (input.weight !== undefined) { updates.push('weight = ?'); values.push(input.weight); }
  if (input.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(input.sortOrder); }
  if (input.attributeId !== undefined) { updates.push('attribute_id = ?'); values.push(input.attributeId); }
  if (input.decay) {
    const decay = normalizeDecayConfig({ ...decayFromRow(row), ...input.decay });
    const cols = decayColumns(decay);
    updates.push(
      'decay_enabled = ?', 'decay_grace_days = ?', 'decay_interval_days = ?', 'decay_rate = ?',
      'decay_minimum = ?', 'recovery_per_xp = ?',
    );
    values.push(
      cols.decay_enabled, cols.decay_grace_days, cols.decay_interval_days, cols.decay_rate,
      cols.decay_minimum, cols.recovery_per_xp,
    );
    if (decay.enabled === false) {
      updates.push('decay_anchor_at = NULL', 'decay_applied_intervals = 0');
    }
  }
  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE sub_attributes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (input.manualProficiency !== undefined) {
    const fresh = db.prepare('SELECT * FROM sub_attributes WHERE id = ?').get(id) as SubRow;
    const manual = applyManualProficiency(fresh.lifetime_xp, fresh.peak_proficiency, input.manualProficiency);
    db.prepare(
      "UPDATE sub_attributes SET lifetime_xp = ?, proficiency = ?, peak_proficiency = ?, debt = ?, last_practice_at = ?, decay_anchor_at = NULL, decay_applied_intervals = 0 WHERE id = ?",
    ).run(manual.lifetimeXp, manual.current, manual.peak, manual.debt, nowIso(), id);
    db.prepare(
      'INSERT INTO xp_transactions (id, activity_id, target_type, target_id, delta, balance_before, balance_after, reason, kind, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(uuid(), 'sub_attribute', id, manual.lifetimeXp - fresh.lifetime_xp, fresh.lifetime_xp, manual.lifetimeXp, 'Manual proficiency assessment', 'manual', nowIso());
    db.prepare(
      'INSERT INTO proficiency_history (id, target_type, target_id, target_name, lifetime_xp, proficiency, peak_proficiency, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)',
    ).run(uuid(), 'sub_attribute', id, fresh.name, manual.lifetimeXp, manual.current, manual.peak, nowIso());
  }
  return db.prepare('SELECT * FROM sub_attributes WHERE id = ?').get(id);
}

export function deleteSubAttribute(db: Db, id: string): void {
  const row = requireRow(
    db.prepare('SELECT * FROM sub_attributes WHERE id = ?').get(id) as SubRow | undefined,
    'Sub-attribute not found.',
  );
  const skills = db.prepare('SELECT COUNT(*) AS c FROM skills WHERE sub_attribute_id = ?').get(id) as { c: number };
  if (skills.c > 0) conflict('Move or delete the skills in this branch first.');
  if (row.lifetime_xp > 0) conflict('This sub-attribute has earned XP. Certifications and history must be preserved; rename or relocate it instead.');
  db.prepare('DELETE FROM sub_attributes WHERE id = ?').run(id);
}

export function createSkill(
  db: Db,
  input: {
    name: string;
    description?: string;
    parentSkillId?: string | null;
    subAttributeId?: string | null;
    weight?: number;
    isCertification?: boolean;
    decay?: Partial<DecayConfig>;
  },
) {
  let subAttributeId = input.subAttributeId ?? null;
  if (input.parentSkillId) {
    const parent = requireRow(
      db.prepare('SELECT * FROM skills WHERE id = ?').get(input.parentSkillId) as SkillRow | undefined,
      'Parent skill not found.',
    );
    subAttributeId = subAttributeId ?? parent.sub_attribute_id;
  }
  if (subAttributeId) {
    requireRow(db.prepare('SELECT id FROM sub_attributes WHERE id = ?').get(subAttributeId), 'Sub-attribute not found.');
  }
  const sort = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM skills WHERE parent_skill_id IS ? AND sub_attribute_id IS ?').get(
      input.parentSkillId ?? null,
      subAttributeId,
    ) as { next: number }
  ).next;
  const decay = normalizeDecayConfig({
    ...defaultDecayConfig({ enabled: false }),
    ...(input.decay ?? {}),
  });
  const isCert = input.isCertification ? 1 : 0;
  const cols = decayColumns(decay);
  const id = uuid();
  db.prepare(
    `INSERT INTO skills
     (id, parent_skill_id, sub_attribute_id, name, description, weight, sort_order, is_certification, created_at,
      decay_enabled, decay_grace_days, decay_interval_days, decay_rate, decay_minimum, recovery_per_xp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.parentSkillId ?? null,
    subAttributeId,
    input.name.trim(),
    input.description ?? '',
    input.weight ?? 1,
    sort,
    isCert,
    nowIso(),
    cols.decay_enabled,
    cols.decay_grace_days,
    cols.decay_interval_days,
    cols.decay_rate,
    cols.decay_minimum,
    cols.recovery_per_xp,
  );
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
}

export function updateSkill(
  db: Db,
  id: string,
  input: {
    name?: string;
    description?: string;
    weight?: number;
    sortOrder?: number;
    parentSkillId?: string | null;
    subAttributeId?: string | null;
    isCertification?: boolean;
    decay?: Partial<DecayConfig>;
    manualProficiency?: number;
  },
) {
  const row = requireRow(
    db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined,
    'Skill not found.',
  );
  if (input.parentSkillId !== undefined && input.parentSkillId !== null) {
    if (input.parentSkillId === id) conflict('A skill cannot be its own parent.');
    let cursor: SkillRow | undefined = db.prepare('SELECT * FROM skills WHERE id = ?').get(input.parentSkillId) as
      | SkillRow
      | undefined;
    while (cursor) {
      if (cursor.id === id) conflict('That move would create a cycle in the skill tree.');
      cursor = cursor.parent_skill_id
        ? (db.prepare('SELECT * FROM skills WHERE id = ?').get(cursor.parent_skill_id) as SkillRow | undefined)
        : undefined;
    }
    requireRow(db.prepare('SELECT id FROM skills WHERE id = ?').get(input.parentSkillId), 'Parent skill not found.');
  }
  if (input.subAttributeId) {
    requireRow(db.prepare('SELECT id FROM sub_attributes WHERE id = ?').get(input.subAttributeId), 'Sub-attribute not found.');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name.trim()); }
  if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
  if (input.weight !== undefined) { updates.push('weight = ?'); values.push(input.weight); }
  if (input.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(input.sortOrder); }
  if (input.parentSkillId !== undefined) { updates.push('parent_skill_id = ?'); values.push(input.parentSkillId); }
  if (input.subAttributeId !== undefined) { updates.push('sub_attribute_id = ?'); values.push(input.subAttributeId); }
  if (input.isCertification !== undefined) {
    updates.push('is_certification = ?');
    values.push(input.isCertification ? 1 : 0);
    if (input.isCertification) updates.push('decay_enabled = 0');
  }
  if (input.decay) {
    const decay = normalizeDecayConfig({ ...decayFromRow(row), ...input.decay });
    const cols = decayColumns(decay);
    updates.push(
      'decay_enabled = ?', 'decay_grace_days = ?', 'decay_interval_days = ?', 'decay_rate = ?',
      'decay_minimum = ?', 'recovery_per_xp = ?',
    );
    values.push(
      cols.decay_enabled, cols.decay_grace_days, cols.decay_interval_days, cols.decay_rate,
      cols.decay_minimum, cols.recovery_per_xp,
    );
  }
  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE skills SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (input.manualProficiency !== undefined) {
    const fresh = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow;
    const manual = applyManualProficiency(fresh.lifetime_xp, fresh.peak_proficiency, input.manualProficiency);
    db.prepare(
      "UPDATE skills SET lifetime_xp = ?, proficiency = ?, peak_proficiency = ?, debt = ?, last_practice_at = ?, decay_anchor_at = NULL, decay_applied_intervals = 0 WHERE id = ?",
    ).run(manual.lifetimeXp, manual.current, manual.peak, manual.debt, nowIso(), id);
    db.prepare(
      'INSERT INTO xp_transactions (id, activity_id, target_type, target_id, delta, balance_before, balance_after, reason, kind, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(uuid(), 'skill', id, manual.lifetimeXp - fresh.lifetime_xp, fresh.lifetime_xp, manual.lifetimeXp, 'Manual proficiency assessment', 'manual', nowIso());
    db.prepare(
      'INSERT INTO proficiency_history (id, target_type, target_id, target_name, lifetime_xp, proficiency, peak_proficiency, activity_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)',
    ).run(uuid(), 'skill', id, fresh.name, manual.lifetimeXp, manual.current, manual.peak, nowIso());
  }
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
}

export function deleteSkill(db: Db, id: string): void {
  requireRow(db.prepare('SELECT * FROM skills WHERE id = ?').get(id), 'Skill not found.');
  const children = db.prepare('SELECT COUNT(*) AS c FROM skills WHERE parent_skill_id = ?').get(id) as { c: number };
  if (children.c > 0) conflict('Move or delete this skill\'s children first.');
  db.prepare('UPDATE skills SET parent_skill_id = NULL WHERE parent_skill_id = ?').run(id);
  db.prepare('DELETE FROM skills WHERE id = ?').run(id);
}

export function reorder(db: Db, kind: 'attribute' | 'sub_attribute' | 'skill', ids: string[]): void {
  const table = kind === 'attribute' ? 'attributes' : kind === 'sub_attribute' ? 'sub_attributes' : 'skills';
  const tx = db.transaction(() => {
    ids.forEach((id, index) => {
      db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(index, id);
    });
  });
  tx();
}

export function getProficiencyHistory(db: Db, targetType: string, targetId: string, limit = 100) {
  return db
    .prepare(
      'SELECT id, target_type AS targetType, target_id AS targetId, lifetime_xp AS lifetimeXp, proficiency, peak_proficiency AS peakProficiency, recorded_at AS createdAt FROM proficiency_history WHERE target_type = ? AND target_id = ? ORDER BY recorded_at DESC LIMIT ?',
    )
    .all(targetType, targetId, Math.min(500, Math.max(1, limit)));
}

export function getAttributeHistory(db: Db, attributeId: string, limit = 100) {
  return db
    .prepare(
      'SELECT id, attribute_id AS attributeId, lifetime_xp AS lifetimeXp, proficiency, peak_proficiency AS peakProficiency, recorded_at AS createdAt FROM attribute_history WHERE attribute_id = ? ORDER BY recorded_at DESC LIMIT ?',
    )
    .all(attributeId, Math.min(500, Math.max(1, limit)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export { capacity, clampProficiency, normalizeWeights };
