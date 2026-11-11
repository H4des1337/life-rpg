/**
 * Proficiency and decay mathematics, ported from the original LIFE RPG design.
 * Lifetime XP raises a capacity ceiling. Decay is represented as debt below that
 * ceiling, never as deletion of lifetime XP or historical peaks.
 */

export const MAX_PROFICIENCY = 100;
export const DEFAULT_CAPACITY_SCALE = 1500;

export function capacity(lifetimeXp: number, scale = DEFAULT_CAPACITY_SCALE): number {
  if (!Number.isFinite(lifetimeXp) || lifetimeXp <= 0) return 0;
  const s = Math.max(1, scale);
  return clampProficiency(MAX_PROFICIENCY * (1 - Math.exp(-lifetimeXp / s)));
}

/** Inverse of capacity, used when a user manually assesses proficiency. */
export function xpForProficiency(proficiency: number, scale = DEFAULT_CAPACITY_SCALE): number {
  const p = Math.min(99.99, Math.max(0, proficiency));
  if (p <= 0) return 0;
  const xp = -Math.max(1, scale) * Math.log(1 - p / MAX_PROFICIENCY);
  if (!Number.isFinite(xp) || xp >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.ceil(xp);
}

export function clampProficiency(value: number): number {
  return Math.min(MAX_PROFICIENCY, Math.max(0, Number.isFinite(value) ? value : 0));
}

export interface XpApplication {
  lifetimeXp: number;
  capacity: number;
  debt: number;
  current: number;
  peak: number;
  gain: number;
  debtRecovered: number;
}

export function applyXp(
  lifetimeXp: number,
  debt: number,
  peak: number,
  xp: number,
  recoveryPerXp: number,
  scale = DEFAULT_CAPACITY_SCALE,
): XpApplication {
  const award = Math.max(0, Math.floor(xp));
  const safeDebt = Math.max(0, debt);
  const safePeak = clampProficiency(peak);
  const oldCapacity = capacity(lifetimeXp, scale);
  const oldCurrent = clampProficiency(oldCapacity - safeDebt);

  const newLifetime = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, lifetimeXp) + award);
  const newCapacity = capacity(newLifetime, scale);
  const recoverable = Math.max(0, recoveryPerXp) * award;
  const recovered = Math.min(safeDebt, recoverable);
  const newDebt = Math.max(0, safeDebt - recovered);
  const newCurrent = clampProficiency(newCapacity - newDebt);
  const newPeak = Math.max(safePeak, newCurrent);

  return {
    lifetimeXp: newLifetime,
    capacity: newCapacity,
    debt: newDebt,
    current: newCurrent,
    peak: newPeak,
    gain: newCurrent - oldCurrent,
    debtRecovered: recovered,
  };
}

export interface ManualApplication {
  lifetimeXp: number;
  capacity: number;
  debt: number;
  current: number;
  peak: number;
}

export function applyManualProficiency(
  lifetimeXp: number,
  peak: number,
  manualProficiency: number,
  scale = DEFAULT_CAPACITY_SCALE,
): ManualApplication {
  const p = clampProficiency(manualProficiency);
  const required = xpForProficiency(p, scale);
  const newLifetime = Math.max(Math.max(0, lifetimeXp), required);
  const cap = capacity(newLifetime, scale);
  const debt = Math.max(0, cap - p);
  const current = clampProficiency(cap - debt);
  return {
    lifetimeXp: newLifetime,
    capacity: cap,
    debt,
    current,
    peak: Math.max(clampProficiency(peak), current),
  };
}

export interface DecayConfig {
  enabled: boolean;
  graceDays: number;
  intervalDays: number;
  ratePerInterval: number;
  minimumProficiency: number;
  recoveryPerXp: number;
  anchorAt: string | null;
  appliedIntervals: number;
  lastDecayAt: string | null;
}

export function defaultDecayConfig(overrides: Partial<DecayConfig> = {}): DecayConfig {
  return {
    enabled: false,
    graceDays: 14,
    intervalDays: 7,
    ratePerInterval: 1,
    minimumProficiency: 10,
    recoveryPerXp: 0.02,
    anchorAt: null,
    appliedIntervals: 0,
    lastDecayAt: null,
    ...overrides,
  };
}

