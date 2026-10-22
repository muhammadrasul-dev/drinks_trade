import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

/** DATABASE_URL_TEST from the repo-root .env (or CI env), guarded to a *_test database. */
export function testDatabaseUrl(): string {
  config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST is not set (copy .env.example to .env)');
  }
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`DATABASE_URL_TEST must name a *_test database, got ${url}`);
  }
  return url;
}
