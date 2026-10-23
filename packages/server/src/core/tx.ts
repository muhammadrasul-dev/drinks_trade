import type { Prisma } from '@drinks/db';

/** Prisma client bound to one interactive transaction. */
export type Tx = Prisma.TransactionClient;

export interface TransactionOptions {
  /** Max time (ms) to wait for a pool connection. */
  maxWait?: number;
  /** Max time (ms) the callback may run before Prisma rolls back. */
  timeout?: number;
}

const DEFAULTS = { maxWait: 5_000, timeout: 15_000 } satisfies TransactionOptions;

/**
 * Runs `fn` in one Postgres transaction at READ COMMITTED (ADR-009,
 * architecture §5.3). A throw rolls everything back, audit rows included.
 *
 * `@drinks/db` is imported lazily: its client needs DATABASE_URL at import
 * time, and importing `@drinks/server` (unit tests, `next build`) must not.
 */
export async function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { prisma } = await import('@drinks/db');
  return prisma.$transaction(fn, {
    ...DEFAULTS,
    ...options,
    isolationLevel: 'ReadCommitted',
  });
}

/** Unique-constraint violation (P2002) - a concurrent write took the same unique value. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
