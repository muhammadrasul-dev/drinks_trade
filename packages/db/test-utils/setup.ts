// Vitest setupFiles entry: runs in each worker before every test file.
// 1. Points DATABASE_URL at the test database, so `@drinks/db`'s singleton
//    client (read on first import) connects there.
// 2. Empties all tables before the file's own hooks, so every file starts
//    from an empty database whatever the previous file committed.
import { beforeAll } from 'vitest';

import { connectPg } from './client';
import { testDatabaseUrl } from './env';
import { truncateAll } from './truncate';

process.env.DATABASE_URL = testDatabaseUrl();

beforeAll(async () => {
  const client = await connectPg();
  try {
    await truncateAll(client);
  } finally {
    await client.end();
  }
});
