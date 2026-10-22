// T-105: the integration-test kit itself — TRUNCATE gets past the append-only
// triggers, factories build valid rows, assertInvariants catches every kind
// of drift (both through Prisma and through a raw pg client).
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  assertInvariants,
  connectPg,
  createTestPrisma,
  findInvariantViolations,
  makeBrand,
  makeCashbox,
  makeCategory,
  makeProduct,
  makeStoreFixture,
  makeSubWarehouse,
  makeUser,
  makeWarehouse,
  type StoreFixture,
  truncateAll,
} from '../../test-utils';

let prisma: PrismaClient;
let client: pg.Client;

beforeAll(async () => {
  prisma = createTestPrisma();
  client = await connectPg();
});

afterAll(async () => {
  await client.end();
  await prisma.$disconnect();
});

async function journalCounts(): Promise<number[]> {
  return Promise.all([
    prisma.auditLog.count(),
    prisma.stockMovement.count(),
    prisma.cashTransaction.count(),
  ]);
}

describe('truncateAll', () => {
  it('empties the append-only journals and restarts their ids', async () => {
    const f = await makeStoreFixture(prisma, { cashBalance: 5_000n });
    const product = await makeProduct(prisma, { organizationId: f.organization.id });
    await prisma.auditLog.create({
      data: { storeId: f.store.id, action: 'CREATE', entityType: 'product', entityId: product.id },
    });
    await prisma.stockMovement.create({
      data: {
        storeId: f.store.id,
        productId: product.id,
        subWarehouseId: f.subWarehouse.id,
        type: 'PURCHASE',
        qtyDelta: 6,
        unitCost: '1000',
        costAmount: 6_000n,
        avgCostBefore: '0',
        avgCostAfter: '1000',
        docDate: new Date(),
        createdById: f.owner.id,
      },
    });
    expect(await journalCounts()).toEqual([1, 1, 1]);
    // The triggers really are there: DELETE is refused …
    await expect(client.query('DELETE FROM stock_movement')).rejects.toThrow(/append-only/);

    // … but TRUNCATE (no row triggers) goes through.
    await truncateAll(prisma);
    expect(await journalCounts()).toEqual([0, 0, 0]);
    expect(await prisma.organization.count()).toBe(0);

    const again = await makeStoreFixture(prisma, { cashBalance: 1n });
    const tx = await prisma.cashTransaction.findFirstOrThrow({
      where: { cashboxId: again.cashboxes.cash.id },
    });
    expect(tx.id).toBe(1n); // RESTART IDENTITY
    await truncateAll(client); // the raw pg path works too
    expect(await prisma.cashTransaction.count()).toBe(0);
  });
});

