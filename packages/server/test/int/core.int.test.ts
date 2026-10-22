// T-104: server core against a real Postgres (drinks_trade_test).
// Fixtures that parallel transactions must see are committed in beforeAll
// (the kit's setup file empties the database before this file); everything
// else runs in a transaction that is rolled back by throwing ROLLBACK.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeUser,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { DomainError, ErrorCode } from '@drinks/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  audit,
  lockCashboxes,
  lockDebt,
  lockProductCosts,
  lockPurchase,
  lockSale,
  lockStockBalances,
  lockStockCount,
  lockWarehouses,
  nextDocNumber,
  type Tx,
  withTransaction,
} from '../../src/index';

const ROLLBACK = new Error('rollback');

/** Runs `fn` in a transaction and always rolls it back. */
async function inRolledBackTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  await expect(
    withTransaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    }),
  ).rejects.toBe(ROLLBACK);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A document author; lives only inside the rolled-back transaction. */
const createUser = (tx: Tx) => makeUser(tx, { organizationId: f.organizationId });

interface Fixtures {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  subWarehouseId: string;
  productIds: [string, string];
}
let f: Fixtures;

beforeAll(async () => {
  const store: StoreFixture = await makeStoreFixture(prisma, { cashBalance: 100_000n });
  const organizationId = store.organization.id;
  const products = [
    await makeProduct(prisma, { organizationId, name: 'Cola' }),
    await makeProduct(prisma, { organizationId, name: 'Fanta' }),
  ];
  f = {
    organizationId,
    storeId: store.store.id,
    warehouseId: store.warehouse.id,
    subWarehouseId: store.subWarehouse.id,
    productIds: [products[0]!.id, products[1]!.id],
  };
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('withTransaction', () => {
  it('commits on success and rolls back on throw', async () => {
    const name = `tx-${Date.now()}`;
    await inRolledBackTx(async (tx) => {
      await tx.warehouse.create({ data: { storeId: f.storeId, name } });
    });
    expect(await prisma.warehouse.count({ where: { name } })).toBe(0);
  });

  it('runs at READ COMMITTED', async () => {
    const level = await withTransaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { level: string }[]
      >`SELECT current_setting('transaction_isolation') AS level`;
      return rows[0]?.level;
    });
    expect(level).toBe('read committed');
  });
});

describe('nextDocNumber', () => {
  it('formats per doc type and counts per type', async () => {
    // One number per transaction: doc_sequence is a single lock step.
    const next = (docType: 'SALE' | 'PURCHASE' | 'STOCK_COUNT') =>
      withTransaction((tx) => nextDocNumber(tx, f.storeId, docType));
    expect(await next('SALE')).toBe('S-000001');
    expect(await next('PURCHASE')).toBe('P-000001');
    expect(await next('STOCK_COUNT')).toBe('I-000001');
  });

  it('never returns a duplicate number under parallel calls', async () => {
    const CALLS = 40;
    const numbers = await Promise.all(
      Array.from({ length: CALLS }, () =>
        withTransaction(async (tx) => {
          const number = await nextDocNumber(tx, f.storeId, 'SALE');
          await sleep(5); // hold the row lock so callers really overlap
          return number;
        }),
      ),
    );
    expect(new Set(numbers).size).toBe(CALLS);
    // Consecutive after the S-000001 of the previous test: no gaps on commit.
    const expected = Array.from({ length: CALLS }, (_, i) => `S-${String(i + 2).padStart(6, '0')}`);
    expect([...numbers].sort()).toEqual(expected);
  });

  it('leaves a gap when the transaction rolls back (database §6.3)', async () => {
    await inRolledBackTx(async (tx) => {
      await nextDocNumber(tx, f.storeId, 'PURCHASE');
    });
    expect(await withTransaction((tx) => nextDocNumber(tx, f.storeId, 'PURCHASE'))).toBe(
      'P-000002',
    );
  });
});

