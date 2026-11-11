import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatBytes,
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
  isoDaysAgo,
  relativeTime,
  titleCase,
  todayInput,
  truncate,
} from './format';

afterEach(() => {
  vi.useRealTimers();
});

describe('format helpers', () => {
  it('formats numbers, decimals and percentages', () => {
    expect(formatNumber(1234.4)).toBe('1,234');
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatDecimal(12.345, 2)).toBe('12.35');
    expect(formatDecimal(undefined)).toBe('0');
    expect(formatPercent(0.256)).toBe('26%');
    expect(formatPercent(0.256, 1)).toBe('25.6%');
  });

  it('formats dates with a stable fallback', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDate('2026-03-04T12:00:00.000Z')).toContain('2026');
  });

  it('renders relative time buckets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    expect(relativeTime(null)).toBe('never');
    expect(relativeTime('nonsense')).toBe('unknown');
    expect(relativeTime('2026-06-15T11:59:50.000Z')).toBe('just now');
    expect(relativeTime('2026-06-15T11:30:00.000Z')).toBe('30m ago');
    expect(relativeTime('2026-06-15T06:00:00.000Z')).toBe('6h ago');
    expect(relativeTime('2026-06-12T12:00:00.000Z')).toBe('3d ago');
    expect(relativeTime('2026-04-15T12:00:00.000Z')).toBe('2mo ago');
    expect(relativeTime('2024-06-15T12:00:00.000Z')).toBe('2y ago');
  });

  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('normalizes text input', () => {
    expect(titleCase('player_level_up')).toBe('Player Level Up');
    expect(truncate('short', 20)).toBe('short');
    expect(truncate('a long sentence that needs trimming', 12)).toBe('a long sent…');
    expect(todayInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isoDaysAgo(7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
