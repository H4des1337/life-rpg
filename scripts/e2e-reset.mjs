import { rmSync } from 'node:fs';

// Playwright reuses a fixed data directory so the production build exercises the
// same local filesystem layout as a real install. Reset it before each E2E run so
// onboarding starts from a clean database.
for (const target of ['.e2e-data', '.e2e-data-failed']) {
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
console.log('E2E data directory reset.');
