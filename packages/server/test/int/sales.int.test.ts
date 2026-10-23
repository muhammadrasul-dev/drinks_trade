// T-501: sale drafts against a real Postgres. Each test builds its own store
// (warehouse with one sub-warehouse, OWNER and STAFF users); stock comes in
// through the inventory module, the only writer of the stock tables.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeSubWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode, storeToday } from '@drinks/shared';
import type { SaleDraftInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inventory, sales, type ServiceContext, withTransaction } from '../../src/index';

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
    requestId: 'req-sales',
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

/** `YYYY-MM-DD` `days` days from today in the store zone. */
function day(days: number): string {
  const [y, m, d] = storeToday().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

function receive(qty: number, subWarehouseId = f.subWarehouse.id, id = productId) {
  return withTransaction((tx) =>
    inventory.receive(tx, owner, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        { subWarehouseId, productId: id, qty, unitCost: '5000.0000', costAmount: qty * 5000 },
      ],
    }),
  );
}

function draft(patch: Partial<SaleDraftInput> = {}): SaleDraftInput {
  return {
    docDate: day(0),
    note: ' Mijoz ',
    lines: [
      // 2 blocks = 12 pieces × 12 000 = 144 000.
      { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'BLOCK', inputQty: 2 },
      // 3 pieces × 12 000 = 36 000.
      { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'PIECE', inputQty: 3 },
    ],
    paidCash: 100_000,
    paidCard: 50_000,
    paidCredit: 30_000,
    ...patch,
  };
}

const auditRows = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

describe('sales.create', () => {
  it('FR-3.1: STAFF saves a draft — number, pieces, copied per-piece price and totals', async () => {
    await receive(20);
    const created = await sales.create(staff, draft());

    expect(created).toMatchObject({
      number: 'S-000001',
      status: 'DRAFT',
      version: 0,
      note: 'Mijoz',
      docDay: day(0),
      totalAmount: 180_000,
      paidCash: 100_000,
      paidCard: 50_000,
      paidCredit: 30_000,
      createdBy: { id: f.staff.id },
      stockShort: false,
    });
    expect(created.lines).toMatchObject([
      {
        lineNo: 1,
        inputUnit: 'BLOCK',
        inputQty: 2,
        qty: 12,
        unitPrice: 12_000,
        lineTotal: 144_000,
        available: 20,
        stockShort: false,
      },
      {
        lineNo: 2,
        inputUnit: 'PIECE',
        inputQty: 3,
        qty: 3,
        unitPrice: 12_000,
        lineTotal: 36_000,
        available: 20,
        stockShort: false,
      },
    ]);
    // CLAUDE.md rule 6: no cost fields in the DTO.
    expect(created.lines[0]).not.toHaveProperty('unitCost');
    expect(created).not.toHaveProperty('costTotal');
    expect((await sales.create(owner, draft())).number).toBe('S-000002');

    const [row] = await auditRows(created.id);
    expect(row).toMatchObject({ action: 'CREATE', entityType: 'sale', userId: f.staff.id });
    expect(row?.after).toMatchObject({
      number: 'S-000001',
      totalAmount: 180_000,
      lines: [{ qty: 12, unitPrice: 12_000 }, { qty: 3 }],
    });
    expect(row?.meta).not.toHaveProperty('backdated');
  });

  it('§4.1: a draft touches neither stock, cost nor cash; its cost columns stay empty', async () => {
    await receive(20);
    const created = await sales.create(owner, draft());

    const own = { subWarehouseId: f.subWarehouse.id };
    expect(await prisma.stockBalance.findMany({ where: own, select: { qty: true } })).toEqual([
      { qty: 20 },
    ]);
    expect(await prisma.stockMovement.count({ where: own })).toBe(1);
    expect(await prisma.cashTransaction.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
    const stored = await prisma.sale.findUniqueOrThrow({
      where: { id: created.id },
      select: { costTotal: true, lines: { select: { unitCost: true, costAmount: true } } },
    });
    expect(stored.costTotal).toBeNull();
    expect(stored.lines.every((l) => l.unitCost === null && l.costAmount === null)).toBe(true);
  });

  it('FR-3.3: a short draft is saved; lines of one pair add up and are all flagged', async () => {
    // 12 + 3 = 15 pieces needed, 14 in stock: each line alone would fit.
    await receive(14);
    const short = await sales.create(staff, draft());

    expect(short.stockShort).toBe(true);
    expect(short.lines.map((l) => [l.available, l.stockShort])).toEqual([
      [14, true],
      [14, true],
    ]);
    expect(await prisma.sale.count({ where: { id: short.id } })).toBe(1);

    // Another sub-warehouse's stock does not count for this one.
    const other = await makeSubWarehouse(prisma, { warehouseId: f.warehouse.id });
    await receive(100, other.id);
    const elsewhere = await sales.create(
      owner,
      draft({
        lines: [
          { productId, subWarehouseId: other.id, inputUnit: 'PIECE', inputQty: 100 },
          { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'PIECE', inputQty: 15 },
        ],
      }),
    );
    expect(elsewhere.lines.map((l) => [l.available, l.stockShort])).toEqual([
      [100, false],
      [14, true],
    ]);

    // Once stock arrives, the same saved draft reads as fine.
    await receive(1);
    expect((await sales.get(owner, { id: short.id })).stockShort).toBe(false);
  });

  it('a product without any stock reads 0 available and short', async () => {
    const created = await sales.create(owner, draft());
    expect(created.lines.map((l) => [l.available, l.stockShort])).toEqual([
      [0, true],
      [0, true],
    ]);
  });

  it('a draft may not add up yet: the payment split is checked at posting (BR-9)', async () => {
    const created = await sales.create(owner, draft({ paidCash: 0, paidCard: 0, paidCredit: 0 }));
    expect(created).toMatchObject({ totalAmount: 180_000, paidCash: 0, paidCredit: 0 });
  });

  it('OQ-07: a future date throws DOC_DATE_IN_FUTURE; a past one is audited as backdated', async () => {
    await expect(sales.create(owner, draft({ docDate: day(1) }))).rejects.toMatchObject({
      code: ErrorCode.DOC_DATE_IN_FUTURE,
    });
    expect(await prisma.sale.count({ where: { storeId: f.store.id } })).toBe(0);

    const past = await sales.create(owner, draft({ docDate: day(-3) }));
    expect(past.docDay).toBe(day(-3));
    const [row] = await auditRows(past.id);
    expect(row?.meta).toMatchObject({ backdated: true });
  });

  it('an archived product or sub-warehouse cannot be put on a draft (ENTITY_ARCHIVED)', async () => {
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
    await expect(sales.create(owner, draft())).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'product' },
    });

    await prisma.product.update({ where: { id: productId }, data: { archivedAt: null } });
    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: new Date() },
    });
    await expect(sales.create(owner, draft())).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'sub_warehouse' },
    });
  });

  it('another organization’s product or another store’s sub-warehouse is NOT_FOUND', async () => {
    const other = await makeStoreFixture(prisma);
    const foreignProduct = await makeProduct(prisma, { organizationId: other.organization.id });
    const line = draft().lines[0]!;

    await expect(
      sales.create(owner, draft({ lines: [{ ...line, productId: foreignProduct.id }] })),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'product' } });
    await expect(
      sales.create(owner, draft({ lines: [{ ...line, subWarehouseId: other.subWarehouse.id }] })),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'sub_warehouse' } });
  });

  it('rejects invalid input and an overflowing total with VALIDATION_FAILED', async () => {
    const huge = await makeProduct(prisma, {
      organizationId: f.organization.id,
      unitsPerBlock: 10_000,
      salePrice: 100_000_000_000n,
    });
    for (const bad of [
      draft({ lines: [] }),
      draft({ lines: [{ ...draft().lines[0]!, inputQty: 0 }] }),
      draft({ paidCash: -1 }),
      draft({ docDate: '2026-02-30' }),
      draft({
        lines: [
          {
            productId: huge.id,
            subWarehouseId: f.subWarehouse.id,
            inputUnit: 'BLOCK',
            inputQty: 10,
          },
        ],
      }),
    ]) {
      await expect(sales.create(owner, bad)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
      });
    }
    expect(await prisma.sale.count({ where: { storeId: f.store.id } })).toBe(0);
  });
});

