import { z } from 'zod';

export const idSchema = z.string().min(1).max(80);
export const isoDateSchema = z.string().datetime({ offset: true }).or(z.string().min(8).max(40));
export const ratingSchema = z.number().int().min(1).max(5);

export const decayConfigSchema = z.object({
  enabled: z.boolean(),
  graceDays: z.number().min(0).max(3650),
  intervalDays: z.number().min(1).max(3650),
  ratePerInterval: z.number().min(0).max(100),
  minimumProficiency: z.number().min(0).max(100),
  recoveryPerXp: z.number().min(0).max(10),
});

export const profileCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  appearance: z
    .object({
      skinTone: z.string().max(30).optional(),
      hairStyle: z.string().max(30).optional(),
      hairColor: z.string().max(30).optional(),
      outfit: z.string().max(30).optional(),
      outfitColor: z.string().max(30).optional(),
      accessory: z.string().max(30).optional(),
      background: z.string().max(30).optional(),
    })
    .optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

export const attributeCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(1000).optional().default(''),
  color: z.string().max(20).optional().default('#cfa960'),
  weight: z.number().min(0).max(1000).optional().default(1),
});

export const attributeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
  weight: z.number().min(0).max(1000).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const subAttributeCreateSchema = z.object({
  attributeId: idSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).optional().default(''),
  weight: z.number().min(0).max(1000).optional().default(1),
  decay: decayConfigSchema.partial().optional(),
});

export const subAttributeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(1000).optional(),
  weight: z.number().min(0).max(1000).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  attributeId: idSchema.optional(),
  decay: decayConfigSchema.partial().optional(),
  manualProficiency: z.number().min(0).max(100).optional(),
});

export const skillCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).optional().default(''),
  parentSkillId: idSchema.nullable().optional(),
  subAttributeId: idSchema.nullable().optional(),
  weight: z.number().min(0).max(1000).optional().default(1),
  isCertification: z.boolean().optional().default(false),
  decay: decayConfigSchema.partial().optional(),
});

export const skillUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  weight: z.number().min(0).max(1000).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  parentSkillId: idSchema.nullable().optional(),
  subAttributeId: idSchema.nullable().optional(),
  isCertification: z.boolean().optional(),
  decay: decayConfigSchema.partial().optional(),
  manualProficiency: z.number().min(0).max(100).optional(),
});

export const activityAnalyzeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  input: z.string().max(5000).optional().default(''),
  category: z.string().max(80).optional().default(''),
  durationMinutes: z.number().min(0).max(1440).nullable().optional(),
  difficulty: ratingSchema.optional().default(1),
  effort: ratingSchema.optional().default(1),
  significance: ratingSchema.optional().default(1),
  relevance: ratingSchema.optional().default(3),
  isMilestone: z.boolean().optional().default(false),
  useAi: z.boolean().optional().default(false),
  providerId: idSchema.nullable().optional(),
});

export const allocationSchema = z.object({
  targetType: z.enum(['attribute', 'sub_attribute', 'skill']),
  targetId: idSchema,
  targetName: z.string().max(200).optional().default(''),
  xp: z.number().int().min(0).max(100_000),
  weight: z.number().min(0).max(1).optional().default(0),
  rationale: z.string().max(500).optional().default(''),
  confidence: z.number().min(0).max(1).optional().default(1),
});

export const activityCreateSchema = activityAnalyzeSchema.extend({
  occurredAt: isoDateSchema.optional(),
  questId: idSchema.nullable().optional(),
  analysis: z
    .object({
      source: z.enum(['heuristic', 'ai', 'manual']).default('manual'),
      providerName: z.string().max(100).optional().default('Manual'),
      modelName: z.string().max(100).optional().default(''),
      classification: z.string().max(200).optional().default(''),
      confidence: z.number().min(0).max(1).optional().default(1),
      reasoning: z.string().max(2000).optional().default(''),
      suggestedPlayerXp: z.number().int().min(0).max(50_000),
      suggestedAttributeXp: z.number().int().min(0).max(100_000).optional().default(0),
      isMilestone: z.boolean().optional().default(false),
      allocations: z.array(allocationSchema).max(24).optional().default([]),
      warnings: z.array(z.string()).optional().default([]),
      suggestedInventoryName: z.string().max(200).optional().default(''),
      suggestedInventoryCategory: z.string().max(80).optional().default(''),
      suggestedTimelineTitle: z.string().max(200).optional().default(''),
      suggestedTimelineDescription: z.string().max(1000).optional().default(''),
    })
    .optional(),
  createTimeline: z.boolean().optional().default(false),
  createInventory: z.boolean().optional().default(false),
});

