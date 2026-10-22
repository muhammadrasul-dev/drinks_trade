// Shared ESLint flat config presets for the drinks_trade monorepo.
// Package boundaries: .claude/docs/architecture.md §3.1, conventions.md §3.
import { builtinModules } from 'node:module';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SOURCE_EXT = '{js,jsx,mjs,cjs,ts,tsx,mts,cts}';

export const IGNORES = [
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/storage/**',
  '**/next-env.d.ts',
];

const PRISMA_PATTERNS = [
  {
    group: ['@prisma/*', 'prisma', 'prisma/*', '.prisma/*'],
    message: 'Prisma is server-only: go through @drinks/server services instead.',
  },
];

const DB_PATTERNS = [
  {
    group: ['@drinks/db', '@drinks/db/*', '**/packages/db', '**/packages/db/*'],
    message: 'packages/db may only be imported by packages/server.',
  },
];

const NODE_BUILTINS = [
  ...new Set(
    builtinModules.flatMap((name) => {
      const bare = name.replace(/^node:/, '');
      return [bare, `${bare}/*`];
    }),
  ),
  'node:*',
];

const NODE_PATTERNS = [
  {
    group: NODE_BUILTINS,
    message: 'packages/shared must run in the browser: Node built-in modules are not allowed.',
  },
];

/** Base rules for every JS/TS file in the repo. */
export const base = tseslint.config(
  { ignores: IGNORES },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.es2024 },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);

/** apps/web: no Prisma, no packages/db (business logic lives in packages/server). */
export function webBoundaries(files = [`apps/web/**/*.${SOURCE_EXT}`]) {
  return [
    {
      name: 'drinks/boundaries/web',
      files,
      rules: {
        'no-restricted-imports': ['error', { patterns: [...PRISMA_PATTERNS, ...DB_PATTERNS] }],
      },
    },
  ];
}

/** packages/shared: no Prisma, no packages/db, no Node built-ins (must run in the browser). */
export function sharedBoundaries(files = [`packages/shared/**/*.${SOURCE_EXT}`]) {
  return [
    {
      name: 'drinks/boundaries/shared',
      files,
      languageOptions: { globals: { ...globals.browser } },
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: [...PRISMA_PATTERNS, ...DB_PATTERNS, ...NODE_PATTERNS] },
        ],
      },
    },
  ];
}

/** Node-side code (server, db, tooling config files). */
export function nodeFiles(files) {
  return [{ name: 'drinks/node', files, languageOptions: { globals: { ...globals.node } } }];
}

/** Must be last: turns off stylistic rules that conflict with Prettier. */
export const prettierCompat = [prettier];
