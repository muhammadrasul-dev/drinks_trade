import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'db',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // DB integration tests run only via `pnpm test:int` (vitest.int.config.ts).
    exclude: [...configDefaults.exclude, 'test/int/**'],
  },
});
