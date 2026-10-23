// User-guide screenshots (T-1002): `pnpm docs:screenshots` from the repo
// root. Same server, database reset and environment as the E2E suite
// (playwright.config.ts); a single scripted tour in docs/ fills a fresh store
// through the UI and writes the PNGs to .claude/docs/images/user-guide/.
import { defineConfig, devices } from '@playwright/test';

import e2e from './playwright.config';

export default defineConfig({
  ...e2e,
  testDir: './docs',
  testMatch: /\.screens\.ts$/,
  outputDir: './test-results/docs',
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
  projects: [
    {
      name: 'docs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
