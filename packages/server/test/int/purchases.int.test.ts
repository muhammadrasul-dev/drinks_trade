// T-404: purchase drafts against a real Postgres. Each test builds its own
// store (warehouse with one sub-warehouse, OWNER and STAFF users).
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import type { PurchaseDraftInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { purchases, type ServiceContext } from '../../src/index';
import { day } from './helpers';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
let productId: string;

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-purchases',
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

function draft(patch: Partial<PurchaseDraftInput> = {}): PurchaseDraftInput {
  return {
    docDate: day(0),
    note: ' Ulgurji ',
    lines: [
      // 3 blocks × 60 000 = 180 000 for 18 pieces → 10 000 per piece.
      {
        productId,
        subWarehouseId: f.subWarehouse.id,
        inputUnit: 'BLOCK',
        inputQty: 3,
        inputPrice: 60_000,
      },
      // 7 pieces × 9 500 = 66 500.
      {
        productId,
        subWarehouseId: f.subWarehouse.id,
        inputUnit: 'PIECE',
        inputQty: 7,
        inputPrice: 9_500,
      },
    ],
    paidCash: 100_000,
    paidCard: 0,
    paidCredit: 146_500,
    ...patch,
  };
}

const auditRows = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

describe('purchases.create', () => {
  it('FR-4.1: STAFF saves a draft — numbers, pieces, totals and unit cost are computed', async () => {
    const created = await purchases.create(staff, draft());

    expect(created).toMatchObject({
      number: 'P-000001',
      status: 'DRAFT',
      version: 0,
      note: 'Ulgurji',
      docDay: day(0),
      totalAmount: 246_500,
      paidCash: 100_000,
      paidCredit: 146_500,
      createdBy: { id: f.staff.id },
    });
    expect(created.lines).toMatchObject([
      { lineNo: 1, inputUnit: 'BLOCK', inputQty: 3, qty: 18, lineTotal: 180_000 },
      { lineNo: 2, inputUnit: 'PIECE', inputQty: 7, qty: 7, lineTotal: 66_500 },
    ]);
    expect(created.lines[0]?.unitCost).toBe('10000.0000');
    expect(created.lines[1]?.unitCost).toBe('9500.0000');
    expect((await purchases.create(owner, draft())).number).toBe('P-000002');

    const [row] = await auditRows(created.id);
    expect(row).toMatchObject({ action: 'CREATE', entityType: 'purchase', userId: f.staff.id });
    expect(row?.after).toMatchObject({ number: 'P-000001', totalAmount: 246_500 });
    expect(row?.meta).not.toHaveProperty('backdated');
  });

  it('§5.1: a draft touches neither stock, cost nor cash', async () => {
    await purchases.create(owner, draft());

    expect(await prisma.stockBalance.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.productCost.count()).toBe(0);
    expect(await prisma.cashTransaction.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
  });

  it('a draft may not add up yet: the payment split is checked at posting (BR-9)', async () => {
    const created = await purchases.create(owner, draft({ paidCash: 0, paidCredit: 0 }));
    expect(created).toMatchObject({ totalAmount: 246_500, paidCash: 0, paidCredit: 0 });
  });

  it('OQ-07: a future date throws DOC_DATE_IN_FUTURE; a past one is audited as backdated', async () => {
    await expect(purchases.create(owner, draft({ docDate: day(1) }))).rejects.toMatchObject({
      code: ErrorCode.DOC_DATE_IN_FUTURE,
    });
    expect(await prisma.purchase.count({ where: { storeId: f.store.id } })).toBe(0);

    const past = await purchases.create(owner, draft({ docDate: day(-3) }));
    expect(past.docDay).toBe(day(-3));
    const [row] = await auditRows(past.id);
    expect(row?.meta).toMatchObject({ backdated: true });
  });

  it('an archived product or sub-warehouse cannot be put on a draft (ENTITY_ARCHIVED)', async () => {
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
    await expect(purchases.create(owner, draft())).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'product' },
    });

    await prisma.product.update({ where: { id: productId }, data: { archivedAt: null } });
    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: new Date() },
    });
    await expect(purchases.create(owner, draft())).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'sub_warehouse' },
    });
  });

  it('another organization’s product or another store’s sub-warehouse is NOT_FOUND', async () => {
    const other = await makeStoreFixture(prisma);
    const foreignProduct = await makeProduct(prisma, { organizationId: other.organization.id });
    const line = draft().lines[0]!;

    await expect(
      purchases.create(owner, draft({ lines: [{ ...line, productId: foreignProduct.id }] })),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'product' } });
    await expect(
      purchases.create(
        owner,
        draft({ lines: [{ ...line, subWarehouseId: other.subWarehouse.id }] }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'sub_warehouse' } });
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    for (const bad of [
      draft({ lines: [] }),
      draft({ lines: [{ ...draft().lines[0]!, inputQty: 0 }] }),
      draft({ paidCash: -1 }),
      draft({ docDate: '2026-02-30' }),
    ]) {
      await expect(purchases.create(owner, bad)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
      });
    }
  });
});

