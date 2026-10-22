import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { type Prisma, PrismaClient } from '../src/generated/prisma/client';
import { testDatabaseUrl } from './env';

/** A Prisma client or one interactive transaction of it. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Anything the raw-SQL helpers (truncate, invariants) can run a query on. */
export type Queryable = DbClient | pg.ClientBase;

/** A separate Prisma client on the test database; `$disconnect()` it in afterAll. */
export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });
}

/** A raw `pg` client on the test database (for SQLSTATE-level tests); `end()` it. */
export async function connectPg(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  return client;
}

const isPrisma = (db: Queryable): db is DbClient => '$queryRawUnsafe' in db;

export async function queryRows<T>(db: Queryable, sql: string): Promise<T[]> {
  if (isPrisma(db)) {
    return db.$queryRawUnsafe<T[]>(sql);
  }
  return (await db.query(sql)).rows as T[];
}

export async function execute(db: Queryable, sql: string): Promise<void> {
  if (isPrisma(db)) {
    await db.$executeRawUnsafe(sql);
  } else {
    await db.query(sql);
  }
}
