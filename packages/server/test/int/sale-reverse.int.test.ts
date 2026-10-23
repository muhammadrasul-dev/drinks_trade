// T-503: reversing a posted sale (BR-3, business-logic §4.3) against a real
// Postgres. Each test builds its own store (one warehouse with one
// sub-warehouse, empty cashboxes); stock comes in through the inventory
// module and sales are posted through sales.post, so the cashboxes hold
// exactly what the sale brought in.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import type { SaleDraftInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cashCommands,
  debtCommands,
  inventory,
  sales,
  type ServiceContext,
  withTransaction,
} from '../../src/index';
import { day } from './helpers';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
/** 6 pieces per block, 12 000 so'm per piece (factory default). */
let productId: string;

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-sale-reverse',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
  productId = (await makeProduct(prisma, { organizationId: f.organization.id, unitsPerBlock: 6 }))
    .id;
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function receive(qty: number, unitCost = 5000) {
  return withTransaction((tx) =>
    inventory.receive(tx, owner, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        {
          subWarehouseId: f.subWarehouse.id,
          productId,
          qty,
          unitCost: `${unitCost}.0000`,
          costAmount: qty * unitCost,
        },
      ],
    }),
  );
}

/** 2 blocks (12 pieces) + 3 pieces = 15 × 12 000 = 180 000: cash, card and credit. */
function draft(patch: Partial<SaleDraftInput> = {}): SaleDraftInput {
  return {
    docDate: day(0),
    note: 'Mijoz Anvar',
    lines: [
      { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'BLOCK', inputQty: 2 },
      { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'PIECE', inputQty: 3 },
    ],
    paidCash: 100_000,
    paidCard: 50_000,
    paidCredit: 30_000,
    ...patch,
  };
}

/** One block (6 pieces × 12 000) paid in cash. */
const oneBlock = (patch: Partial<SaleDraftInput> = {}): SaleDraftInput =>
  draft({
    note: null,
    lines: [{ productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'BLOCK', inputQty: 1 }],
    paidCash: 72_000,
    paidCard: 0,
    paidCredit: 0,
    ...patch,
  });

async function createAndPost(input: SaleDraftInput) {
  const created = await sales.create(staff, input);
  return sales.post(staff, { id: created.id, version: created.version });
}

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

const costOf = () =>
  prisma.productCost.findUniqueOrThrow({
    where: { storeId_productId: { storeId: f.store.id, productId } },
  });

const stockOf = async () =>
  (
    await prisma.stockBalance.findUnique({
      where: { subWarehouseId_productId: { subWarehouseId: f.subWarehouse.id, productId } },
    })
  )?.qty ?? 0;

/** The reversal wrote nothing: still POSTED, no SALE_REVERSAL movement, refund or REVERSE row. */
async function expectNotReversed(saleId: string) {
  const row = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
  expect(row).toMatchObject({
    status: 'POSTED',
    version: 1,
    reversedAt: null,
    reverseReason: null,
  });
  expect(
    await prisma.stockMovement.count({ where: { saleLine: { saleId }, type: 'SALE_REVERSAL' } }),
  ).toBe(0);
  expect(await prisma.cashTransaction.count({ where: { saleId, type: 'SALE_REFUND' } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: saleId, action: 'REVERSE' } })).toBe(0);
}

