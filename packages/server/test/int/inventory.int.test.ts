// T-401: inventory core against a real Postgres. Each test builds its own
// store (one warehouse with sub-warehouses A and B) and commits through
// withTransaction, so costs are checked as NUMERIC(20,4) round-trips and
// rollbacks against committed state.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { DomainError, ErrorCode, type UserRole } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  inventory,
  lockStockBalances,
  type ServiceContext,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let subA: string;
let subB: string;
let productId: string;
const docDate = new Date('2026-10-01T09:00:00Z');

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  const warehouse = await makeWarehouse(prisma, { storeId: f.store.id, subWarehouses: ['A', 'B'] });
  [subA, subB] = warehouse.subWarehouses.map((s) => s.id) as [string, string];
  productId = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function ctxFor(role: UserRole = 'OWNER'): ServiceContext {
  const user = role === 'OWNER' ? f.owner : f.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: `req-${role}`,
  };
}

/** Purchase-style receipt: unitCost = lineTotal / qty is irrelevant to the average. */
function purchase(lines: { sub?: string; product?: string; qty: number; total: number }[]) {
  return withTransaction((tx) =>
    inventory.receive(tx, ctxFor('STAFF'), {
      type: 'PURCHASE',
      docDate,
      lines: lines.map((l) => ({
        subWarehouseId: l.sub ?? subA,
        productId: l.product ?? productId,
        qty: l.qty,
        unitCost: (l.total / l.qty).toFixed(4),
        costAmount: l.total,
      })),
    }),
  );
}

function sell(lines: { sub?: string; qty: number; lineNo?: number }[], role: UserRole = 'STAFF') {
  return withTransaction((tx) =>
    inventory.issue(tx, ctxFor(role), {
      type: 'SALE',
      docDate,
      lines: lines.map((l) => ({ subWarehouseId: l.sub ?? subA, productId, ...l })),
    }),
  );
}

async function state(product = productId) {
  const cost = await prisma.productCost.findUnique({
    where: { storeId_productId: { storeId: f.store.id, productId: product } },
  });
  const balances = await prisma.stockBalance.findMany({
    where: { productId: product },
    orderBy: { subWarehouseId: 'asc' },
  });
  return {
    totalQty: cost?.totalQty ?? 0,
    avgCost: cost?.avgCost.toFixed(4) ?? '0.0000',
    qty: Object.fromEntries(balances.map((b) => [b.subWarehouseId === subA ? 'A' : 'B', b.qty])),
  };
}

const movementCount = () => prisma.stockMovement.count({ where: { storeId: f.store.id } });

