// T-304: warehouses and sub-warehouses against a real Postgres. Each test
// builds its own store (the fixture warehouse has one sub-warehouse "Shelf");
// stock is put in place through inventory.receive / issue, like postings do.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  inventory,
  lockWarehouses,
  type ServiceContext,
  subWarehouses,
  warehouses,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
let productId: string;
const docDate = new Date('2026-10-01T09:00:00Z');

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-warehouses',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
  productId = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const auditRows = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

function receive(tx: Parameters<typeof inventory.receive>[0], subWarehouseId: string, qty = 5) {
  return inventory.receive(tx, staff, {
    type: 'PURCHASE',
    docDate,
    lines: [{ subWarehouseId, productId, qty, unitCost: '1000.0000', costAmount: qty * 1000 }],
  });
}

/** A purchase posting as T-405 will do it: resolve, lock warehouses (step 2), re-check, receive. */
function postPurchase(subWarehouseId: string, qty = 5) {
  return withTransaction(async (tx) => {
    const before = await warehouses.resolveActive(tx, staff, [subWarehouseId]);
    await lockWarehouses(tx, staff.storeId, [...before.values()]);
    await warehouses.resolveActive(tx, staff, [subWarehouseId]);
    return receive(tx, subWarehouseId, qty);
  });
}

function sell(subWarehouseId: string, qty: number) {
  return withTransaction((tx) =>
    inventory.issue(tx, staff, {
      type: 'SALE',
      docDate,
      lines: [{ subWarehouseId, productId, qty }],
    }),
  );
}

