import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node scripts/e2e-reset.mjs && npm run build && npm start',
        url: 'http://127.0.0.1:3000/api/health',
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          PORT: '3000',
          HOST: '127.0.0.1',
          LIFERPG_DATA_DIR: '.e2e-data',
          LIFERPG_DISABLE_AUTO_BACKUP: '1',
        },
      },
});
