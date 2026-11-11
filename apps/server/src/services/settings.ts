import type { Db } from '../db.js';
import { getSettings, setSetting } from '../db.js';
import {
  DEFAULT_DIMINISHING_RETURNS,
  DEFAULT_PROGRESSION_CONFIG,
  normalizeDiminishingConfig,
  validateProgressionConfig,
  type DiminishingReturnConfig,
  type ProgressionConfig,
} from '@liferpg/domain';
import type { z } from 'zod';
import type { settingsUpdateSchema } from '@liferpg/shared';

export function getProgressionConfig(db: Db): ProgressionConfig {
  const s = getSettings(db);
  return validateProgressionConfig({
    baseXp: Number(s.progressionBaseXp ?? DEFAULT_PROGRESSION_CONFIG.baseXp),
    quadraticCoefficient: Number(s.progressionQuadratic ?? DEFAULT_PROGRESSION_CONFIG.quadraticCoefficient),
    linearCoefficient: Number(s.progressionLinear ?? DEFAULT_PROGRESSION_CONFIG.linearCoefficient),
    maxSupportedLevel: DEFAULT_PROGRESSION_CONFIG.maxSupportedLevel,
  });
}

export function getDiminishingConfig(db: Db): DiminishingReturnConfig {
  const s = getSettings(db);
  return normalizeDiminishingConfig({
    windowHours: Number(s.diminishingWindowHours ?? DEFAULT_DIMINISHING_RETURNS.windowHours),
    step: Number(s.diminishingStep ?? DEFAULT_DIMINISHING_RETURNS.step),
    floor: Number(s.diminishingFloor ?? DEFAULT_DIMINISHING_RETURNS.floor),
  });
}

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export { getSettings };

export function updateSettings(db: Db, patch: SettingsUpdate): Record<string, string> {
  const allowed = new Set([
    'progressionBaseXp',
    'progressionQuadratic',
    'progressionLinear',
    'diminishingWindowHours',
    'diminishingStep',
    'diminishingFloor',
    'autoBackupEnabled',
    'autoBackupRetention',
    'themeAccent',
  ]);
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || !allowed.has(key)) continue;
      setSetting(db, key, String(value));
    }
  });
  tx();
  return getSettings(db);
}

export function publicSettings(db: Db) {
  const s = getSettings(db);
  return {
    progressionBaseXp: Number(s.progressionBaseXp),
    progressionQuadratic: Number(s.progressionQuadratic),
    progressionLinear: Number(s.progressionLinear),
    diminishingWindowHours: Number(s.diminishingWindowHours),
    diminishingStep: Number(s.diminishingStep),
    diminishingFloor: Number(s.diminishingFloor),
    autoBackupEnabled: s.autoBackupEnabled === 'true',
    autoBackupRetention: Number(s.autoBackupRetention),
    themeAccent: s.themeAccent,
    lastAutoBackupAt: s.lastAutoBackupAt || null,
    selectedAiProviderId: s.selectedAiProviderId || null,
  };
}