/** The thrown error, so its fields can be inspected. */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('inventory.receive', () => {
  it('BR-6: empty stock (Q = 0) → avg = inCost / q, rows created', async () => {
    const [movement] = await purchase([{ qty: 3, total: 1_000 }]);

    expect(await state()).toEqual({ totalQty: 3, avgCost: '333.3333', qty: { A: 3 } });
    expect(movement).toMatchObject({
      qtyDelta: 3,
      costAmount: 1_000,
      avgCostBefore: '0.0000',
      avgCostAfter: '333.3333',
    });
    const row = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement!.id } });
    expect(row).toMatchObject({
      type: 'PURCHASE',
      qtyDelta: 3,
      costAmount: 1_000n,
      docDate,
      createdById: f.staff.id,
      storeId: f.store.id,
    });
    expect(row.unitCost.toFixed(4)).toBe('333.3333');
    expect(row.avgCostAfter.toFixed(4)).toBe('333.3333');
  });

  it('BR-6: non-empty stock → (Q × avg + inCost) / (Q + q), OQ-09 example', async () => {
    await purchase([{ qty: 10, total: 50_000 }]);
    const [movement] = await purchase([{ qty: 10, total: 70_000 }]);

    expect(await state()).toEqual({ totalQty: 20, avgCost: '6000.0000', qty: { A: 20 } });
    expect(movement).toMatchObject({ avgCostBefore: '5000.0000', avgCostAfter: '6000.0000' });
  });

  it('BR-6: rounds half up to 4 digits on top of a stored fractional average', async () => {
    await purchase([{ qty: 3, total: 1_000 }]); // 333.3333
    await purchase([{ qty: 1, total: 1 }]);
    // (3 × 333.3333 + 1) / 4 = 250.249975 → 250.2500
    expect(await state()).toMatchObject({ totalQty: 4, avgCost: '250.2500' });
  });

  it('groups lines per product: one average, total qty across sub-warehouses', async () => {
    const other = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
    await purchase([{ qty: 10, total: 50_000 }]);
    const movements = await purchase([
      { sub: subA, qty: 4, total: 20_000 },
      { sub: subB, product: other, qty: 2, total: 9_000 },
      { sub: subB, qty: 6, total: 33_000 },
    ]);

    // (10 × 5000 + 20 000 + 33 000) / 20 = 5150
    expect(await state()).toEqual({ totalQty: 20, avgCost: '5150.0000', qty: { A: 14, B: 6 } });
    expect(await state(other)).toMatchObject({ totalQty: 2, avgCost: '4500.0000' });
    expect(
      movements.map((m) => [m.qtyDelta, m.costAmount, m.avgCostBefore, m.avgCostAfter]),
    ).toEqual([
      [4, 20_000, '5000.0000', '5150.0000'],
      [2, 9_000, '0.0000', '4500.0000'],
      [6, 33_000, '5000.0000', '5150.0000'],
    ]);
  });

  it('SALE_REVERSAL brings goods back at the sale cost and recalculates the average', async () => {
    await purchase([{ qty: 10, total: 50_000 }]);
    const [sold] = await sell([{ qty: 4 }]);
    await purchase([{ qty: 6, total: 42_000 }]); // (6 × 5000 + 42 000) / 12 = 6000
    const [back] = await withTransaction((tx) =>
      inventory.receive(tx, ctxFor(), {
        type: 'SALE_REVERSAL',
        docDate,
        lines: [
          {
            subWarehouseId: subA,
            productId,
            qty: 4,
            unitCost: sold!.unitCost,
            costAmount: -sold!.costAmount,
          },
        ],
      }),
    );

    // (12 × 6000 + 20 000) / 16 = 5750
    expect(back).toMatchObject({ qtyDelta: 4, unitCost: '5000.0000', costAmount: 20_000 });
    expect(await state()).toEqual({ totalQty: 16, avgCost: '5750.0000', qty: { A: 16 } });
  });

  it('rejects another store’s sub-warehouse with NOT_FOUND and writes nothing', async () => {
    const foreign = await makeWarehouse(prisma);
    const error = await caught(
      purchase([{ sub: foreign.subWarehouses[0]!.id, qty: 1, total: 100 }]),
    );
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'sub_warehouse' } });
    expect(await movementCount()).toBe(0);
  });

  it('rejects a product of another organization with NOT_FOUND', async () => {
    const foreign = await makeProduct(prisma);
    const error = await caught(purchase([{ product: foreign.id, qty: 1, total: 100 }]));
    expect(error).toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'product' } });
  });

  it('refuses to run after the caller took the stock_balance lock itself', async () => {
    await expect(
      withTransaction(async (tx) => {
        await lockStockBalances(tx, [{ subWarehouseId: subA, productId }]);
        return inventory.receive(tx, ctxFor(), {
          type: 'PURCHASE',
          docDate,
          lines: [{ subWarehouseId: subA, productId, qty: 1, unitCost: '1', costAmount: 1 }],
        });
      }),
    ).rejects.toThrow(/Lock order violation/);
  });

  it('rejects malformed lines as programmer errors', async () => {
    await expect(purchase([])).rejects.toThrow(RangeError);
    await expect(purchase([{ qty: 0, total: 0 }])).rejects.toThrow(RangeError);
    await expect(purchase([{ qty: 1.5, total: 10 }])).rejects.toThrow(RangeError);
  });
});