describe('warehouses and sub-warehouses', () => {
  it('STAFF builds a two-level tree with trimmed names and audit rows', async () => {
    const warehouse = await warehouses.create(staff, { name: '  Asosiy ombor ' });
    const shelf = await subWarehouses.create(staff, {
      warehouseId: warehouse.id,
      name: ' Javon A ',
    });

    expect(warehouse).toMatchObject({
      name: 'Asosiy ombor',
      archived: false,
      hasStock: false,
      subWarehouses: [],
    });
    expect(shelf).toMatchObject({
      warehouseId: warehouse.id,
      name: 'Javon A',
      archived: false,
      hasStock: false,
    });
    expect(await auditRows(warehouse.id)).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'warehouse',
        userId: f.staff.id,
        storeId: f.store.id,
        after: { name: 'Asosiy ombor' },
      }),
    ]);
    expect(await auditRows(shelf.id)).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'sub_warehouse',
        after: { warehouseId: warehouse.id, name: 'Javon A' },
      }),
    ]);

    const list = await warehouses.list(owner);
    expect(list.find((w) => w.id === warehouse.id)?.subWarehouses).toEqual([shelf]);
  });

  it('T-304: a third level cannot be created — a sub-warehouse is not a parent', async () => {
    await expect(
      subWarehouses.create(owner, { warehouseId: f.subWarehouse.id, name: 'Quti' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'warehouse' } });
    // Another store's warehouse is NOT_FOUND too.
    const foreign = await makeWarehouse(prisma);
    await expect(
      subWarehouses.create(owner, { warehouseId: foreign.id, name: 'Quti' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'warehouse' } });
    expect(await prisma.subWarehouse.count({ where: { name: 'Quti' } })).toBe(0);
  });

  it('T-304: warehouse names are unique per store, case-insensitively, archived ones too', async () => {
    const a = await warehouses.create(owner, { name: 'Ombor 1' });
    await expect(warehouses.create(staff, { name: 'OMBOR 1' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { entity: 'warehouse', field: 'name', archived: false },
    });

    await warehouses.archive(owner, { id: a.id });
    await expect(warehouses.create(owner, { name: 'ombor 1' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { archived: true },
    });

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    await expect(warehouses.create(otherCtx, { name: 'Ombor 1' })).resolves.toMatchObject({
      name: 'Ombor 1',
    });
  });

  it('T-304: sub-warehouse names are unique per warehouse only', async () => {
    const second = await warehouses.create(owner, { name: 'Ikkinchi' });

    await expect(
      subWarehouses.create(owner, { warehouseId: f.warehouse.id, name: 'shelf' }),
    ).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { entity: 'sub_warehouse', field: 'name', archived: false },
    });
    // The same name in another warehouse is fine.
    await expect(
      subWarehouses.create(owner, { warehouseId: second.id, name: 'Shelf' }),
    ).resolves.toMatchObject({ name: 'Shelf', warehouseId: second.id });
  });

  it('two concurrent creates of one name: one wins, the other gets DUPLICATE_VALUE', async () => {
    const results = await Promise.allSettled([
      warehouses.create(owner, { name: 'Parallel' }),
      warehouses.create(staff, { name: 'Parallel' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DUPLICATE_VALUE });
  });

  it('renames both levels with before/after audit; unchanged names write nothing', async () => {
    const other = await subWarehouses.create(owner, { warehouseId: f.warehouse.id, name: 'B' });

    const renamed = await warehouses.rename(staff, { id: f.warehouse.id, name: 'Markaziy' });
    expect(renamed).toMatchObject({ name: 'Markaziy', subWarehouses: expect.any(Array) });
    await warehouses.rename(staff, { id: f.warehouse.id, name: 'Markaziy' });
    expect(await auditRows(f.warehouse.id)).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        before: { name: f.warehouse.name },
        after: { name: 'Markaziy' },
      }),
    ]);

    await expect(
      subWarehouses.rename(owner, { id: other.id, name: 'SHELF' }),
    ).rejects.toMatchObject({ code: ErrorCode.DUPLICATE_VALUE });
    await expect(
      subWarehouses.rename(owner, { id: other.id, name: 'Muzlatgich' }),
    ).resolves.toMatchObject({ name: 'Muzlatgich' });
    expect((await auditRows(other.id)).map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
  });

  it('FR-2.2: a sub-warehouse with stock → ENTITY_NOT_EMPTY; once emptied it archives', async () => {
    await postPurchase(f.subWarehouse.id, 5);

    expect((await warehouses.list(owner))[0]?.subWarehouses[0]).toMatchObject({ hasStock: true });
    await expect(subWarehouses.archive(staff, { id: f.subWarehouse.id })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_NOT_EMPTY,
      params: { entity: 'sub_warehouse', name: 'Shelf' },
    });

    // A zero stock_balance row stays behind after the sale — still empty.
    await sell(f.subWarehouse.id, 5);
    const archived = await subWarehouses.archive(staff, { id: f.subWarehouse.id });
    await subWarehouses.archive(staff, { id: f.subWarehouse.id });
    expect(archived).toMatchObject({ archived: true, hasStock: false });
    expect((await auditRows(f.subWarehouse.id)).map((r) => r.action)).toEqual(['ARCHIVE']);
  });

  it('T-304: an archived sub-warehouse is not offered for documents and is rejected there', async () => {
    const fridge = await subWarehouses.create(owner, {
      warehouseId: f.warehouse.id,
      name: 'Muzlatgich',
    });
    await subWarehouses.archive(owner, { id: f.subWarehouse.id });

    expect(await warehouses.options(staff)).toEqual([
      {
        id: f.warehouse.id,
        name: f.warehouse.name,
        subWarehouses: [{ id: fridge.id, name: 'Muzlatgich' }],
      },
    ]);
    await expect(
      warehouses.resolveActive(prisma, staff, [fridge.id, f.subWarehouse.id]),
    ).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'sub_warehouse', name: 'Shelf' },
    });
    await expect(postPurchase(f.subWarehouse.id)).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
    });
    expect(await warehouses.resolveActive(prisma, staff, [fridge.id])).toEqual(
      new Map([[fridge.id, f.warehouse.id]]),
    );
    // The page still lists it, flagged.
    expect((await warehouses.list(owner))[0]?.subWarehouses.map((s) => s.archived)).toEqual([
      false,
      true,
    ]);

    await subWarehouses.restore(staff, { id: f.subWarehouse.id });
    expect((await warehouses.options(staff))[0]?.subWarehouses).toHaveLength(2);
    expect((await auditRows(f.subWarehouse.id)).map((r) => r.action)).toEqual([
      'ARCHIVE',
      'RESTORE',
    ]);
  });

  it('FR-2.2: a warehouse archives only when all its sub-warehouses are empty', async () => {
    const x = await makeWarehouse(prisma, {
      storeId: f.store.id,
      name: 'Ombor X',
      subWarehouses: ['A', 'B'],
    });
    const warehouseId = x.id;
    const [a, b] = x.subWarehouses as [(typeof x.subWarehouses)[0], (typeof x.subWarehouses)[0]];
    await postPurchase(b.id, 3);

    await expect(warehouses.archive(staff, { id: warehouseId })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_NOT_EMPTY,
      params: { entity: 'warehouse', name: 'Ombor X', subWarehouses: ['B'] },
    });

    await sell(b.id, 3);
    const archived = await warehouses.archive(staff, { id: warehouseId });
    expect(archived).toMatchObject({ archived: true, hasStock: false });
    // Sub-warehouses keep their own state but are no longer offered.
    expect(archived.subWarehouses.map((s) => s.archived)).toEqual([false, false]);
    expect((await warehouses.options(staff)).map((w) => w.id)).toEqual([f.warehouse.id]);
    await expect(warehouses.resolveActive(prisma, staff, [a.id])).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'warehouse', name: 'Ombor X' },
    });
    expect((await warehouses.list(owner, { archived: true })).map((w) => w.id)).toEqual([
      warehouseId,
    ]);
    expect((await warehouses.list(owner)).map((w) => w.id)).toEqual([f.warehouse.id]);

    // Nothing new under an archived warehouse; restore the warehouse first.
    await expect(subWarehouses.create(owner, { warehouseId, name: 'C' })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'warehouse' },
    });

    await warehouses.restore(owner, { id: warehouseId });
    await warehouses.restore(owner, { id: warehouseId });
    // Sorted by name: "Ombor X" < "Warehouse …".
    expect((await warehouses.options(staff)).map((w) => w.name)).toEqual([
      'Ombor X',
      f.warehouse.name,
    ]);
    expect((await auditRows(warehouseId)).map((r) => r.action)).toEqual(['ARCHIVE', 'RESTORE']);
  });

  it('a sub-warehouse cannot be restored while its warehouse is archived', async () => {
    await subWarehouses.archive(owner, { id: f.subWarehouse.id });
    await warehouses.archive(owner, { id: f.warehouse.id });

    await expect(subWarehouses.restore(owner, { id: f.subWarehouse.id })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'warehouse', name: f.warehouse.name },
    });
  });

  it('OQ-21: an open stock count blocks archiving the warehouse and its sub-warehouses', async () => {
    await prisma.stockCount.create({
      data: {
        storeId: f.store.id,
        warehouseId: f.warehouse.id,
        number: 'I-000001',
        docDate,
        createdById: f.owner.id,
      },
    });

    const expected = {
      code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT,
      params: { warehouseName: f.warehouse.name, stockCountNumber: 'I-000001' },
    };
    await expect(warehouses.archive(owner, { id: f.warehouse.id })).rejects.toMatchObject(expected);
    await expect(subWarehouses.archive(owner, { id: f.subWarehouse.id })).rejects.toMatchObject(
      expected,
    );

    await prisma.stockCount.updateMany({
      where: { warehouseId: f.warehouse.id },
      data: { status: 'CANCELLED' },
    });
    await expect(warehouses.archive(owner, { id: f.warehouse.id })).resolves.toMatchObject({
      archived: true,
    });
  });

  it('archive waits for an in-flight posting (step 2 lock) and then sees its stock', async () => {
    let locked!: () => void;
    let release!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));

    const posting = withTransaction(async (tx) => {
      await lockWarehouses(tx, staff.storeId, [f.warehouse.id]);
      locked();
      await gate;
      return receive(tx, f.subWarehouse.id, 2);
    });
    await lockTaken;

    let settled = false;
    const archiving = warehouses.archive(owner, { id: f.warehouse.id }).then(
      (item) => item,
      (error: unknown) => error,
    );
    void archiving.finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toBe(false);

    release();
    await posting;
    expect(await archiving).toMatchObject({ code: ErrorCode.ENTITY_NOT_EMPTY });
    expect(
      (await prisma.warehouse.findUniqueOrThrow({ where: { id: f.warehouse.id } })).archivedAt,
    ).toBeNull();
  });

  it('a posting that queues behind an archive sees it and is rejected', async () => {
    let locked!: () => void;
    let release!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));

    // An "archive" that holds the warehouse lock for a while.
    const archiving = withTransaction(async (tx) => {
      await lockWarehouses(tx, owner.storeId, [f.warehouse.id], { exclusive: true });
      locked();
      await gate;
      await tx.warehouse.update({
        where: { id: f.warehouse.id },
        data: { archivedAt: new Date() },
      });
    });
    await lockTaken;
    const posting = postPurchase(f.subWarehouse.id).then(
      () => null,
      (error: unknown) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await archiving;

    expect(await posting).toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'warehouse' },
    });
    expect(await prisma.stockBalance.count({ where: { subWarehouseId: f.subWarehouse.id } })).toBe(
      0,
    );
  });

  it('another store’s warehouse / sub-warehouse is NOT_FOUND and never listed', async () => {
    const foreign = await makeWarehouse(prisma);
    const sub = foreign.subWarehouses[0]!;

    await expect(warehouses.archive(owner, { id: foreign.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'warehouse' },
    });
    await expect(warehouses.rename(owner, { id: foreign.id, name: 'X' })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    await expect(subWarehouses.archive(owner, { id: sub.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'sub_warehouse' },
    });
    await expect(warehouses.resolveActive(prisma, owner, [sub.id])).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'sub_warehouse' },
    });
    expect((await warehouses.list(owner)).map((w) => w.id)).toEqual([f.warehouse.id]);
  });

  it('rejects invalid input with VALIDATION_FAILED and field errors', async () => {
    await expect(warehouses.create(owner, { name: ' ' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      fieldErrors: { name: expect.any(Array) },
    });
    await expect(
      subWarehouses.create(owner, { warehouseId: 'nope', name: 'A' }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      fieldErrors: { warehouseId: expect.any(Array) },
    });
    await expect(subWarehouses.archive(owner, { id: 'nope' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
  });
});
