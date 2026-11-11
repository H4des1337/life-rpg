export * from './schemas.js';

export const APP_NAME = 'LIFE RPG';
export const SCHEMA_VERSION = 1;

export type AttributeDto = {
  id: string;
  name: string;
  description: string;
  color: string;
  weight: number;
  sortOrder: number;
  isCore: boolean;
  lifetimeXp: number;
  proficiency: number;
  peakProficiency: number;
  subAttributes: SubAttributeDto[];
  skills: SkillDto[];
};

export type SubAttributeDto = {
  id: string;
  attributeId: string;
  name: string;
  description: string;
  weight: number;
  sortOrder: number;
  lifetimeXp: number;
  proficiency: number;
  peakProficiency: number;
  lastPracticeAt: string | null;
  decay: {
    enabled: boolean;
    graceDays: number;
    intervalDays: number;
    ratePerInterval: number;
    minimumProficiency: number;
    recoveryPerXp: number;
  };
  skills: SkillDto[];
};

export type SkillDto = {
  id: string;
  name: string;
  description: string;
  parentSkillId: string | null;
  subAttributeId: string | null;
  weight: number;
  sortOrder: number;
  isCertification: boolean;
  lifetimeXp: number;
  proficiency: number;
  peakProficiency: number;
  lastPracticeAt: string | null;
  decay: SubAttributeDto['decay'];
  children: SkillDto[];
};

export type ProgressionStateDto = {
  level: number;
  totalLifetimeXp: number;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number;
  xpToNextLevel: number;
  progressFraction: number;
  title: string;
};

export type ProfileDto = {
  id: string;
  name: string;
  createdAt: string;
  lastActivityAt: string | null;
  progression: ProgressionStateDto;
};

export type ActivityDto = {
  id: string;
  title: string;
  description: string;
  category: string;
  occurredAt: string;
  durationMinutes: number | null;
  difficulty: number;
  effort: number;
  significance: number;
  baseXp: number;
  playerXp: number;
  multiplier: number;
  status: 'approved' | 'reversed';
  source: string;
  isMilestone: boolean;
  questId: string | null;
  createdAt: string;
  allocations: Array<{ targetType: string; targetId: string; targetName: string; xp: number }>;
};

export type QuestDto = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  progress: number;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  milestones: Array<{ id: string; title: string; done: boolean; sortOrder: number; completedAt: string | null }>;
  attributes: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string }>;
  activityCount: number;
};