describe('inventory.issue — SALE', () => {
  it('BR-6: leaves at the current average, which stays; cost rounded half up per line', async () => {
    await purchase([{ qty: 3, total: 1_000 }]); // 333.3333
    const movements = await sell([
      { qty: 2, lineNo: 1 },
      { qty: 1, lineNo: 2 },
    ]);

    // 2 × 333.3333 = 666.6666 → 667; 1 × 333.3333 → 333
    expect(movements.map((m) => [m.qtyDelta, m.unitCost, m.costAmount])).toEqual([
      [-2, '333.3333', -667],
      [-1, '333.3333', -333],
    ]);
    expect(movements.every((m) => m.avgCostBefore === m.avgCostAfter)).toBe(true);
    expect(await state()).toEqual({ totalQty: 0, avgCost: '333.3333', qty: { A: 0 } });
    const rows = await prisma.stockMovement.findMany({
      where: { type: 'SALE', storeId: f.store.id },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => r.costAmount)).toEqual([-667n, -333n]);
  });

  it('BR-7: insufficient stock → INSUFFICIENT_STOCK per line, sums lines of one key, rolls back', async () => {
    await purchase([
      { sub: subA, qty: 5, total: 5_000 },
      { sub: subB, qty: 9, total: 9_000 },
    ]);
    const before = await state();
    const movementsBefore = await movementCount();

    // A: 3 + 3 > 5 although each line fits; B: 2 ≤ 9 is fine.
    const error = await caught(
      sell([
        { sub: subA, qty: 3, lineNo: 1 },
        { sub: subB, qty: 2, lineNo: 2 },
        { sub: subA, qty: 3, lineNo: 3 },
      ]),
    );

    expect(error).toBeInstanceOf(DomainError);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(error).toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
      params: {
        lines: [
          {
            lineNo: 1,
            productId,
            product: product.name,
            subWarehouseId: subA,
            available: 5,
            required: 6,
          },
          {
            lineNo: 3,
            productId,
            product: product.name,
            subWarehouseId: subA,
            available: 5,
            required: 6,
          },
        ],
      },
    });
    expect(await state()).toEqual(before);
    expect(await movementCount()).toBe(movementsBefore);
  });

  it('BR-7: nothing ever received → available 0', async () => {
    const error = await caught(sell([{ qty: 1, lineNo: 1 }]));
    expect(error).toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
      params: { lines: [{ lineNo: 1, available: 0, required: 1 }] },
    });
  });

  it('BR-7: two parallel sales of the last pieces — exactly one wins (ADR-009)', async () => {
    await purchase([{ qty: 10, total: 10_000 }]);
    const results = await Promise.allSettled([sell([{ qty: 6 }]), sell([{ qty: 6 }])]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected')!;
    expect(rejected.reason).toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
      params: { lines: [{ available: 4, required: 6 }] },
    });
    expect(await state()).toMatchObject({ totalQty: 4, qty: { A: 4 } });
  });
});