describe('sales.reverse — happy path (BR-3, §4.3)', () => {
  it('cash + card + credit: goods back at the frozen cost, avg recalculated, cash refunded, debt cancelled, audit REVERSE', async () => {
    await receive(20, 5000); // avg 5 000
    const posted = await createAndPost(draft({ docDate: day(-2) }));
    // A later purchase moves the average: (5 × 5 000 + 10 × 8 000) / 15 = 7 000.
    await receive(10, 8000);
    expect((await costOf()).avgCost.toFixed(4)).toBe('7000.0000');
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(50_000n);
    const debt = await prisma.debt.findUniqueOrThrow({ where: { saleId: posted.id } });

    const reversed = await sales.reverse(owner, { id: posted.id, reason: '  Mijoz qaytardi  ' });
    expect(reversed).toMatchObject({
      status: 'REVERSED',
      version: 2,
      reverseReason: 'Mijoz qaytardi',
    });
    expect(reversed.reversedAt).toBeInstanceOf(Date);
    const row = await prisma.sale.findUniqueOrThrow({ where: { id: posted.id } });
    expect(row.reversedById).toBe(f.owner.id);
    // The frozen cost stays on the document (OQ-18: the reversal reads it).
    expect(row.costTotal).toBe(75_000n);

    // Stock: 15 pieces back; avg = (15 × 7 000 + 75 000) / 30 = 6 000 (OQ-18).
    expect(await stockOf()).toBe(30);
    const cost = await costOf();
    expect(cost.totalQty).toBe(30);
    expect(cost.avgCost.toFixed(4)).toBe('6000.0000');

    const movements = await prisma.stockMovement.findMany({
      where: { storeId: f.store.id, type: 'SALE_REVERSAL' },
      orderBy: { id: 'asc' },
      include: { saleLine: { select: { lineNo: true, saleId: true } } },
    });
    expect(
      movements.map((m) => ({
        qty: m.qtyDelta,
        unitCost: m.unitCost.toFixed(4),
        costAmount: m.costAmount,
        before: m.avgCostBefore.toFixed(4),
        after: m.avgCostAfter.toFixed(4),
        line: m.saleLine,
        docDate: m.docDate,
        createdById: m.createdById,
      })),
    ).toEqual([
      {
        qty: 12,
        unitCost: '5000.0000',
        costAmount: 60_000n,
        before: '7000.0000',
        after: '6000.0000',
        line: { lineNo: 1, saleId: posted.id },
        docDate: posted.docDate,
        createdById: f.owner.id,
      },
      {
        qty: 3,
        unitCost: '5000.0000',
        costAmount: 15_000n,
        before: '7000.0000',
        after: '6000.0000',
        line: { lineNo: 2, saleId: posted.id },
        docDate: posted.docDate,
        createdById: f.owner.id,
      },
    ]);

    // Cash: the paid parts go back OUT, dated like the document (OQ-01, OQ-26).
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(0n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
    const refunds = await prisma.cashTransaction.findMany({
      where: { saleId: posted.id, type: 'SALE_REFUND' },
      orderBy: { id: 'asc' },
    });
    expect(refunds.map((e) => [e.cashboxId, e.direction, e.amount, e.note])).toEqual([
      [f.cashboxes.cash.id, 'OUT', 100_000n, 'Mijoz qaytardi'],
      [f.cashboxes.card.id, 'OUT', 50_000n, 'Mijoz qaytardi'],
    ]);
    for (const entry of refunds) expect(entry.txDate).toEqual(posted.docDate);

    // Credit debt cancelled (OQ-04 path with no repayments).
    expect(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).toMatchObject({
      status: 'CANCELLED',
      repaidAmount: 0n,
    });
    expect(await prisma.auditLog.count({ where: { entityId: debt.id, action: 'CANCEL' } })).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: posted.id, action: 'REVERSE' },
    });
    expect(audit).toMatchObject({
      userId: f.owner.id,
      entityType: 'sale',
      before: { status: 'POSTED', version: 1 },
      after: {
        status: 'REVERSED',
        number: posted.number,
        reverseReason: 'Mijoz qaytardi',
        cancelledDebtId: debt.id,
        movements: [
          { lineNo: 1, qty: 12, unitCost: '5000.0000', avgCostAfter: '6000.0000' },
          { lineNo: 2, qty: 3, unitCost: '5000.0000', avgCostAfter: '6000.0000' },
        ],
      },
      meta: { reason: 'Mijoz qaytardi', backdated: true },
    });
    expect((audit.after as { cashTransactionIds: string[] }).cashTransactionIds).toEqual(
      refunds.map((e) => e.id.toString()),
    );
  });

  it('credit-only sale: no cash moves, the RECEIVABLE debt is cancelled', async () => {
    await receive(6);
    const posted = await createAndPost(
      oneBlock({ note: 'Nasiya', paidCash: 0, paidCredit: 72_000 }),
    );
    const debt = await prisma.debt.findUniqueOrThrow({ where: { saleId: posted.id } });
    expect(debt).toMatchObject({ direction: 'RECEIVABLE', status: 'OPEN' });

    await sales.reverse(owner, { id: posted.id, reason: 'Bekor' });
    expect(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).toMatchObject({
      status: 'CANCELLED',
    });
    expect(await prisma.cashTransaction.count({ where: { saleId: posted.id } })).toBe(0);
    expect(await stockOf()).toBe(6);
    // Back to the only receipt: avg 5 000 on 6 pieces.
    expect(await costOf()).toMatchObject({ totalQty: 6 });
    expect((await costOf()).avgCost.toFixed(4)).toBe('5000.0000');
  });
});

