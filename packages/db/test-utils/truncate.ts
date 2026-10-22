import { execute, type Queryable, queryRows } from './client';

/**
 * Empties every application table (all of `public` except Prisma's migration
 * history) and restarts the BIGSERIAL ids. TRUNCATE does not fire the
 * row-level append-only triggers of audit_log, stock_movement and
 * cash_transaction (verified in test-utils.int.test.ts).
 *
 * Refuses to run unless the connected database is named `*_test`.
 */
export async function truncateAll(db: Queryable): Promise<void> {
  const [current] = await queryRows<{ name: string }>(db, 'SELECT current_database() AS name');
  if (!current?.name.endsWith('_test')) {
    throw new Error(`truncateAll refuses to run on database "${current?.name}"`);
  }
  const tables = await queryRows<{ name: string }>(
    db,
    `SELECT tablename AS name FROM pg_tables
      WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
      ORDER BY tablename`,
  );
  if (tables.length === 0) {
    return;
  }
  const list = tables.map((t) => `"${t.name}"`).join(', ');
  await execute(db, `TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
