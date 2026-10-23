// Playwright E2E suite (T-1001, architecture §10). `pnpm test:e2e` from the
// repo root: the webServer step re-creates the E2E database, builds the web
// app and serves it on PORT; the `setup` project then signs in and creates
// the STAFF accounts; every flow in tests/*.spec.ts runs on that.
import { defineConfig, devices } from '@playwright/test';

import { BASE_URL, PORT, REPO_ROOT, serverEnv } from './env';

const isCI = Boolean(process.env.CI);
// E2E_SKIP_BUILD=1 reuses the existing apps/web/.next build (CI builds in its own step).
const skipBuild = process.env.E2E_SKIP_BUILD === '1';

const serverCommand = [
  'pnpm --filter @drinks/e2e db:prepare',
  ...(skipBuild ? [] : ['pnpm --filter @drinks/web build']),
  `pnpm --filter @drinks/web exec next start --port ${PORT}`,
].join(' && ');

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  forbidOnly: isCI,
  retries: 0,
  // Flows create their own warehouses and products, so they do not share stock.
  fullyParallel: false,
  workers: isCI ? 1 : 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: serverCommand,
    cwd: REPO_ROOT,
    url: `${BASE_URL}/api/health`,
    env: serverEnv(),
    // Always a fresh database and server: never attach to something already on the port.
    reuseExistingServer: false,
    timeout: 300_000,
    // E2E_SERVER_LOG=1 also shows the migrate / seed / build / server output.
    stdout: process.env.E2E_SERVER_LOG === '1' ? 'pipe' : 'ignore',
    stderr: 'pipe',
  },
});
