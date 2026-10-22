// T-103: the base and dev seeds run twice against the test database without
// errors or duplicates, and a re-run keeps existing data as it is.
import { verify } from '@node-rs/argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEV_STAFF_PASSWORD, seedDev } from '../../prisma/seed.dev';
import { createClient, ownerFromEnv, seed, type OwnerCredentials } from '../../prisma/seed';
import { assertInvariants, testDatabaseUrl } from '../../test-utils';
import type { PrismaClient } from '../../src/generated/prisma/client';

const owner: OwnerCredentials = { username: 'owner', password: 'owner-pass-123' };

let prisma: PrismaClient;

async function counts(): Promise<Record<string, number>> {
  return {
    organization: await prisma.organization.count(),
    store: await prisma.store.count(),
    cashbox: await prisma.cashbox.count(),
    docSequence: await prisma.docSequence.count(),
    owner: await prisma.user.count({ where: { role: 'OWNER' } }),
    staff: await prisma.user.count({ where: { role: 'STAFF' } }),
    warehouse: await prisma.warehouse.count(),
    subWarehouse: await prisma.subWarehouse.count(),
    category: await prisma.category.count(),
    brand: await prisma.brand.count(),
    product: await prisma.product.count(),
  };
}

beforeAll(async () => {
  // The kit's setup file has already emptied the database for this file.
  prisma = createClient(testDatabaseUrl());
});

afterAll(async () => {
  await assertInvariants(prisma);
  await prisma.$disconnect();
});

describe('seed (T-103)', () => {
  it('creates the minimal data and is idempotent', async () => {
    await seed(prisma, owner);
    const first = await counts();
    await seed(prisma, owner);

    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({
      organization: 1,
      store: 1,
      cashbox: 2,
      docSequence: 3,
      owner: 1,
      staff: 0,
      product: 0,
    });

    const store = await prisma.store.findFirstOrThrow();
    expect(store.timezone).toBe('Asia/Tashkent');
    const cashboxes = await prisma.cashbox.findMany({ orderBy: { type: 'asc' } });
    expect(cashboxes.map((c) => [c.type, c.name, c.balance])).toEqual([
      ['CASH', 'Naqd', 0n],
      ['CARD', 'Karta', 0n],
    ]);
    const sequences = await prisma.docSequence.findMany({ orderBy: { docType: 'asc' } });
    expect(sequences.map((s) => [s.docType, s.lastNumber])).toEqual([
      ['SALE', 0],
      ['PURCHASE', 0],
      ['STOCK_COUNT', 0],
    ]);

    const user = await prisma.user.findFirstOrThrow({ where: { role: 'OWNER' } });
    expect(user.username).toBe('owner');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(user.passwordHash, owner.password)).toBe(true);
  });

  it('does not reset doc counters or the owner on a re-run', async () => {
    await prisma.docSequence.updateMany({ data: { lastNumber: 7 } });
    const before = await prisma.user.findFirstOrThrow({ where: { role: 'OWNER' } });

    await seed(prisma, { username: 'other', password: 'another-pass' });

    const after = await prisma.user.findFirstOrThrow({ where: { role: 'OWNER' } });
    expect(after.username).toBe(before.username);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.docSequence.count({ where: { lastNumber: 7 } })).toBe(3);
  });

  it('dev seed adds sample data and is idempotent', async () => {
    await seedDev(prisma, owner);
    const first = await counts();
    await seedDev(prisma, owner);

    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({ organization: 1, store: 1, owner: 1, staff: 2, warehouse: 2 });
    expect(first.subWarehouse).toBeGreaterThanOrEqual(4);
    expect(first.subWarehouse).toBeLessThanOrEqual(6);
    expect(first.product).toBeGreaterThanOrEqual(10);
    expect(first.product).toBeLessThanOrEqual(15);
    expect(await prisma.product.count({ where: { categoryId: null } })).toBe(0);
    expect(await prisma.product.count({ where: { brandId: null } })).toBe(0);

    const staff = await prisma.user.findFirstOrThrow({ where: { role: 'STAFF' } });
    expect(await verify(staff.passwordHash, DEV_STAFF_PASSWORD)).toBe(true);
  });
});

describe('ownerFromEnv', () => {
  it('lowercases the username and validates both fields', () => {
    expect(
      ownerFromEnv({ SEED_OWNER_USERNAME: ' Owner ', SEED_OWNER_PASSWORD: '12345678' }),
    ).toEqual({ username: 'owner', password: '12345678' });
    expect(() =>
      ownerFromEnv({ SEED_OWNER_USERNAME: 'a b', SEED_OWNER_PASSWORD: '12345678' }),
    ).toThrow(/SEED_OWNER_USERNAME/);
    expect(() =>
      ownerFromEnv({ SEED_OWNER_USERNAME: 'owner', SEED_OWNER_PASSWORD: 'short' }),
    ).toThrow(/SEED_OWNER_PASSWORD/);
    expect(() => ownerFromEnv({})).toThrow(/SEED_OWNER_USERNAME/);
  });
});
