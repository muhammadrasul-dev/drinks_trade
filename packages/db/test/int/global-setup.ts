// Applies all migrations to the test database before the integration suite.
// `migrate deploy` only runs pending migrations; it never resets data.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { testDatabaseUrl } from './db';

export default function setup(): void {
  execFileSync('prisma', ['migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
