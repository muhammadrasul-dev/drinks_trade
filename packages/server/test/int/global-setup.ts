// Applies pending migrations to the test database (never resets data), so
// this suite also runs on its own, without @drinks/db's test:int first.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { testDatabaseUrl } from './env';

export default function setup(): void {
  const dbPackage = fileURLToPath(new URL('../../../db', import.meta.url));
  execFileSync(`${dbPackage}/node_modules/.bin/prisma`, ['migrate', 'deploy'], {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