describe('locks (business-logic §2)', () => {
  it('takes every lock in order and returns typed rows', async () => {
    await inRolledBackTx(async (tx) => {
      const user = await createUser(tx);
      const sale = await tx.sale.create({
        data: { storeId: f.storeId, number: 'S-T104', docDate: new Date(), createdById: user.id },
      });
      const debt = await tx.debt.create({
        data: {
          storeId: f.storeId,
          direction: 'RECEIVABLE',
          source: 'MANUAL',
          amount: 50_000n,
          repaidAmount: 10_000n,
          note: 'T-104',
          debtDate: new Date(),
          createdById: user.id,
        },
      });

      expect(await lockSale(tx, f.storeId, sale.id)).toEqual({
        id: sale.id,
        status: 'DRAFT',
        version: 0,
      });
      expect(await lockWarehouses(tx, f.storeId, [f.warehouseId, f.warehouseId])).toEqual([
        { id: f.warehouseId, archivedAt: null },
      ]);
      expect(await nextDocNumber(tx, f.storeId, 'SALE')).toMatch(/^S-\d{6}$/);
      expect(await lockCashboxes(tx, f.storeId, ['CASH', 'CARD'])).toEqual([
        expect.objectContaining({ type: 'CARD', balance: 0 }),
        expect.objectContaining({ type: 'CASH', balance: 100_000 }),
      ]);
      expect(await lockDebt(tx, f.storeId, debt.id)).toEqual({
        id: debt.id,
        status: 'OPEN',
        amount: 50_000,
        repaidAmount: 10_000,
      });

      const costs = await lockProductCosts(tx, f.storeId, [...f.productIds].reverse());
      expect(costs.map((c) => c.productId)).toEqual([...f.productIds].sort());
      expect(costs.map((c) => [c.totalQty, c.avgCost.toFixed(4)])).toEqual([
        [0, '0.0000'],
        [0, '0.0000'],
      ]);

      const balances = await lockStockBalances(
        tx,
        f.productIds.map((productId) => ({ subWarehouseId: f.subWarehouseId, productId })),
      );
      expect(balances).toEqual(
        [...f.productIds]
          .sort()
          .map((productId) => ({ subWarehouseId: f.subWarehouseId, productId, qty: 0 })),
      );
    });
  });

  it('locks purchase and stock count rows, FOR UPDATE on warehouses', async () => {
    await inRolledBackTx(async (tx) => {
      const user = await createUser(tx);
      const count = await tx.stockCount.create({
        data: {
          storeId: f.storeId,
          warehouseId: f.warehouseId,
          number: 'I-T104',
          docDate: new Date(),
          createdById: user.id,
        },
      });
      expect(await lockStockCount(tx, f.storeId, count.id)).toMatchObject({
        id: count.id,
        status: 'DRAFT',
        warehouseId: f.warehouseId,
      });
      expect(
        await lockWarehouses(tx, f.storeId, [f.warehouseId], { exclusive: true }),
      ).toHaveLength(1);
    });
    await inRolledBackTx(async (tx) => {
      await expect(lockPurchase(tx, f.storeId, crypto.randomUUID())).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  it('throws NOT_FOUND for rows of another store', async () => {
    await inRolledBackTx(async (tx) => {
      const error = await lockWarehouses(tx, crypto.randomUUID(), [f.warehouseId]).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'warehouse' } });
    });
  });

  it('rejects taking locks out of order', async () => {
    await inRolledBackTx(async (tx) => {
      await lockStockBalances(tx, [
        { subWarehouseId: f.subWarehouseId, productId: f.productIds[0] },
      ]);
      await expect(lockCashboxes(tx, f.storeId, ['CASH'])).rejects.toThrow(/Lock order violation/);
    });
  });

  it('makes a second transaction wait for the stock_balance row lock', async () => {
    const key = { subWarehouseId: f.subWarehouseId, productId: f.productIds[0] };
    const events: string[] = [];
    const first = withTransaction(async (tx) => {
      await lockStockBalances(tx, [key]);
      events.push('first locked');
      await sleep(300);
      events.push('first done');
    });
    await sleep(100);
    const second = withTransaction(async (tx) => {
      await lockStockBalances(tx, [key]);
      events.push('second locked');
    });
    await Promise.all([first, second]);
    expect(events).toEqual(['first locked', 'first done', 'second locked']);
  });
});

describe('audit.log', () => {
  it('writes the row in the caller transaction (ADR-013)', async () => {
    const entityId = crypto.randomUUID();
    await inRolledBackTx(async (tx) => {
      await audit.log(
        tx,
        { user: null, storeId: f.storeId, requestId: 'req-t104' },
        {
          action: 'POST',
          entityType: 'sale',
          entityId,
          after: { totalAmount: 120_000n },
          backdated: true,
        },
      );
      const row = await tx.auditLog.findFirstOrThrow({ where: { entityId } });
      expect(row).toMatchObject({
        storeId: f.storeId,
        userId: null,
        action: 'POST',
        after: { totalAmount: '120000' },
        meta: { requestId: 'req-t104', backdated: true },
      });
    });
    // Rolled back together with the change it describes.
    expect(await prisma.auditLog.count({ where: { entityId } })).toBe(0);
  });
});
