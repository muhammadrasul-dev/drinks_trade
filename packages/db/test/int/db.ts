// Minimal helpers for DB integration tests (T-102). T-105 generalizes them
// (truncate helper, factories, invariant checks).
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import pg from 'pg';
import { expect } from 'vitest';

export type Row = Record<string, unknown>;

export function testDatabaseUrl(): string {
  config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST is not set (copy .env.example to .env)');
  }
  // Guard against pointing the suite at a real database.
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`DATABASE_URL_TEST must name a *_test database, got ${url}`);
  }
  return url;
}

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  return client;
}

/** INSERT a row built from a column → value map and return it. */
export async function insert(client: pg.Client, table: string, row: Row): Promise<Row> {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query<Row>(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
     VALUES (${placeholders.join(', ')}) RETURNING *`,
    Object.values(row),
  );
  return rows[0]!;
}

export interface ExpectedPgError {
  /** SQLSTATE, e.g. 23514 check_violation, 23505 unique_violation, P0001 raise_exception. */
  code: string;
  constraint?: string;
  message?: string | RegExp;
}

/**
 * Runs `action` inside a savepoint, asserts it fails with the expected
 * Postgres error and rolls back to the savepoint so the test transaction
 * stays usable.
 */
export async function expectPgError(
  client: pg.Client,
  action: () => Promise<unknown>,
  expected: ExpectedPgError,
): Promise<void> {
  await client.query('SAVEPOINT expect_pg_error');
  let error: unknown;
  try {
    await action();
  } catch (err) {
    error = err;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_pg_error');

  expect(error, 'statement should have failed').toBeInstanceOf(pg.DatabaseError);
  const dbError = error as pg.DatabaseError;
  expect(dbError.code).toBe(expected.code);
  if (expected.constraint !== undefined) {
    expect(dbError.constraint).toBe(expected.constraint);
  }
  if (expected.message !== undefined) {
    expect(dbError.message).toMatch(expected.message);
  }
}