export const questMilestoneSchema = z.object({
  id: idSchema.optional(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean().optional().default(false),
});

export const questCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  category: z.string().max(80).optional().default(''),
  targetDate: z.string().max(40).nullable().optional(),
  progress: z.number().min(0).max(100).optional().default(0),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']).optional().default('active'),
  attributeIds: z.array(idSchema).max(30).optional().default([]),
  skillIds: z.array(idSchema).max(30).optional().default([]),
  milestones: z.array(questMilestoneSchema).max(100).optional().default([]),
});

export const questUpdateSchema = questCreateSchema.partial().extend({
  milestones: z.array(questMilestoneSchema).max(100).optional(),
});

export const journalCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000).optional().default(''),
  category: z.string().max(80).optional().default(''),
  attributeIds: z.array(idSchema).max(30).optional().default([]),
  skillIds: z.array(idSchema).max(30).optional().default([]),
  questIds: z.array(idSchema).max(30).optional().default([]),
  achievementIds: z.array(idSchema).max(30).optional().default([]),
  inventoryIds: z.array(idSchema).max(30).optional().default([]),
});

export const journalUpdateSchema = journalCreateSchema.partial();

export const stickyNoteCreateSchema = z.object({
  journalId: idSchema.nullable().optional(),
  title: z.string().trim().max(200).optional().default('Note'),
  body: z.string().max(20_000).optional().default(''),
  x: z.number().min(0).max(20_000).optional().default(40),
  y: z.number().min(0).max(20_000).optional().default(40),
  width: z.number().min(160).max(2000).optional().default(260),
  height: z.number().min(120).max(2000).optional().default(220),
  color: z.string().max(20).optional().default('#e3c27a'),
  collapsed: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
});

export const stickyNoteUpdateSchema = stickyNoteCreateSchema.partial().extend({
  zIndex: z.number().int().min(0).max(100_000).optional(),
});

export const inventoryCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const inventoryItemCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  categoryId: idSchema.nullable().optional(),
  acquiredAt: z.string().max(40).nullable().optional(),
  expiresAt: z.string().max(40).nullable().optional(),
  externalRef: z.string().max(2000).optional().default(''),
  attributeIds: z.array(idSchema).max(30).optional().default([]),
  skillIds: z.array(idSchema).max(30).optional().default([]),
  achievementIds: z.array(idSchema).max(30).optional().default([]),
});

export const inventoryItemUpdateSchema = inventoryItemCreateSchema.partial();

export const timelineCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  eventType: z.string().max(40).optional().default('personal'),
  occurredAt: isoDateSchema.optional(),
  attributeIds: z.array(idSchema).max(30).optional().default([]),
  skillIds: z.array(idSchema).max(30).optional().default([]),
  questIds: z.array(idSchema).max(30).optional().default([]),
  achievementIds: z.array(idSchema).max(30).optional().default([]),
  inventoryIds: z.array(idSchema).max(30).optional().default([]),
});

export const timelineUpdateSchema = timelineCreateSchema.partial();

export const streakCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).optional().default(''),
  cadence: z.enum(['daily', 'weekly']).optional().default('daily'),
  enabled: z.boolean().optional().default(true),
});

export const achievementDefinitionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  icon: z.string().max(40).optional().default('trophy'),
  conditionType: z.enum(['player_level', 'total_activities', 'attribute_level', 'skill_count', 'quest_completed', 'journal_count', 'inventory_count', 'streak_days', 'custom']).optional().default('custom'),
  threshold: z.number().min(0).max(1_000_000).optional().default(1),
  hidden: z.boolean().optional().default(false),
});

export const settingsUpdateSchema = z.object({
  progressionBaseXp: z.number().min(1).max(1_000_000).optional(),
  progressionQuadratic: z.number().min(0).max(100).optional(),
  progressionLinear: z.number().min(0).max(100).optional(),
  diminishingWindowHours: z.number().min(1).max(8760).optional(),
  diminishingStep: z.number().min(0).max(1).optional(),
  diminishingFloor: z.number().min(0).max(1).optional(),
  autoBackupEnabled: z.boolean().optional(),
  autoBackupRetention: z.number().int().min(1).max(365).optional(),
  themeAccent: z.string().max(20).optional(),
});

export const aiProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['ollama', 'openai']),
  endpoint: z.string().url().max(2000),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().max(500).optional().default(''),
  enabled: z.boolean().optional().default(true),
});

export const aiProviderUpdateSchema = aiProviderCreateSchema.partial();

export const aiConsentSchema = z.object({
  consent: z.literal(true),
});

export type ActivityDraftInput = z.infer<typeof activityAnalyzeSchema>;
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type AllocationInput = z.infer<typeof allocationSchema>;