describe('inventory.issue — PURCHASE_REVERSAL', () => {
  function reverse(lines: { sub?: string; qty: number; total: number }[]) {
    return withTransaction((tx) =>
      inventory.issue(tx, ctxFor(), {
        type: 'PURCHASE_REVERSAL',
        docDate,
        lines: lines.map((l) => ({
          subWarehouseId: l.sub ?? subA,
          productId,
          qty: l.qty,
          unitCost: (l.total / l.qty).toFixed(4),
          costAmount: l.total,
        })),
      }),
    );
  }

  it('OQ-09: (Q × avg − outCost) / (Q − q)', async () => {
    await purchase([{ qty: 10, total: 50_000 }]);
    await purchase([{ qty: 10, total: 70_000 }]); // 6000
    const [movement] = await reverse([{ qty: 10, total: 70_000 }]);

    expect(movement).toMatchObject({
      qtyDelta: -10,
      unitCost: '7000.0000',
      costAmount: -70_000,
      avgCostBefore: '6000.0000',
      avgCostAfter: '5000.0000',
    });
    expect(await state()).toEqual({ totalQty: 10, avgCost: '5000.0000', qty: { A: 10 } });
  });

  it('OQ-09: Q − q = 0 → avg 0; a negative result is floored at 0', async () => {
    await purchase([{ qty: 4, total: 4_000 }]);
    await reverse([{ qty: 4, total: 4_000 }]);
    expect(await state()).toEqual({ totalQty: 0, avgCost: '0.0000', qty: { A: 0 } });

    await purchase([{ qty: 2, total: 1_000 }]);
    await purchase([{ qty: 2, total: 9_000 }]); // 2500
    await sell([{ qty: 1 }]);
    // 3 × 2500 − 9 000 < 0 → 0
    await reverse([{ qty: 2, total: 9_000 }]);
    expect(await state()).toEqual({ totalQty: 1, avgCost: '0.0000', qty: { A: 1 } });
  });

  it('BR-3: not enough left → PURCHASE_REVERSAL_INSUFFICIENT_STOCK, rolls back', async () => {
    await purchase([{ qty: 10, total: 50_000 }]);
    await sell([{ qty: 7 }]);
    const before = await state();

    const error = await caught(reverse([{ qty: 10, total: 50_000 }]));
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_REVERSAL_INSUFFICIENT_STOCK,
      params: { productId, subWarehouseId: subA, subWarehouse: 'A', available: 3, required: 10 },
    });
    expect(await state()).toEqual(before);
  });
});

