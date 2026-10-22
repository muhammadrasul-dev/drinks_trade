// Only packages/server may import this package (architecture §3.1, enforced by ESLint).
export { prisma } from './client';
export * from './generated/prisma/client';
