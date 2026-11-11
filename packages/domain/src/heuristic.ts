import { normalizeKeyword } from './diminishing.js';

export type XpTargetType = 'attribute' | 'sub_attribute' | 'skill';

export interface TaxonomyAttribute {
  id: string;
  name: string;
  key: string;
}

export interface TaxonomySubAttribute {
  id: string;
  name: string;
  attributeId: string;
}

export interface TaxonomySkill {
  id: string;
  name: string;
  subAttributeId: string | null;
  parentSkillId: string | null;
  attributeId?: string | null;
}

export interface Taxonomy {
  attributes: TaxonomyAttribute[];
  subAttributes: TaxonomySubAttribute[];
  skills: TaxonomySkill[];
}

export interface ActivityDraft {
  title: string;
  description?: string;
  category?: string;
  durationMinutes?: number | null;
  difficulty?: number;
  effort?: number;
  significance?: number;
  relevance?: number;
  isMilestone?: boolean;
}

export interface AllocationSuggestion {
  targetType: XpTargetType;
  targetId: string;
  targetName: string;
  xp: number;
  weight: number;
  rationale: string;
  confidence: number;
}

export interface ActivityAnalysis {
  source: 'heuristic' | 'ai' | 'manual';
  providerName: string;
  modelName: string;
  classification: string;
  confidence: number;
  reasoning: string;
  suggestedPlayerXp: number;
  suggestedAttributeXp: number;
  isMilestone: boolean;
  allocations: AllocationSuggestion[];
  suggestedInventoryName: string;
  suggestedInventoryCategory: string;
  suggestedTimelineTitle: string;
  suggestedTimelineDescription: string;
  warnings: string[];
}

const ATTRIBUTE_KEYWORDS: Record<string, string[]> = {
  physical: ['gym', 'workout', 'exercise', 'run', 'running', 'walk', 'walked', 'lift', 'lifting', 'squat', 'pushup', 'pushups', 'pullup', 'pullups', 'stretch', 'yoga', 'climb', 'swim', 'sport', 'hike', 'cardio', 'strength', 'endurance', 'mobility', 'recovery'],
  intellect: ['read', 'reading', 'book', 'study', 'studied', 'course', 'learn', 'learning', 'research', 'analyze', 'analysis', 'problem', 'focus', 'memorize', 'math', 'algorithm', 'lecture', 'tutorial', 'exam', 'notes'],
  competence: ['code', 'coding', 'program', 'programming', 'build', 'built', 'project', 'debug', 'engineer', 'engineering', 'security', 'hack', 'reverse', 'write', 'writing', 'present', 'design', 'ship', 'shipped', 'deploy', 'system', 'architecture'],
  social: ['talk', 'talked', 'meet', 'met', 'friend', 'conversation', 'german', 'english', 'language', 'network', 'networking', 'empathy', 'listen', 'date', 'call', 'family', 'social'],
  character: ['discipline', 'habit', 'integrity', 'resilience', 'journal', 'meditate', 'meditation', 'reflect', 'reflection', 'cold shower', 'promise', 'kept', 'honest', 'courage', 'patience'],
  financial: ['budget', 'invest', 'investment', 'save', 'saving', 'money', 'income', 'earn', 'earned', 'finance', 'tax', 'salary', 'business', 'expense', 'debt'],
  lifestyle: ['sleep', 'slept', 'nutrition', 'diet', 'cook', 'cooked', 'clean', 'cleaned', 'environment', 'balance', 'water', 'meal', 'rest', 'routine', 'morning'],
};

const SKILL_SYNONYMS: Record<string, string[]> = {
  german: ['german', 'deutsch', 'goethe'],
  english: ['english'],
  running: ['run', 'running', 'jog', '5k', '10k', 'marathon'],
  calisthenics: ['calisthenics', 'pushup', 'pushups', 'pullup', 'bodyweight'],
  'computer science': ['computer science', 'algorithm', 'data structure', 'complexity'],
  'software engineering': ['software engineering', 'system design', 'architecture', 'refactor'],
  'reverse engineering': ['reverse engineering', 'reversing', 'disassembly', 'decompile'],
  'web security': ['web security', 'pentest', 'penetration test', 'bug bounty', 'owasp'],
};

