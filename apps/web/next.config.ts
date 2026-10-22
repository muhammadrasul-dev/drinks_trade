import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Locally DATABASE_URL lives in the repo-root .env (architecture §8.2); Next.js
// only reads apps/web/.env*. Variables already set (CI, production) win.
loadEnv({ path: path.join(import.meta.dirname, '../../.env'), quiet: true });

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Self-contained server bundle for docker/web.Dockerfile (architecture §8.4).
  output: 'standalone',
  // Trace files from the monorepo root so workspace packages land in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Workspace packages ship TypeScript source, not built JS. @drinks/db is reached
  // only through @drinks/server (apps/web never imports it, ESLint enforces that).
  transpilePackages: ['@drinks/shared', '@drinks/ui', '@drinks/server', '@drinks/db'],
  // Dev logs print Server Action arguments verbatim — loginAction would leak passwords.
  logging: { serverFunctions: false },
};

export default withNextIntl(nextConfig);