describe('purchases.update', () => {
  it('OQ-14: STAFF edits the OWNER’s draft; lines are replaced, version goes up, audit has before/after', async () => {
    const created = await purchases.create(owner, draft());
    const updated = await purchases.update(staff, {
      id: created.id,
      version: created.version,
      ...draft({
        note: null,
        lines: [
          {
            productId,
            subWarehouseId: f.subWarehouse.id,
            inputUnit: 'BLOCK',
            inputQty: 1,
            inputPrice: 1_000,
          },
        ],
        paidCash: 1_000,
        paidCredit: 0,
      }),
    });

    expect(updated).toMatchObject({ number: created.number, version: 1, totalAmount: 1_000 });
    expect(updated.note).toBeNull();
    expect(updated.lines).toHaveLength(1);
    // 1 000 / 6 pieces, 4 decimals (business-logic §5.1).
    expect(updated.lines[0]).toMatchObject({ qty: 6, unitCost: '166.6667' });
    expect(await prisma.purchaseLine.count({ where: { purchaseId: created.id } })).toBe(1);

    const rows = await auditRows(created.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]).toMatchObject({
      userId: f.staff.id,
      before: { totalAmount: 246_500 },
      after: { totalAmount: 1_000 },
    });
  });

  it('keeps the stored date when the day is unchanged', async () => {
    const created = await purchases.create(owner, draft({ docDate: day(-1) }));
    const updated = await purchases.update(owner, {
      id: created.id,
      version: 0,
      ...draft({ docDate: day(-1) }),
    });
    expect(updated.docDate).toEqual(created.docDate);
  });

  it('a stale version throws DOCUMENT_CHANGED and changes nothing', async () => {
    const created = await purchases.create(owner, draft());
    await purchases.update(staff, { id: created.id, version: 0, ...draft({ paidCash: 1 }) });

    await expect(
      purchases.update(owner, { id: created.id, version: 0, ...draft({ paidCash: 2 }) }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });
    expect((await purchases.get(owner, { id: created.id })).paidCash).toBe(1);
  });

  it('two concurrent saves of one version: exactly one wins', async () => {
    const created = await purchases.create(owner, draft());
    const results = await Promise.allSettled([
      purchases.update(owner, { id: created.id, version: 0, ...draft({ paidCash: 1 }) }),
      purchases.update(staff, { id: created.id, version: 0, ...draft({ paidCash: 2 }) }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });
    expect((await purchases.get(owner, { id: created.id })).version).toBe(1);
  });

  it('a posted purchase is not a draft any more (DOCUMENT_NOT_DRAFT)', async () => {
    const created = await purchases.create(owner, draft());
    // Posting arrives with T-405; mark it directly.
    await prisma.purchase.update({
      where: { id: created.id },
      data: { status: 'POSTED', paidCash: 246_500n, paidCredit: 0n },
    });

    await expect(
      purchases.update(owner, { id: created.id, version: 0, ...draft() }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    await expect(purchases.remove(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_DRAFT,
    });
  });

  it('OQ-07: moving a draft to a future day throws DOC_DATE_IN_FUTURE', async () => {
    const created = await purchases.create(owner, draft());
    await expect(
      purchases.update(owner, { id: created.id, version: 0, ...draft({ docDate: day(1) }) }),
    ).rejects.toMatchObject({ code: ErrorCode.DOC_DATE_IN_FUTURE });
  });
});

describe('purchases.remove', () => {
  it('deletes the draft and its lines, audits DELETE; the number is not reused', async () => {
    const created = await purchases.create(staff, draft());
    await expect(purchases.remove(owner, { id: created.id, version: 1 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_CHANGED,
    });

    await purchases.remove(owner, { id: created.id, version: 0 });

    expect(await prisma.purchase.count({ where: { id: created.id } })).toBe(0);
    expect(await prisma.purchaseLine.count({ where: { purchaseId: created.id } })).toBe(0);
    const rows = await auditRows(created.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'DELETE']);
    expect(rows[1]?.before).toMatchObject({ number: 'P-000001' });
    expect((await purchases.create(owner, draft())).number).toBe('P-000002');
    await expect(purchases.get(owner, { id: created.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('purchases.list / get', () => {
  it('filters by status, date range and number; newest first; another store sees nothing', async () => {
    const old = await purchases.create(owner, draft({ docDate: day(-10) }));
    const recent = await purchases.create(owner, draft({ docDate: day(-1) }));
    const today = await purchases.create(owner, draft());
    await prisma.purchase.update({
      where: { id: today.id },
      data: { status: 'POSTED', paidCash: 246_500n, paidCredit: 0n },
    });

    const all = await purchases.list(staff);
    expect(all.items.map((p) => p.number)).toEqual([today.number, recent.number, old.number]);
    expect(all.items[0]).toMatchObject({ lineCount: 2, createdBy: { id: f.owner.id } });

    expect((await purchases.list(owner, { status: 'DRAFT' })).total).toBe(2);
    expect(
      (await purchases.list(owner, { from: day(-2), to: day(-1) })).items.map((p) => p.id),
    ).toEqual([recent.id]);
    expect((await purchases.list(owner, { q: '000001' })).items.map((p) => p.id)).toEqual([old.id]);

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    expect((await purchases.list(otherCtx)).total).toBe(0);
    await expect(purchases.get(otherCtx, { id: old.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
