// Integration tests against DATABASE_URL_TEST (`pnpm test:int`). Kept out of
// the default `pnpm test`, so unit tests and CI's check job need no database.
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'db-int',
    environment: 'node',
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    // Files share one database; run them one at a time.
    fileParallelism: false,
  },
});
