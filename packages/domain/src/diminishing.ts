export interface DiminishingReturnConfig {
  windowHours: number;
  step: number;
  floor: number;
}

export const DEFAULT_DIMINISHING_RETURNS: DiminishingReturnConfig = {
  windowHours: 24,
  step: 0.35,
  floor: 0.25,
};

export function normalizeDiminishingConfig(
  input: Partial<DiminishingReturnConfig> = {},
): DiminishingReturnConfig {
  const cfg = { ...DEFAULT_DIMINISHING_RETURNS, ...input };
  return {
    windowHours: Math.min(24 * 365, Math.max(1, Math.round(cfg.windowHours))),
    step: Math.min(1, Math.max(0, cfg.step)),
    floor: Math.min(1, Math.max(0, cfg.floor)),
  };
}

/** Multiplier for the Nth similar activity inside the window. Identical activity is never erased. */
export function diminishingMultiplier(
  priorSimilarCount: number,
  config: DiminishingReturnConfig = DEFAULT_DIMINISHING_RETURNS,
): number {
  if (!Number.isFinite(priorSimilarCount) || priorSimilarCount <= 0) return 1;
  return Math.min(1, Math.max(config.floor, 1 - config.step * priorSimilarCount));
}

export function applyDiminishing(
  baseXp: number,
  priorSimilarCount: number,
  config: DiminishingReturnConfig = DEFAULT_DIMINISHING_RETURNS,
): number {
  if (!Number.isFinite(baseXp) || baseXp <= 0) return 0;
  return Math.max(0, Math.round(baseXp * diminishingMultiplier(priorSimilarCount, config)));
}

/** Stable fingerprint used to group intentionally repeated activities. */
export function activityFingerprint(title: string, category = ''): string {
  return normalizeKeyword(title) || normalizeKeyword(category) || 'activity';
}

export function normalizeKeyword(value: string): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