const MILESTONE_KEYWORDS = ['first', 'completed', 'finished', 'certified', 'certificate', 'launched', 'graduated', 'personal record', 'new record', 'milestone', 'won', 'award'];

/**
 * Offline deterministic activity analysis. Always available, never sends data anywhere.
 */
export function analyzeActivityHeuristically(
  input: string,
  draft: ActivityDraft,
  taxonomy: Taxonomy,
): ActivityAnalysis {
  const text = normalizeKeyword(`${draft.title} ${draft.description ?? ''} ${input} ${draft.category ?? ''}`);
  const scores = new Map<string, number>();
  const candidates: Array<{ type: XpTargetType; id: string; name: string; score: number; attributeId: string | null }> = [];

  for (const attribute of taxonomy.attributes) {
    let score = 0;
    const name = normalizeKeyword(attribute.name);
    const key = normalizeKeyword(attribute.key);
    if (name.length > 2 && text.includes(name)) score += 3;
    if (key.length > 2 && text.includes(key)) score += 2;
    for (const word of ATTRIBUTE_KEYWORDS[attribute.key.toLowerCase()] ?? ATTRIBUTE_KEYWORDS[name] ?? []) {
      if (text.includes(normalizeKeyword(word))) score += 1.5;
    }
    if (score > 0) {
      scores.set(attribute.id, (scores.get(attribute.id) ?? 0) + score);
      candidates.push({ type: 'attribute', id: attribute.id, name: attribute.name, score, attributeId: attribute.id });
    }
  }

  for (const sub of taxonomy.subAttributes) {
    const normalized = normalizeKeyword(sub.name);
    if (normalized.length > 2 && text.includes(normalized)) {
      scores.set(sub.attributeId, (scores.get(sub.attributeId) ?? 0) + 3);
      candidates.push({ type: 'sub_attribute', id: sub.id, name: sub.name, score: 3, attributeId: sub.attributeId });
    }
  }

  for (const skill of taxonomy.skills) {
    let score = 0;
    const normalized = normalizeKeyword(skill.name);
    if (normalized.length > 2 && text.includes(normalized)) score += 4;
    for (const synonym of SKILL_SYNONYMS[normalized] ?? []) {
      if (text.includes(normalizeKeyword(synonym))) score += 3;
    }
    if (score > 0) {
      const sub = taxonomy.subAttributes.find((s) => s.id === skill.subAttributeId);
      const attributeId = skill.attributeId ?? (sub ? sub.attributeId : null);
      if (attributeId) {
        scores.set(attributeId, (scores.get(attributeId) ?? 0) + score);
        candidates.push({ type: 'skill', id: skill.id, name: skill.name, score, attributeId });
      }
    }
  }

  const minutes = Math.max(0, Math.min(600, draft.durationMinutes ?? 0));
  const difficulty = clampRating(draft.difficulty);
  const effort = clampRating(draft.effort);
  const significance = clampRating(draft.significance);
  let playerXp = Math.round(8 + minutes * 0.7 + difficulty * 10 + effort * 8 + significance * 7);
  playerXp = Math.max(5, Math.min(5000, playerXp));
  let attributeXp = playerXp * 2;

  const totalScore = [...scores.values()].reduce((a, b) => a + b, 0);
  let allocations: AllocationSuggestion[] = [];

  if (totalScore > 0) {
    const top = [...scores.entries()]
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [attributeId, score] of top) {
      const share = score / totalScore;
      const xp = Math.max(1, Math.round(attributeXp * share));
      const best = candidates
        .filter((c) => c.attributeId === attributeId)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const rank = (t: XpTargetType) => (t === 'skill' ? 0 : t === 'sub_attribute' ? 1 : 2);
          return rank(a.type) - rank(b.type);
        })[0];
      if (!best) continue;
      allocations.push({
        targetType: best.type,
        targetId: best.id,
        targetName: best.name,
        xp,
        weight: share,
        rationale: `Matched "${best.name}" from the activity description.`,
        confidence: 0.7,
      });
    }
  }

  if (allocations.length === 0 && draft.category) {
    const normalizedCategory = normalizeKeyword(draft.category);
    const byCategory = taxonomy.attributes.find(
      (a) => normalizeKeyword(a.name) === normalizedCategory || normalizeKeyword(a.key) === normalizedCategory,
    );
    if (byCategory) {
      allocations.push({
        targetType: 'attribute',
        targetId: byCategory.id,
        targetName: byCategory.name,
        xp: attributeXp,
        weight: 1,
        rationale: 'The selected category matched this attribute.',
        confidence: 0.45,
      });
    }
  }

  const allocationSum = allocations.reduce((sum, a) => sum + a.xp, 0);
  if (allocationSum > 0) {
    if (allocationSum !== attributeXp) {
      const factor = attributeXp / allocationSum;
      allocations = allocations
        .map((a) => ({ ...a, xp: Math.max(0, Math.floor(a.xp * factor)) }))
        .filter((a) => a.xp > 0);
      attributeXp = allocations.reduce((sum, a) => sum + a.xp, 0);
    }
    const weightTotal = allocations.reduce((sum, a) => sum + a.weight, 0);
    if (weightTotal > 0) {
      allocations = allocations.map((a) => ({ ...a, weight: a.weight / weightTotal }));
    }
  } else {
    attributeXp = 0;
  }

  const milestone = Boolean(draft.isMilestone) || MILESTONE_KEYWORDS.some((k) => text.includes(normalizeKeyword(k)));
  const confidence = totalScore <= 0 ? 0.35 : Math.min(0.95, Math.max(0.45, 0.45 + Math.min(0.45, totalScore / 20)));
  const classification = draft.title.trim() ? draft.title.trim().slice(0, 120) : allocations[0]?.targetName ? `${allocations[0].targetName} practice` : 'General activity';
  const inventory = suggestInventory(text, classification);
  const warnings: string[] = [];
  if (totalScore <= 0) warnings.push('No taxonomy match was found; this activity receives player XP only unless you add allocations manually.');

  return {
    source: 'heuristic',
    providerName: 'Built-in heuristic',
    modelName: 'deterministic-v1',
    classification,
    confidence,
    reasoning:
      totalScore <= 0
        ? 'No strong taxonomy signal was found, so XP is based on effort, duration and significance.'
        : `Matched ${allocations.length} target(s) from words in the activity description.`,
    suggestedPlayerXp: playerXp,
    suggestedAttributeXp: attributeXp,
    isMilestone: milestone,
    allocations,
    suggestedInventoryName: inventory.name,
    suggestedInventoryCategory: inventory.category,
    suggestedTimelineTitle: classification,
    suggestedTimelineDescription: `Logged: ${classification}.`,
    warnings,
  };
}

function suggestInventory(text: string, classification: string): { name: string; category: string } {
  const has = (...values: string[]) => values.some((v) => text.includes(normalizeKeyword(v)));
  if (has('certificate', 'certification', 'certified', 'degree', 'diploma')) return { name: classification, category: 'Certifications' };
  if (has('award', 'trophy', 'medal', 'won', 'prize')) return { name: classification, category: 'Awards' };
  if (has('license', 'licence')) return { name: classification, category: 'Licences' };
  if (has('book', 'course', 'lecture', 'textbook')) return { name: classification, category: 'Education' };
  if (has('bought', 'purchased', 'acquired', 'equipment', 'keyboard', 'laptop', 'camera')) return { name: classification, category: 'Equipment' };
  if (has('project', 'shipped', 'launched', 'built', 'released')) return { name: classification, category: 'Projects' };
  return { name: '', category: '' };
}

function clampRating(value: number | undefined): number {
  return Math.max(1, Math.min(5, Number.isFinite(value) ? Number(value) : 1));
}
