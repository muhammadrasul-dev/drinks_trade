// Vitest globalSetup: applies pending migrations to the test database once
// per run. `migrate deploy` never resets data; per-file cleanup is setup.ts.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { DB_PACKAGE_DIR, testDatabaseUrl } from './env';

export function migrateTestDatabase(): void {
  execFileSync(join(DB_PACKAGE_DIR, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}

export default migrateTestDatabase;