describe('sales.reverse — blocks (nothing is written)', () => {
  it('STAFF → FORBIDDEN (OQ-03)', async () => {
    await receive(6);
    const posted = await createAndPost(oneBlock());
    await expect(sales.reverse(staff, { id: posted.id, reason: 'Mine' })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    await expectNotReversed(posted.id);
  });

  it('BR-9: cash part above the CASH balance → CASHBOX_INSUFFICIENT { cashbox } without amounts', async () => {
    await receive(6);
    const posted = await createAndPost(oneBlock());
    await cashCommands.otherExpense(owner, {
      cashbox: 'CASH',
      amount: 10_000,
      note: 'Ijara',
      date: day(0),
    });

    const error = await sales
      .reverse(owner, { id: posted.id, reason: 'Late' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
      params: { cashbox: 'CASH' },
    });
    expect(JSON.stringify((error as { params: unknown }).params)).not.toMatch(/\d{3}/);
    await expectNotReversed(posted.id);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(62_000n);
    expect(await stockOf()).toBe(0);
  });

  it('BR-9: card part short → CASHBOX_INSUFFICIENT (CARD); the credit debt stays open', async () => {
    await receive(6);
    const posted = await createAndPost(
      oneBlock({ note: 'Anvar', paidCash: 0, paidCard: 40_000, paidCredit: 32_000 }),
    );
    await cashCommands.transfer(owner, {
      from: 'CARD',
      to: 'CASH',
      amount: 1,
      note: null,
      date: day(0),
    });

    await expect(sales.reverse(owner, { id: posted.id, reason: 'Late' })).rejects.toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
      params: { cashbox: 'CARD' },
    });
    await expectNotReversed(posted.id);
    const debt = await prisma.debt.findUniqueOrThrow({ where: { saleId: posted.id } });
    expect(debt.status).toBe('OPEN');
    expect(await prisma.auditLog.count({ where: { entityId: debt.id, action: 'CANCEL' } })).toBe(0);
  });

  it('OQ-04: a credit debt with repayments → DEBT_HAS_REPAYMENTS; the debt stays as it is', async () => {
    await receive(15);
    const posted = await createAndPost(draft());
    const debt = await prisma.debt.findUniqueOrThrow({ where: { saleId: posted.id } });
    await debtCommands.repay(owner, {
      debtId: debt.id,
      cashbox: 'CASH',
      amount: 10_000,
      date: day(0),
    });

    await expect(sales.reverse(owner, { id: posted.id, reason: 'Wrong' })).rejects.toMatchObject({
      code: ErrorCode.DEBT_HAS_REPAYMENTS,
    });
    await expectNotReversed(posted.id);
    expect(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).toMatchObject({
      status: 'OPEN',
      repaidAmount: 10_000n,
    });
    expect(await stockOf()).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(110_000n);
  });

  it('BR-8: an open stock count blocks the reversal (WAREHOUSE_IN_STOCK_COUNT)', async () => {
    await receive(6);
    const posted = await createAndPost(oneBlock());
    await prisma.stockCount.create({
      data: {
        storeId: f.store.id,
        warehouseId: f.warehouse.id,
        number: 'I-000001',
        docDate: new Date(),
        createdById: f.owner.id,
      },
    });
    await expect(sales.reverse(owner, { id: posted.id, reason: 'Count' })).rejects.toMatchObject({
      code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT,
      params: { warehouseName: f.warehouse.name, stockCountNumber: 'I-000001' },
    });
    await expectNotReversed(posted.id);
  });

  it('OQ-31: goods do not come back into an archived sub-warehouse (ENTITY_ARCHIVED)', async () => {
    await receive(6);
    const posted = await createAndPost(oneBlock());
    // Empty after the sale, so FR-2.2 lets it be archived.
    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: new Date() },
    });
    await expect(sales.reverse(owner, { id: posted.id, reason: 'Archived' })).rejects.toMatchObject(
      {
        code: ErrorCode.ENTITY_ARCHIVED,
        params: { entity: 'sub_warehouse', name: f.subWarehouse.name },
      },
    );
    await expectNotReversed(posted.id);
    expect(await stockOf()).toBe(0);
  });

  it('a draft or a reversed sale → DOCUMENT_NOT_POSTED; another store → NOT_FOUND; blank reason → VALIDATION_FAILED', async () => {
    await receive(6);
    const created = await sales.create(owner, oneBlock());
    await expect(sales.reverse(owner, { id: created.id, reason: 'Draft' })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_POSTED,
    });

    await sales.post(owner, { id: created.id, version: 0 });
    await expect(sales.reverse(owner, { id: created.id, reason: '   ' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    await expect(
      sales.reverse(otherCtx, { id: created.id, reason: 'Elsewhere' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    await sales.reverse(owner, { id: created.id, reason: 'Once' });
    await expect(sales.reverse(owner, { id: created.id, reason: 'Twice' })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_POSTED,
    });
    expect(
      await prisma.cashTransaction.count({ where: { saleId: created.id, type: 'SALE_REFUND' } }),
    ).toBe(1);
    expect(await stockOf()).toBe(6);
  });
});

describe('sales.reverse — concurrency', () => {
  it('two concurrent reversals: exactly one wins, goods come back once', async () => {
    await receive(6);
    const posted = await createAndPost(oneBlock());
    const results = await Promise.allSettled([
      sales.reverse(owner, { id: posted.id, reason: 'A' }),
      sales.reverse(owner, { id: posted.id, reason: 'B' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_NOT_POSTED });
    expect(await stockOf()).toBe(6);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(0n);
    expect(await prisma.auditLog.count({ where: { entityId: posted.id, action: 'REVERSE' } })).toBe(
      1,
    );
  });

  it('a reversal and a posting that needs the returned goods run side by side without deadlock', async () => {
    await receive(6);
    const first = await createAndPost(oneBlock());
    const second = await sales.create(staff, oneBlock());

    const [reversal, posting] = await Promise.allSettled([
      sales.reverse(owner, { id: first.id, reason: 'Return' }),
      sales.post(staff, { id: second.id, version: 0 }),
    ]);
    expect(reversal.status).toBe('fulfilled');
    // The posting either waited for the returned goods or ran first and found none.
    if (posting.status === 'fulfilled') {
      expect(await stockOf()).toBe(0);
      expect(await balanceOf(f.cashboxes.cash.id)).toBe(72_000n);
    } else {
      expect(posting.reason).toMatchObject({ code: ErrorCode.INSUFFICIENT_STOCK });
      expect(await stockOf()).toBe(6);
      expect(await balanceOf(f.cashboxes.cash.id)).toBe(0n);
    }
    expect((await costOf()).totalQty).toBe(await stockOf());
  });
});