export function normalizeDecayConfig(input: Partial<DecayConfig>): DecayConfig {
  const cfg = defaultDecayConfig(input);
  cfg.graceDays = clampInt(cfg.graceDays, 0, 3650);
  cfg.intervalDays = clampInt(cfg.intervalDays, 1, 3650);
  cfg.ratePerInterval = clampNumber(cfg.ratePerInterval, 0, 100);
  cfg.minimumProficiency = clampNumber(cfg.minimumProficiency, 0, 100);
  cfg.recoveryPerXp = clampNumber(cfg.recoveryPerXp, 0, 10);
  cfg.appliedIntervals = clampInt(cfg.appliedIntervals, 0, 1_000_000);
  return cfg;
}

export interface DecayApplication {
  shouldApply: boolean;
  newIntervals: number;
  appliedIntervals: number;
  pointsRemoved: number;
  debt: number;
  current: number;
  capacity: number;
  anchorAt: string | null;
}

/**
 * Idempotent decay evaluation. Only complete intervals not already applied from
 * the current anchor are counted; repeated calls at the same time change nothing.
 */
export function evaluateDecay(
  config: DecayConfig,
  lifetimeXp: number,
  debt: number,
  lastPracticeAt: string | null,
  now: Date,
  capacityScale = DEFAULT_CAPACITY_SCALE,
): DecayApplication {
  const cap = capacity(lifetimeXp, capacityScale);
  const safeDebt = Math.max(0, debt);
  const current = clampProficiency(cap - safeDebt);

  if (!config.enabled || !lastPracticeAt) {
    return {
      shouldApply: false,
      newIntervals: 0,
      appliedIntervals: config.appliedIntervals,
      pointsRemoved: 0,
      debt: safeDebt,
      current,
      capacity: cap,
      anchorAt: config.anchorAt,
    };
  }

  const lastPractice = new Date(lastPracticeAt);
  if (Number.isNaN(lastPractice.getTime())) {
    return {
      shouldApply: false,
      newIntervals: 0,
      appliedIntervals: config.appliedIntervals,
      pointsRemoved: 0,
      debt: safeDebt,
      current,
      capacity: cap,
      anchorAt: config.anchorAt,
    };
  }

  const anchor = new Date(lastPractice.getTime() + Math.max(0, config.graceDays) * 86_400_000);
  if (now.getTime() <= anchor.getTime()) {
    return {
      shouldApply: false,
      newIntervals: 0,
      appliedIntervals: 0,
      pointsRemoved: 0,
      debt: safeDebt,
      current,
      capacity: cap,
      anchorAt: anchor.toISOString(),
    };
  }

  const intervalMs = Math.max(1, config.intervalDays) * 86_400_000;
  const dueIntervals = Math.floor((now.getTime() - anchor.getTime()) / intervalMs);
  if (dueIntervals <= 0) {
    return {
      shouldApply: false,
      newIntervals: 0,
      appliedIntervals: 0,
      pointsRemoved: 0,
      debt: safeDebt,
      current,
      capacity: cap,
      anchorAt: anchor.toISOString(),
    };
  }

  // Practice resets the anchor. Count already applied intervals only for the same anchor.
  const sameAnchor =
    config.anchorAt != null &&
    Math.abs(new Date(config.anchorAt).getTime() - anchor.getTime()) < 1000;
  const applied = sameAnchor ? Math.max(0, config.appliedIntervals) : 0;
  const newIntervals = Math.max(0, dueIntervals - applied);
  if (newIntervals === 0) {
    return {
      shouldApply: false,
      newIntervals: 0,
      appliedIntervals: dueIntervals,
      pointsRemoved: 0,
      debt: safeDebt,
      current,
      capacity: cap,
      anchorAt: anchor.toISOString(),
    };
  }

  const floor = Math.min(Math.max(0, config.minimumProficiency), cap);
  const maxDebt = Math.max(0, cap - floor);
  const requested = newIntervals * Math.max(0, config.ratePerInterval);
  const newDebt = Math.min(maxDebt, safeDebt + requested);
  const removed = Math.max(0, newDebt - safeDebt);

  return {
    shouldApply: removed > 1e-7,
    newIntervals,
    appliedIntervals: dueIntervals,
    pointsRemoved: removed,
    debt: newDebt,
    current: clampProficiency(cap - newDebt),
    capacity: cap,
    anchorAt: anchor.toISOString(),
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
