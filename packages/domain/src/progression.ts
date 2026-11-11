/**
 * Deterministic progression curve.
 * Default: XP required to leave level L = 500 + 0.98 * (L - 1)^2.
 * This module is pure and shared by the server and the browser.
 */

export interface ProgressionConfig {
  baseXp: number;
  quadraticCoefficient: number;
  linearCoefficient: number;
  /** Practical storage bound, not a gameplay cap. 1,000 levels are guaranteed. */
  maxSupportedLevel: number;
}

export const DEFAULT_PROGRESSION_CONFIG: ProgressionConfig = {
  baseXp: 500,
  quadraticCoefficient: 0.98,
  linearCoefficient: 0,
  maxSupportedLevel: 1_000_000,
};

export function validateProgressionConfig(input: Partial<ProgressionConfig>): ProgressionConfig {
  const cfg = { ...DEFAULT_PROGRESSION_CONFIG, ...input };
  cfg.baseXp = Math.max(1, Math.min(1_000_000, Math.round(cfg.baseXp)));
  cfg.quadraticCoefficient = Math.max(0, Math.min(100, cfg.quadraticCoefficient));
  cfg.linearCoefficient = Math.max(0, Math.min(100, cfg.linearCoefficient));
  cfg.maxSupportedLevel = Math.max(1000, Math.min(1_000_000, Math.floor(cfg.maxSupportedLevel)));
  return cfg;
}

export interface ProgressionState {
  level: number;
  totalLifetimeXp: number;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number;
  xpToNextLevel: number;
  progressFraction: number;
  cumulativeXpForCurrentLevel: number;
  title: string;
}

export function titleForLevel(level: number): string {
  if (level < 5) return 'Wanderer';
  if (level < 10) return 'Initiate';
  if (level < 20) return 'Adept';
  if (level < 35) return 'Journeyman';
  if (level < 50) return 'Expert';
  if (level < 75) return 'Master';
  if (level < 100) return 'Grandmaster';
  if (level < 200) return 'Legend';
  if (level < 500) return 'Mythic';
  if (level < 1000) return 'Ascendant';
  return 'Eternal';
}

export class Progression {
  readonly config: ProgressionConfig;
  private cumulative: number[] = [0];

  constructor(config: Partial<ProgressionConfig> = {}) {
    this.config = validateProgressionConfig(config);
  }

  /** XP required to move from `level` to the next level. */
  xpRequiredForLevel(level: number): number {
    if (!Number.isFinite(level) || level < 1) throw new RangeError('Level must be >= 1');
    const n = Math.floor(level) - 1;
    const raw =
      this.config.baseXp +
      this.config.quadraticCoefficient * n * n +
      this.config.linearCoefficient * n;
    if (!Number.isFinite(raw) || raw >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
    return Math.max(1, Math.round(raw));
  }

  /** Total lifetime XP needed to reach `level` (level 1 requires 0). */
  totalXpForLevel(level: number): number {
    if (!Number.isFinite(level) || level < 1) throw new RangeError('Level must be >= 1');
    const target = Math.min(Math.floor(level), this.config.maxSupportedLevel);
    this.ensure(target);
    return this.cumulative[target - 1];
  }

  levelForXp(totalXp: number): number {
    if (!Number.isFinite(totalXp) || totalXp <= 0) return 1;
    if (totalXp >= this.totalXpForLevel(this.config.maxSupportedLevel)) {
      return this.config.maxSupportedLevel;
    }
    // Cubic estimate: cumulative ~= coefficient * L^3 / 3. Correct with a binary search.
    const c = Math.max(0.000001, this.config.quadraticCoefficient);
    let high = Math.min(
      this.config.maxSupportedLevel,
      Math.max(2, Math.ceil(Math.cbrt((totalXp * 3) / c)) + 8),
    );
    this.ensure(high);
    while (high < this.config.maxSupportedLevel && this.cumulative[high - 1] <= totalXp) {
      high = Math.min(this.config.maxSupportedLevel, high * 2);
      this.ensure(high);
    }
    let low = 1;
    let upper = high;
    while (low < upper) {
      const mid = low + Math.floor((upper - low + 1) / 2);
      if (this.cumulative[mid - 1] <= totalXp) low = mid;
      else upper = mid - 1;
    }
    return low;
  }

  getState(totalXp: number): ProgressionState {
    const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
    const level = this.levelForXp(safeTotal);
    const cumulative = this.totalXpForLevel(level);
    const required = this.xpRequiredForLevel(level);
    const into = Math.max(0, Math.min(required, safeTotal - cumulative));
    return {
      level,
      totalLifetimeXp: safeTotal,
      xpIntoLevel: into,
      xpRequiredForNextLevel: required,
      xpToNextLevel: Math.max(0, required - into),
      progressFraction: required > 0 ? Math.min(1, Math.max(0, into / required)) : 0,
      cumulativeXpForCurrentLevel: cumulative,
      title: titleForLevel(level),
    };
  }

  private ensure(level: number): void {
    while (this.cumulative.length < level) {
      const nextLevel = this.cumulative.length; // transition from this level
      const last = this.cumulative[this.cumulative.length - 1];
      const value = last + this.xpRequiredForLevel(nextLevel);
      this.cumulative.push(Math.min(Number.MAX_SAFE_INTEGER, value));
    }
  }
}

export const defaultProgression = new Progression();