describe('inventory.adjust', () => {
  it('BR-8: surplus and shortage per sub-warehouse, one result per product at the average', async () => {
    await purchase([
      { sub: subA, qty: 3, total: 1_000 },
      { sub: subB, qty: 5, total: 1_667 },
    ]);
    // (1 000 + 1 667) / 8 = 333.375 → 333.3750
    expect(await state()).toMatchObject({ totalQty: 8, avgCost: '333.3750' });

    const result = await withTransaction((tx) =>
      inventory.adjust(tx, ctxFor('STAFF'), {
        docDate,
        lines: [
          { subWarehouseId: subA, productId, countedQty: 5 }, // +2
          { subWarehouseId: subB, productId, countedQty: 2 }, // −3
        ],
      }),
    );

    expect(result.lines.map((l) => [l.systemQty, l.countedQty, l.qtyDelta])).toEqual([
      [3, 5, 2],
      [5, 2, -3],
    ]);
    expect(result.lines.map((l) => [l.movement?.qtyDelta, l.movement?.costAmount])).toEqual([
      [2, 667], // 666.75 → 667
      [-3, -1_000], // −1000.125 → −1000
    ]);
    expect(result.products).toEqual([
      { productId, systemQty: 8, countedQty: 7, qtyDelta: -1, avgCost: '333.3750', amount: -333 },
    ]);
    expect(await state()).toEqual({ totalQty: 7, avgCost: '333.3750', qty: { A: 5, B: 2 } });
    const rows = await prisma.stockMovement.findMany({
      where: { type: 'COUNT_ADJUSTMENT', storeId: f.store.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.avgCostBefore.equals(r.avgCostAfter))).toBe(true);
  });

  it('moving goods between sub-warehouses nets to 0 for the product', async () => {
    await purchase([{ sub: subA, qty: 6, total: 6_000 }]);
    const result = await withTransaction((tx) =>
      inventory.adjust(tx, ctxFor(), {
        docDate,
        lines: [
          { subWarehouseId: subA, productId, countedQty: 2 },
          { subWarehouseId: subB, productId, countedQty: 4 },
        ],
      }),
    );
    expect(result.products).toMatchObject([{ qtyDelta: 0, amount: 0 }]);
    expect(await state()).toEqual({ totalQty: 6, avgCost: '1000.0000', qty: { A: 2, B: 4 } });
  });

  it('a matching line writes no movement; a never-received surplus is worth 0 (§6.4)', async () => {
    const fresh = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
    await purchase([{ qty: 4, total: 4_000 }]);
    const before = await movementCount();

    const result = await withTransaction((tx) =>
      inventory.adjust(tx, ctxFor(), {
        docDate,
        lines: [
          { subWarehouseId: subA, productId, countedQty: 4 },
          { subWarehouseId: subA, productId: fresh, countedQty: 3 },
        ],
      }),
    );

    expect(result.lines.map((l) => l.movement === null)).toEqual([true, false]);
    expect(await movementCount()).toBe(before + 1);
    expect(result.products.find((p) => p.productId === fresh)).toMatchObject({
      qtyDelta: 3,
      avgCost: '0.0000',
      amount: 0,
    });
    expect(await state(fresh)).toEqual({ totalQty: 3, avgCost: '0.0000', qty: { A: 3 } });
    // The next purchase prices the surplus pieces in: (3 × 0 + 6 000) / 6 = 1000.
    await purchase([{ product: fresh, qty: 3, total: 6_000 }]);
    expect(await state(fresh)).toMatchObject({ totalQty: 6, avgCost: '1000.0000' });
  });

  it('counting down to 0 empties the balance', async () => {
    await purchase([{ qty: 4, total: 4_000 }]);
    await withTransaction((tx) =>
      inventory.adjust(tx, ctxFor(), {
        docDate,
        lines: [{ subWarehouseId: subA, productId, countedQty: 0 }],
      }),
    );
    expect(await state()).toEqual({ totalQty: 0, avgCost: '1000.0000', qty: { A: 0 } });
  });

  it('rejects duplicate keys and negative counts', async () => {
    const run = (lines: { subWarehouseId: string; productId: string; countedQty: number }[]) =>
      withTransaction((tx) => inventory.adjust(tx, ctxFor(), { docDate, lines }));
    await expect(
      run([
        { subWarehouseId: subA, productId, countedQty: 1 },
        { subWarehouseId: subA, productId, countedQty: 2 },
      ]),
    ).rejects.toThrow(/Duplicate/);
    await expect(run([{ subWarehouseId: subA, productId, countedQty: -1 }])).rejects.toThrow(
      RangeError,
    );
  });
});

describe('inventory queries', () => {
  it('getAvailable: qty per key in input order, 0 for missing and foreign rows', async () => {
    await purchase([
      { sub: subA, qty: 4, total: 4_000 },
      { sub: subB, qty: 1, total: 1_000 },
    ]);
    const foreign = await makeWarehouse(prisma);
    const keys = [
      { subWarehouseId: subB, productId },
      { subWarehouseId: foreign.subWarehouses[0]!.id, productId },
      { subWarehouseId: subA, productId },
    ];
    const rows = await inventory.getAvailable(prisma, ctxFor('STAFF'), keys);
    expect(rows.map((r) => r.qty)).toEqual([1, 0, 4]);
    expect(await inventory.getAvailable(prisma, ctxFor(), [])).toEqual([]);
  });

  it('getProductTotals: cost only for report.sales.cost holders (rule 6)', async () => {
    const fresh = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
    await purchase([{ qty: 3, total: 1_000 }]);

    expect(await inventory.getProductTotals(prisma, ctxFor('OWNER'), [productId, fresh])).toEqual([
      { productId, totalQty: 3, avgCost: '333.3333' },
      { productId: fresh, totalQty: 0, avgCost: '0.0000' },
    ]);
    expect(await inventory.getProductTotals(prisma, ctxFor('STAFF'), [productId, fresh])).toEqual([
      { productId, totalQty: 3 },
      { productId: fresh, totalQty: 0 },
    ]);
  });
});
