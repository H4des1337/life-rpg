import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@liferpg/domain': root + 'packages/domain/src/index.ts',
      '@liferpg/shared': root + 'packages/shared/src/index.ts',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts', 'apps/server/test/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    setupFiles: ['apps/web/src/test/setup.ts'],
    testTimeout: 20000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
