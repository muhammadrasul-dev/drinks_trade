// Runs every package's tests in one process (`pnpm exec vitest`).
// CI and `pnpm test` go through turbo, which runs each package's own config.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
  },
});
