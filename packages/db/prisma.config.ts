// Prisma 7 CLI config: schema/migrations paths and the connection URL.
// The URL comes from the repo-root .env (architecture §8.2); CI sets it via env.
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` needs no database, so a missing URL must not fail
    // install/CI; migrate/studio fail loudly on the empty string instead.
    url: process.env.DATABASE_URL ?? '',
  },
});
