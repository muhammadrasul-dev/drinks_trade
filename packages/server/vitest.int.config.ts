// Integration tests against DATABASE_URL_TEST (`pnpm test:int`). Kept out of
// the default `pnpm test`, so unit tests and CI's check job need no database.
import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    name: 'server-int',
    environment: 'node',
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    setupFiles: ['test/int/setup.ts'],
    // Files share one database; run them one at a time.
    fileParallelism: false,
  },
});