describe('sales.update', () => {
  it('OQ-14: STAFF edits the OWNER’s draft; lines replaced, the current price copied, audit before/after', async () => {
    await receive(20);
    const created = await sales.create(owner, draft());
    await prisma.product.update({ where: { id: productId }, data: { salePrice: 13_000n } });

    const updated = await sales.update(staff, {
      id: created.id,
      version: created.version,
      ...draft({
        note: null,
        lines: [{ productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'BLOCK', inputQty: 1 }],
        paidCash: 78_000,
        paidCard: 0,
        paidCredit: 0,
      }),
    });

    expect(updated).toMatchObject({ number: created.number, version: 1, totalAmount: 78_000 });
    expect(updated.note).toBeNull();
    expect(updated.lines).toMatchObject([
      { qty: 6, unitPrice: 13_000, lineTotal: 78_000, available: 20 },
    ]);
    expect(await prisma.saleLine.count({ where: { saleId: created.id } })).toBe(1);

    const rows = await auditRows(created.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]).toMatchObject({
      userId: f.staff.id,
      before: { totalAmount: 180_000 },
      after: { totalAmount: 78_000, lines: [{ unitPrice: 13_000 }] },
    });
  });

  it('keeps the stored date when the day is unchanged', async () => {
    const created = await sales.create(owner, draft({ docDate: day(-1) }));
    const updated = await sales.update(owner, {
      id: created.id,
      version: 0,
      ...draft({ docDate: day(-1) }),
    });
    expect(updated.docDate).toEqual(created.docDate);
  });

  it('a stale version throws DOCUMENT_CHANGED and changes nothing', async () => {
    const created = await sales.create(owner, draft());
    await sales.update(staff, { id: created.id, version: 0, ...draft({ paidCash: 1 }) });

    await expect(
      sales.update(owner, { id: created.id, version: 0, ...draft({ paidCash: 2 }) }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });
    expect((await sales.get(owner, { id: created.id })).paidCash).toBe(1);
  });

  it('two concurrent saves of one version: exactly one wins', async () => {
    const created = await sales.create(owner, draft());
    const results = await Promise.allSettled([
      sales.update(owner, { id: created.id, version: 0, ...draft({ paidCash: 1 }) }),
      sales.update(staff, { id: created.id, version: 0, ...draft({ paidCash: 2 }) }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });
    expect((await sales.get(owner, { id: created.id })).version).toBe(1);
  });

  it('a posted sale is not a draft any more (DOCUMENT_NOT_DRAFT); its DTO has no stock warning', async () => {
    const created = await sales.create(owner, draft());
    // Posting arrives with T-502; mark it directly.
    await prisma.sale.update({
      where: { id: created.id },
      data: { status: 'POSTED', paidCash: 180_000n, paidCard: 0n, paidCredit: 0n },
    });

    await expect(
      sales.update(owner, { id: created.id, version: 0, ...draft() }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    await expect(sales.remove(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_DRAFT,
    });
    const posted = await sales.get(staff, { id: created.id });
    expect(posted.stockShort).toBe(false);
    expect(posted.lines.map((l) => [l.available, l.stockShort])).toEqual([
      [null, false],
      [null, false],
    ]);
  });

  it('OQ-07: moving a draft to a future day throws DOC_DATE_IN_FUTURE', async () => {
    const created = await sales.create(owner, draft());
    await expect(
      sales.update(owner, { id: created.id, version: 0, ...draft({ docDate: day(1) }) }),
    ).rejects.toMatchObject({ code: ErrorCode.DOC_DATE_IN_FUTURE });
    expect((await sales.get(owner, { id: created.id })).version).toBe(0);
  });
});

describe('sales.remove', () => {
  it('deletes the draft and its lines, audits DELETE; the number is not reused', async () => {
    const created = await sales.create(staff, draft());
    await expect(sales.remove(owner, { id: created.id, version: 1 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_CHANGED,
    });

    await sales.remove(owner, { id: created.id, version: 0 });

    expect(await prisma.sale.count({ where: { id: created.id } })).toBe(0);
    expect(await prisma.saleLine.count({ where: { saleId: created.id } })).toBe(0);
    const rows = await auditRows(created.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'DELETE']);
    expect(rows[1]?.before).toMatchObject({ number: 'S-000001' });
    expect((await sales.create(owner, draft())).number).toBe('S-000002');
    await expect(sales.get(owner, { id: created.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('sales.list / get', () => {
  it('filters by status, date range and number; newest first; another store sees nothing', async () => {
    const old = await sales.create(owner, draft({ docDate: day(-10) }));
    const recent = await sales.create(owner, draft({ docDate: day(-1) }));
    const today = await sales.create(owner, draft());
    await prisma.sale.update({
      where: { id: today.id },
      data: { status: 'POSTED', paidCash: 180_000n, paidCard: 0n, paidCredit: 0n },
    });

    const all = await sales.list(staff);
    expect(all.items.map((s) => s.number)).toEqual([today.number, recent.number, old.number]);
    expect(all.items[0]).toMatchObject({ lineCount: 2, createdBy: { id: f.owner.id } });

    expect((await sales.list(owner, { status: 'DRAFT' })).total).toBe(2);
    expect(
      (await sales.list(owner, { from: day(-2), to: day(-1) })).items.map((s) => s.id),
    ).toEqual([recent.id]);
    expect((await sales.list(owner, { q: '000001' })).items.map((s) => s.id)).toEqual([old.id]);

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    expect((await sales.list(otherCtx)).total).toBe(0);
    await expect(sales.get(otherCtx, { id: old.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('sales.availability / productOptions', () => {
  it('returns the current qty per pair in input order; another store’s sub-warehouse reads 0', async () => {
    await receive(9);
    const other = await makeStoreFixture(prisma);
    const keys = [
      { subWarehouseId: f.subWarehouse.id, productId },
      { subWarehouseId: other.subWarehouse.id, productId },
    ];
    expect(await sales.availability(staff, { keys })).toEqual([
      { ...keys[0], qty: 9 },
      { ...keys[1], qty: 0 },
    ]);
    await expect(
      sales.availability(staff, { keys: [{ subWarehouseId: 'x', productId }] }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('lists active products with their per-piece sale price', async () => {
    const archived = await makeProduct(prisma, {
      organizationId: f.organization.id,
      archivedAt: new Date(),
    });
    const options = await sales.productOptions(staff);
    expect(options).toEqual([expect.objectContaining({ id: productId, salePrice: 12_000 })]);
    expect(options.map((o) => o.id)).not.toContain(archived.id);
  });
});
