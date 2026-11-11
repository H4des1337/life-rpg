export interface ProgressionState {
  level: number;
  totalLifetimeXp: number;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number;
  xpToNextLevel: number;
  progressFraction: number;
  title: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  lastActivityAt: string | null;
  progression: ProgressionState;
  appearance?: Appearance;
}

export interface DecayConfig {
  enabled: boolean;
  graceDays: number;
  intervalDays: number;
  ratePerInterval: number;
  minimumProficiency: number;
  recoveryPerXp: number;
}

export interface Skill {
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
  ownProficiency: number;
  peakProficiency: number;
  lastPracticeAt: string | null;
  decay: DecayConfig;
  children: Skill[];
}

export interface SubAttribute {
  id: string;
  attributeId: string;
  name: string;
  description: string;
  weight: number;
  sortOrder: number;
  lifetimeXp: number;
  proficiency: number;
  ownProficiency: number;
  peakProficiency: number;
  lastPracticeAt: string | null;
  decay: DecayConfig;
  skills: Skill[];
}

export interface Attribute {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  weight: number;
  sortOrder: number;
  isCore: boolean;
  lifetimeXp: number;
  proficiency: number;
  ownProficiency: number;
  peakProficiency: number;
  subAttributes: SubAttribute[];
  skills: Skill[];
}

export interface ActivityAllocation {
  targetType: 'attribute' | 'sub_attribute' | 'skill';
  targetId: string;
  targetName?: string;
  xp: number;
  weight?: number;
  rationale?: string;
  confidence?: number;
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
  allocations: ActivityAllocation[];
  suggestedInventoryName: string;
  suggestedInventoryCategory: string;
  suggestedTimelineTitle: string;
  suggestedTimelineDescription: string;
  warnings: string[];
}

export interface Activity {
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
  multiplier: number;
  playerXp: number;
  status: 'approved' | 'reversed';
  source: string;
  providerName: string;
  modelName: string;
  classification: string;
  reasoning: string;
  confidence: number;
  isMilestone: boolean;
  questId: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  allocations: Array<{
    targetType: string;
    targetId: string;
    targetName: string;
    xp: number;
    weight: number;
    rationale: string;
    confidence: number;
  }>;
  transactions?: Array<Record<string, unknown>>;
}

export interface Quest {
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
  activities: Array<{ id: string; title: string; occurredAt: string; playerXp: number }>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditionType: string;
  threshold: number;
  hidden: boolean;
  isBuiltin: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  progressFraction: number;
  achievementId: string | null;
}

export interface Streak {
  id: string;
  name: string;
  description: string;
  cadence: 'daily' | 'weekly';
  enabled: boolean;
  entries: Array<{ id: string; date: string; note: string }>;
  current: number;
  longest: number;
  checkedToday: boolean;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  eventType: string;
  occurredAt: string;
  source: string;
  createdAt: string;
  links: Array<{ type: string; id: string; label: string }>;
}

export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  bodyPreview: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  links: Array<{ targetType: string; targetId: string; label: string }>;
  attributes: Array<{ targetType: string; targetId: string; label: string }>;
  skills: Array<{ targetType: string; targetId: string; label: string }>;
  quests: Array<{ targetType: string; targetId: string; label: string }>;
  achievements: Array<{ targetType: string; targetId: string; label: string }>;
  inventory: Array<{ targetType: string; targetId: string; label: string }>;
  files: Array<{ id: string; originalName: string; mimeType: string; size: number; sha256: string }>;
  noteCount: number;
}

export interface StickyNote {
  id: string;
  journalId: string | null;
  journalTitle: string | null;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  color: string;
  collapsed: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  linkedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string;
  acquiredAt: string | null;
  expiresAt: string | null;
  externalRef: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  expired: boolean;
  links: Array<{ targetType: string; targetId: string; label: string }>;
  attributes: Array<{ targetType: string; targetId: string; label: string }>;
  skills: Array<{ targetType: string; targetId: string; label: string }>;
  achievements: Array<{ targetType: string; targetId: string; label: string }>;
  files: InventoryFile[];
  fileCount: number;
}

export interface InventoryCategory {
  id: string;
  name: string;
  sortOrder: number;
  itemCount: number;
}

export interface Appearance {
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  outfit: string;
  outfitColor: string;
  accessory: string;
  background: string;
  updatedAt?: string | null;
}

export interface AiProvider {
  id: string;
  name: string;
  kind: 'ollama' | 'openai';
  endpoint: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  consentGiven: boolean;
}

export interface Backup {
  id: string;
  filename: string;
  kind: 'manual' | 'auto';
  size: number;
  sha256: string;
  note: string;
  created_at: string;
}

export interface Settings {
  progressionBaseXp: number;
  progressionQuadratic: number;
  progressionLinear: number;
  diminishingWindowHours: number;
  diminishingStep: number;
  diminishingFloor: number;
  autoBackupEnabled: boolean;
  autoBackupRetention: number;
  themeAccent: string;
  lastAutoBackupAt: string | null;
  selectedAiProviderId: string | null;
}

export interface Bootstrap {
  hasProfile: boolean;
  profile: Profile | null;
  taxonomy: Attribute[];
  recentActivities: Activity[];
  achievements: Achievement[];
  quests: Quest[];
  streaks: Streak[];
  timeline: TimelineEvent[];
  journal: JournalEntry[];
  inventory: InventoryItem[];
  settings: Settings;
  providers: AiProvider[];
  backups: Backup[];
  cosmetics: string[];
  counts: {
    activities: number;
    journal: number;
    inventory: number;
    questsActive: number;
    achievementsUnlocked: number;
    skills: number;
    subAttributes: number;
    learningHours: number;
  };
  serverTime: string;
}

export interface AnalyticsData {
  range: { from: string; to: string; label: string; granularity: 'day' | 'week' | 'month' };
  summary: {
    totalActivities: number;
    earnedXp: number;
    lifetimeXp: number;
    level: number;
    learningHours: number;
    achievementsUnlocked: number;
    financialXp: number;
    currentStreak: number;
    furthestStreak: number;
  };
  comparison: {
    activities: number;
    playerXp: number;
    learningHours: number;
    activityDelta: number | null;
    xpDelta: number | null;
  };
  xpSeries: Array<{ date: string; xp: number; cumulativeXp: number; level: number }>;
  levelSeries: Array<{ date: string; level: number }>;
  attributeRadar: Array<{ attribute: string; current: number; peak: number; color: string }>;
  attributeProgression: Array<{ name: string; points: Array<{ date: string; value: number }> }>;
  skillProgression: Array<{ name: string; points: Array<{ date: string; value: number }> }>;
  activityBreakdown: Array<{ name: string; count: number; xp: number }>;
  neglect: Array<{
    id: string;
    name: string;
    color: string;
    proficiency: number;
    lastActivityAt: string | null;
    daysInactive: number | null;
  }>;
  streaks: Array<{ id: string; name: string; current: number; longest: number; cadence: string }>;
  recentActivities: Array<{
    id: string;
    title: string;
    category: string;
    occurredAt: string;
    playerXp: number;
    status: string;
  }>;
  hasData: boolean;
}
