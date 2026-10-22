import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Self-contained server bundle for docker/web.Dockerfile (architecture §8.4).
  output: 'standalone',
  // Trace files from the monorepo root so workspace packages land in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Workspace packages ship TypeScript source, not built JS.
  transpilePackages: ['@drinks/shared', '@drinks/ui'],
};

export default withNextIntl(nextConfig);