describe('factories', () => {
  it('create missing parents and apply defaults', async () => {
    const product = await makeProduct(prisma);
    expect(product).toMatchObject({ unitsPerBlock: 6, salePrice: 12_000n, archivedAt: null });
    expect(await prisma.organization.count({ where: { id: product.organizationId } })).toBe(1);

    const sub = await makeSubWarehouse(prisma);
    const warehouse = await prisma.warehouse.findUniqueOrThrow({
      where: { id: sub.warehouseId },
      include: { subWarehouses: true },
    });
    expect(warehouse.subWarehouses.map((s) => s.id)).toEqual([sub.id]);

    const user = await makeUser(prisma);
    expect(user.role).toBe('STAFF');
    expect(user.username).toMatch(/^[a-z0-9._-]{3,32}$/);
  });

  it('take overrides and stay unique across calls', async () => {
    const f = await makeStoreFixture(prisma);
    const organizationId = f.organization.id;
    const category = await makeCategory(prisma, { organizationId, name: 'Suv' });
    const brand = await makeBrand(prisma, { organizationId });
    const product = await makeProduct(prisma, {
      organizationId,
      name: 'Nestle 1.5L',
      categoryId: category.id,
      brandId: brand.id,
      unitsPerBlock: 12,
      salePrice: 5_000n,
    });
    expect(product).toMatchObject({ name: 'Nestle 1.5L', unitsPerBlock: 12, salePrice: 5_000n });

    // Same parent, default names: no unique-constraint collisions.
    await makeCategory(prisma, { organizationId });
    await makeCategory(prisma, { organizationId });
    await makeUser(prisma, { organizationId });

    const warehouse = await makeWarehouse(prisma, {
      storeId: f.store.id,
      subWarehouses: ['B', 'A'],
    });
    expect(warehouse.subWarehouses.map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('makeStoreFixture builds a consistent store', async () => {
    const f: StoreFixture = await makeStoreFixture(prisma, { cashBalance: 100_000n });
    expect(f.owner.role).toBe('OWNER');
    expect(f.staff.role).toBe('STAFF');
    expect(f.subWarehouse.warehouseId).toBe(f.warehouse.id);
    expect([f.cashboxes.cash.type, f.cashboxes.cash.balance]).toEqual(['CASH', 100_000n]);
    expect([f.cashboxes.card.type, f.cashboxes.card.balance]).toEqual(['CARD', 0n]);
    expect(
      await prisma.cashTransaction.findFirstOrThrow({
        where: { cashboxId: f.cashboxes.cash.id },
      }),
    ).toMatchObject({ direction: 'IN', amount: 100_000n, balanceAfter: 100_000n });
    await assertInvariants(prisma);
  });

  it('makeCashbox books a positive balance as a transaction', async () => {
    const cashbox = await makeCashbox(prisma, { type: 'CARD', balance: 7_000n });
    expect(cashbox).toMatchObject({ type: 'CARD', name: 'Karta', balance: 7_000n });
    await assertInvariants(prisma);
  });
});

describe('assertInvariants', () => {
  let f: StoreFixture;
  let productId: string;

  beforeAll(async () => {
    await truncateAll(prisma);
    f = await makeStoreFixture(prisma);
    productId = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
  });

  /** Runs `fn` on the raw client inside a transaction that is rolled back. */
  async function rolledBack(fn: () => Promise<void>): Promise<void> {
    await client.query('BEGIN');
    try {
      await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  }

  const movement = (qtyDelta: number) =>
    client.query(
      `INSERT INTO stock_movement (store_id, product_id, sub_warehouse_id, type, qty_delta,
         unit_cost, cost_amount, avg_cost_before, avg_cost_after, doc_date, created_by_id)
       VALUES ($1, $2, $3, 'PURCHASE', $4, 1000, $4 * 1000, 0, 1000, now(), $5)`,
      [f.store.id, productId, f.subWarehouse.id, qtyDelta, f.owner.id],
    );
  const balance = (qty: number) =>
    client.query(
      `INSERT INTO stock_balance (sub_warehouse_id, product_id, qty, updated_at)
       VALUES ($1, $2, $3, now())`,
      [f.subWarehouse.id, productId, qty],
    );
  const cost = (totalQty: number) =>
    client.query(
      `INSERT INTO product_cost (store_id, product_id, total_qty, avg_cost, updated_at)
       VALUES ($1, $2, $3, 1000, now())`,
      [f.store.id, productId, totalQty],
    );

  it('passes on consistent stock and cash', async () => {
    await rolledBack(async () => {
      await movement(10);
      await movement(-4);
      await balance(6);
      await cost(6);
      await assertInvariants(client);
    });
    await assertInvariants(prisma);
  });

  it('reports stock_balance ≠ Σ movements, also for a missing balance row', async () => {
    await rolledBack(async () => {
      await movement(10);
      await balance(9);
      await cost(9);
      expect((await findInvariantViolations(client)).stockBalance).toEqual([
        { subWarehouseId: f.subWarehouse.id, productId, balance: '9', movements: '10' },
      ]);
    });
    await rolledBack(async () => {
      await movement(3);
      const v = await findInvariantViolations(client);
      expect(v.stockBalance).toEqual([expect.objectContaining({ balance: '0', movements: '3' })]);
      expect(v.productCost).toEqual([]);
      await expect(assertInvariants(client)).rejects.toThrow(/stockBalance/);
    });
  });

  it('reports product_cost.total_qty ≠ Σ balances, also for a missing cost row', async () => {
    await rolledBack(async () => {
      await movement(5);
      await balance(5);
      await cost(4);
      expect((await findInvariantViolations(client)).productCost).toEqual([
        { storeId: f.store.id, productId, totalQty: '4', balances: '5' },
      ]);
    });
    await rolledBack(async () => {
      await movement(5);
      await balance(5);
      expect((await findInvariantViolations(client)).productCost).toEqual([
        expect.objectContaining({ totalQty: '0', balances: '5' }),
      ]);
      await expect(assertInvariants(client)).rejects.toThrow(/productCost/);
    });
  });

  it('reports cashbox.balance ≠ Σ IN − Σ OUT', async () => {
    const cashTx = (direction: 'IN' | 'OUT', type: string, amount: number) =>
      client.query(
        `INSERT INTO cash_transaction (store_id, cashbox_id, direction, type, amount,
           balance_after, tx_date, created_by_id)
         VALUES ($1, $2, $3, $4, $5, 0, now(), $6)`,
        [f.store.id, f.cashboxes.card.id, direction, type, amount, f.owner.id],
      );
    await rolledBack(async () => {
      await cashTx('IN', 'SALE_RECEIPT', 10_000);
      await cashTx('OUT', 'TRAVEL_EXPENSE', 3_000);
      await client.query('UPDATE cashbox SET balance = 7000 WHERE id = $1', [f.cashboxes.card.id]);
      await assertInvariants(client);

      await client.query('UPDATE cashbox SET balance = 8000 WHERE id = $1', [f.cashboxes.card.id]);
      expect((await findInvariantViolations(client)).cashbox).toEqual([
        { cashboxId: f.cashboxes.card.id, balance: '8000', transactions: '7000' },
      ]);
      await expect(assertInvariants(client)).rejects.toThrow(/cashbox/);
    });
    await rolledBack(async () => {
      await client.query('UPDATE cashbox SET balance = 1 WHERE id = $1', [f.cashboxes.card.id]);
      expect((await findInvariantViolations(client)).cashbox).toEqual([
        expect.objectContaining({ balance: '1', transactions: '0' }),
      ]);
    });
  });
});
