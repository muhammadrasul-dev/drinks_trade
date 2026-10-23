// Fresh E2E database for every run (architecture §10): drop and re-create
// it, apply the migrations and run the minimal production seed (OWNER, store,
// two cashboxes). Everything else the flows need is created through the UI.
// Run by Playwright's webServer command before the app starts, so no app
// connection is open yet; WITH (FORCE) also ends any left over from a
// crashed run. `pnpm --filter @drinks/e2e db:prepare`.
import { execFileSync } from 'node:child_process';

import pg from 'pg';

import { DATABASE_URL, REPO_ROOT, serverEnv } from '../env';

const url = new URL(DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));

// Never point this at the dev or integration-test database.
if (!/^[a-z0-9_]+_e2e$/.test(database)) {
  throw new Error(`E2E database name must end with "_e2e", got "${database}"`);
}

const admin = new URL(DATABASE_URL);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${database}"`);
} finally {
  await client.end();
}

const env = { ...process.env, ...serverEnv() };
const run = (...args: string[]) =>
  execFileSync('pnpm', ['--filter', '@drinks/db', ...args], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
  });

run('exec', 'prisma', 'migrate', 'deploy');
run('seed');
console.log(`E2E database "${database}" is ready`);
