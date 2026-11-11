export interface WeightedItem<T> {
  item: T;
  weight: number;
  normalizedWeight: number;
}

/** Normalises positive weights. If none are positive, every item is weighted equally. */
export function normalizeWeights<T>(items: Array<{ item: T; weight: number }>): WeightedItem<T>[] {
  if (items.length === 0) return [];
  const positive = items.filter((i) => i.weight > 0);
  if (positive.length === 0) {
    const equal = 1 / items.length;
    return items.map((i) => ({ item: i.item, weight: i.weight, normalizedWeight: equal }));
  }
  const total = positive.reduce((sum, i) => sum + i.weight, 0);
  return items.map((i) => ({
    item: i.item,
    weight: i.weight,
    normalizedWeight: i.weight > 0 ? i.weight / total : 0,
  }));
}

export interface WeightedCondition {
  current: number;
  peak: number;
}

/** Weighted child condition, clamped to 0..100. */
export function weightedCondition(
  children: Array<{ current: number; peak: number; weight: number }>,
): WeightedCondition {
  const normalized = normalizeWeights(children.map((child) => ({ item: child, weight: child.weight })));
  if (normalized.length === 0) return { current: 0, peak: 0 };
  let current = 0;
  let peak = 0;
  for (const entry of normalized) {
    current += entry.item.current * entry.normalizedWeight;
    peak += entry.item.peak * entry.normalizedWeight;
  }
  return { current: Math.min(100, Math.max(0, current)), peak: Math.min(100, Math.max(0, peak)) };
}

/** If active children exist they define the parent; otherwise the parent's own value is used. */
export function effectiveCondition(
  own: WeightedCondition,
  children: Array<{ current: number; peak: number; weight: number }>,
): WeightedCondition {
  if (children.length === 0) {
    return {
      current: Math.min(100, Math.max(0, own.current)),
      peak: Math.min(100, Math.max(0, own.peak)),
    };
  }
  return weightedCondition(children);
}
