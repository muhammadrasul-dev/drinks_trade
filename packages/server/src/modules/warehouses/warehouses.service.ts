// Warehouses and sub-warehouses (T-304, FR-2.1–2.2): a store-level tree of
// exactly two levels — goods always sit in a sub-warehouse, a sub-warehouse
// always belongs to a warehouse and has no children. Nothing is deleted
// (database.md §1 rule 5): a node is archived, and only when it holds no
// stock (ENTITY_NOT_EMPTY).
//
// Locking (business-logic.md §2, §9c): archiving takes the warehouse row
// FOR UPDATE (step 2) before reading stock. Every posting/reversal takes the
// same row FOR SHARE (step 2) before it touches stock_balance (step 7) and
// rejects an archived warehouse/sub-warehouse after that lock, so no stock
// can arrive between the emptiness check and the archive.
import {
  DomainError,
  ErrorCode,
  type SubWarehouseItem,
  type WarehouseItem,
  type WarehouseOption,
  parseInput,
} from '@drinks/shared';
import {
  type SubWarehouseCreateInput,
  subWarehouseCreateInputSchema,
  type WarehouseCreateInput,
  warehouseCreateInputSchema,
  type WarehouseIdInput,
  warehouseIdInputSchema,
  type WarehouseRenameInput,
  warehouseRenameInputSchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { lockWarehouses } from '../../core/locks';
import { assertCan } from '../../core/rbac';
import { type Tx, withTransaction } from '../../core/tx';
import { audit } from '../audit';
import { inventory } from '../inventory';

type Entity = 'warehouse' | 'sub_warehouse';

export interface WarehouseListOptions {
  /** false (default): active warehouses; true: archived ones. Sub-warehouses are always all included. */
  archived?: boolean;
}

const SUB_SELECT = { id: true, warehouseId: true, name: true, archivedAt: true } as const;

const WAREHOUSE_SELECT = {
  id: true,
  name: true,
  archivedAt: true,
  subWarehouses: { select: SUB_SELECT, orderBy: { name: 'asc' } },
} as const;

interface SubRow {
  id: string;
  warehouseId: string;
  name: string;
  archivedAt: Date | null;
}

interface WarehouseRow {
  id: string;
  name: string;
  archivedAt: Date | null;
  subWarehouses: SubRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function toSubItem(row: SubRow, stocked: ReadonlySet<string>): SubWarehouseItem {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    name: row.name,
    archived: row.archivedAt !== null,
    hasStock: stocked.has(row.id),
  };
}

function toItem(row: WarehouseRow, stocked: ReadonlySet<string>): WarehouseItem {
  const subWarehouses = row.subWarehouses.map((sub) => toSubItem(sub, stocked));
  return {
    id: row.id,
    name: row.name,
    archived: row.archivedAt !== null,
    hasStock: subWarehouses.some((sub) => sub.hasStock),
    subWarehouses,
  };
}

/** Unique-constraint violation (P2002) — a concurrent create/rename won the same name. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/** Runs a write; a unique violation from a concurrent request → DUPLICATE_VALUE. */
async function write<T>(entity: Entity, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(fn);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(ErrorCode.DUPLICATE_VALUE, { entity, field: 'name' });
    }
    throw error;
  }
}

function duplicate(entity: Entity, clash: { archivedAt: Date | null } | null): void {
  if (clash) {
    throw new DomainError(ErrorCode.DUPLICATE_VALUE, {
      entity,
      field: 'name',
      archived: clash.archivedAt !== null,
    });
  }
}

/**
 * Warehouse names are unique per store, sub-warehouse names per warehouse —
 * case-insensitively and including archived rows (like categories, T-302),
 * so `params.archived` can suggest restoring the existing one.
 */
async function assertWarehouseNameFree(
  tx: Tx,
  ctx: ServiceContext,
  name: string,
  exceptId?: string,
): Promise<void> {
  const clash = await tx.warehouse.findFirst({
    where: {
      storeId: ctx.storeId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { archivedAt: true },
  });
  duplicate('warehouse', clash);
}

async function assertSubNameFree(
  tx: Tx,
  warehouseId: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const clash = await tx.subWarehouse.findFirst({
    where: {
      warehouseId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { archivedAt: true },
  });
  duplicate('sub_warehouse', clash);
}

async function findWarehouse(tx: Tx, ctx: ServiceContext, id: string): Promise<WarehouseRow> {
  const row = await tx.warehouse.findFirst({
    where: { id, storeId: ctx.storeId },
    select: WAREHOUSE_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'warehouse' });
  return row;
}

async function findSub(tx: Tx, ctx: ServiceContext, id: string): Promise<SubRow> {
  const row = await tx.subWarehouse.findFirst({
    where: { id, warehouse: { storeId: ctx.storeId } },
    select: SUB_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'sub_warehouse' });
  return row;
}

/** The warehouse with the stock flags of its sub-warehouses. */
async function loadItem(tx: Tx, ctx: ServiceContext, id: string): Promise<WarehouseItem> {
  const row = await findWarehouse(tx, ctx, id);
  const stocked = await inventory.getStockedSubWarehouses(
    tx,
    ctx,
    row.subWarehouses.map((sub) => sub.id),
  );
  return toItem(row, stocked);
}

async function loadSubItem(tx: Tx, ctx: ServiceContext, id: string): Promise<SubWarehouseItem> {
  const row = await findSub(tx, ctx, id);
  return toSubItem(row, await inventory.getStockedSubWarehouses(tx, ctx, [id]));
}

/**
 * BR-8 (business-logic §3): an open (DRAFT) stock count in any of the
 * warehouses blocks posting and reversals there, and (OQ-21) archiving the
 * warehouse or its sub-warehouses — the count may still add stock there.
 * Callers hold the warehouse lock (§2 step 2), so a count opened later waits.
 */
async function assertNoOpenStockCount(
  tx: Tx,
  ctx: ServiceContext,
  warehouseIds: string | readonly string[],
): Promise<void> {
  const ids = typeof warehouseIds === 'string' ? [warehouseIds] : [...new Set(warehouseIds)];
  if (ids.length === 0) return;
  const open = await tx.stockCount.findFirst({
    where: { storeId: ctx.storeId, warehouseId: { in: ids }, status: 'DRAFT' },
    select: { number: true, warehouse: { select: { name: true } } },
    orderBy: { number: 'asc' },
  });
  if (open) {
    throw new DomainError(ErrorCode.WAREHOUSE_IN_STOCK_COUNT, {
      warehouseName: open.warehouse.name,
      stockCountNumber: open.number,
    });
  }
}

// ── Warehouses ───────────────────────────────────────────────────────────

/** Archive / restore of a warehouse: the row is locked FOR UPDATE first (§2 step 2). */
async function setWarehouseArchived(
  ctx: ServiceContext,
  input: WarehouseIdInput,
  archived: boolean,
): Promise<WarehouseItem> {
  assertCan(ctx.user, 'warehouse.write');
  const { id } = parseInput(warehouseIdInputSchema, input);
  return withTransaction(async (tx) => {
    await lockWarehouses(tx, ctx.storeId, [id], { exclusive: true });
    const current = await findWarehouse(tx, ctx, id);
    if ((current.archivedAt !== null) === archived) return loadItem(tx, ctx, id);
    if (archived) {
      await assertNoOpenStockCount(tx, ctx, id);
      // Read under the lock: committed postings are visible, new ones wait for us.
      const stocked = await inventory.getStockedSubWarehouses(
        tx,
        ctx,
        current.subWarehouses.map((sub) => sub.id),
      );
      if (stocked.size > 0) {
        throw new DomainError(ErrorCode.ENTITY_NOT_EMPTY, {
          entity: 'warehouse',
          name: current.name,
          subWarehouses: current.subWarehouses
            .filter((sub) => stocked.has(sub.id))
            .map((sub) => sub.name),
        });
      }
    }
    const archivedAt = archived ? new Date() : null;
    await tx.warehouse.update({ where: { id }, data: { archivedAt } });
    await audit.log(tx, ctx, {
      action: archived ? 'ARCHIVE' : 'RESTORE',
      entityType: 'warehouse',
      entityId: id,
      before: { archivedAt: current.archivedAt },
      after: { archivedAt },
    });
    return loadItem(tx, ctx, id);
  });
}

export const warehouses = {
  assertNoOpenStockCount,

  /**
   * The warehouses page: warehouses sorted by name, each with all of its
   * sub-warehouses (archived ones flagged) and stock flags.
   */
  async list(ctx: ServiceContext, options: WarehouseListOptions = {}): Promise<WarehouseItem[]> {
    assertCan(ctx.user, 'warehouse.read');
    const { prisma } = await import('@drinks/db');
    const rows = await prisma.warehouse.findMany({
      where: { storeId: ctx.storeId, archivedAt: options.archived ? { not: null } : null },
      select: WAREHOUSE_SELECT,
      orderBy: { name: 'asc' },
    });
    const stocked = await inventory.getStockedSubWarehouses(
      prisma,
      ctx,
      rows.flatMap((row) => row.subWarehouses.map((sub) => sub.id)),
    );
    return rows.map((row) => toItem(row, stocked));
  },

  /**
   * For document forms (purchase, sale, stock count): active warehouses with
   * their active sub-warehouses; a warehouse without one is left out.
   */
  async options(ctx: ServiceContext): Promise<WarehouseOption[]> {
    assertCan(ctx.user, 'warehouse.read');
    const { prisma } = await import('@drinks/db');
    const rows = await prisma.warehouse.findMany({
      where: { storeId: ctx.storeId, archivedAt: null },
      select: {
        id: true,
        name: true,
        subWarehouses: {
          where: { archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.filter((row) => row.subWarehouses.length > 0);
  },

  /**
   * Server-side guard for document services (T-404+): every sub-warehouse
   * must belong to the store (else NOT_FOUND) and it and its warehouse must
   * be active (else ENTITY_ARCHIVED { entity, name }). Returns
   * sub-warehouse id → warehouse id — the ids to lock in §2 step 2. Posting
   * calls it again after that lock, so the archive state it sees is final.
   */
  async resolveActive(
    db: Tx,
    ctx: ServiceContext,
    subWarehouseIds: readonly string[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(subWarehouseIds)];
    if (wanted.length === 0) return new Map();
    const rows = await db.subWarehouse.findMany({
      where: { id: { in: wanted }, warehouse: { storeId: ctx.storeId } },
      select: {
        ...SUB_SELECT,
        warehouse: { select: { name: true, archivedAt: true } },
      },
    });
    if (rows.length !== wanted.length) {
      throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'sub_warehouse' });
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of wanted) {
      const row = byId.get(id)!;
      if (row.warehouse.archivedAt !== null) {
        throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
          entity: 'warehouse',
          name: row.warehouse.name,
        });
      }
      if (row.archivedAt !== null) {
        throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
          entity: 'sub_warehouse',
          name: row.name,
        });
      }
    }
    return new Map(rows.map((row) => [row.id, row.warehouseId]));
  },

  async create(ctx: ServiceContext, input: WarehouseCreateInput): Promise<WarehouseItem> {
    assertCan(ctx.user, 'warehouse.write');
    const { name } = parseInput(warehouseCreateInputSchema, input);
    return write('warehouse', async (tx) => {
      await assertWarehouseNameFree(tx, ctx, name);
      const row = await tx.warehouse.create({
        data: { storeId: ctx.storeId, name },
        select: WAREHOUSE_SELECT,
      });
      await audit.log(tx, ctx, {
        action: 'CREATE',
        entityType: 'warehouse',
        entityId: row.id,
        after: { name },
      });
      return toItem(row, new Set());
    });
  },

  /** Archived warehouses can be renamed too (e.g. before restoring). */
  async rename(ctx: ServiceContext, input: WarehouseRenameInput): Promise<WarehouseItem> {
    assertCan(ctx.user, 'warehouse.write');
    const { id, name } = parseInput(warehouseRenameInputSchema, input);
    return write('warehouse', async (tx) => {
      const current = await findWarehouse(tx, ctx, id);
      if (current.name !== name) {
        await assertWarehouseNameFree(tx, ctx, name, id);
        await tx.warehouse.update({ where: { id }, data: { name } });
        await audit.log(tx, ctx, {
          action: 'UPDATE',
          entityType: 'warehouse',
          entityId: id,
          before: { name: current.name },
          after: { name },
        });
      }
      return loadItem(tx, ctx, id);
    });
  },

  /**
   * FR-2.2: only when none of its sub-warehouses holds stock (ENTITY_NOT_EMPTY)
   * and no stock count is open (WAREHOUSE_IN_STOCK_COUNT, OQ-21). Its
   * sub-warehouses keep their own state and come back with it on restore;
   * meanwhile document forms do not offer them. No-op when already archived.
   */
  async archive(ctx: ServiceContext, input: WarehouseIdInput): Promise<WarehouseItem> {
    return setWarehouseArchived(ctx, input, true);
  },

  /** No-op when active. */
  async restore(ctx: ServiceContext, input: WarehouseIdInput): Promise<WarehouseItem> {
    return setWarehouseArchived(ctx, input, false);
  },
};

// ── Sub-warehouses ───────────────────────────────────────────────────────

async function setSubArchived(
  ctx: ServiceContext,
  input: WarehouseIdInput,
  archived: boolean,
): Promise<SubWarehouseItem> {
  assertCan(ctx.user, 'warehouse.write');
  const { id } = parseInput(warehouseIdInputSchema, input);
  return withTransaction(async (tx) => {
    // warehouse_id never changes, so it is safe to read before the lock.
    const { warehouseId } = await findSub(tx, ctx, id);
    const [warehouse] = await lockWarehouses(tx, ctx.storeId, [warehouseId], { exclusive: true });
    const current = await findSub(tx, ctx, id);
    if ((current.archivedAt !== null) === archived) return loadSubItem(tx, ctx, id);
    if (archived) {
      await assertNoOpenStockCount(tx, ctx, warehouseId);
      const stocked = await inventory.getStockedSubWarehouses(tx, ctx, [id]);
      if (stocked.size > 0) {
        throw new DomainError(ErrorCode.ENTITY_NOT_EMPTY, {
          entity: 'sub_warehouse',
          name: current.name,
        });
      }
    } else if (warehouse!.archivedAt !== null) {
      // Restore the warehouse first.
      const { name } = await findWarehouse(tx, ctx, warehouseId);
      throw new DomainError(ErrorCode.ENTITY_ARCHIVED, { entity: 'warehouse', name });
    }
    const archivedAt = archived ? new Date() : null;
    await tx.subWarehouse.update({ where: { id }, data: { archivedAt } });
    await audit.log(tx, ctx, {
      action: archived ? 'ARCHIVE' : 'RESTORE',
      entityType: 'sub_warehouse',
      entityId: id,
      before: { archivedAt: current.archivedAt },
      after: { archivedAt },
    });
    return loadSubItem(tx, ctx, id);
  });
}

export const subWarehouses = {
  /**
   * `warehouseId` must be an active warehouse of the store. There is no
   * third level: a sub-warehouse id here is NOT_FOUND { entity: 'warehouse' }.
   */
  async create(ctx: ServiceContext, input: SubWarehouseCreateInput): Promise<SubWarehouseItem> {
    assertCan(ctx.user, 'warehouse.write');
    const { warehouseId, name } = parseInput(subWarehouseCreateInputSchema, input);
    return write('sub_warehouse', async (tx) => {
      // FOR SHARE: a concurrent archive of the parent waits, and vice versa.
      const [warehouse] = await lockWarehouses(tx, ctx.storeId, [warehouseId]);
      if (warehouse!.archivedAt !== null) {
        const { name: warehouseName } = await findWarehouse(tx, ctx, warehouseId);
        throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
          entity: 'warehouse',
          name: warehouseName,
        });
      }
      await assertSubNameFree(tx, warehouseId, name);
      const row = await tx.subWarehouse.create({
        data: { warehouseId, name },
        select: SUB_SELECT,
      });
      await audit.log(tx, ctx, {
        action: 'CREATE',
        entityType: 'sub_warehouse',
        entityId: row.id,
        after: { warehouseId, name },
      });
      return toSubItem(row, new Set());
    });
  },

  async rename(ctx: ServiceContext, input: WarehouseRenameInput): Promise<SubWarehouseItem> {
    assertCan(ctx.user, 'warehouse.write');
    const { id, name } = parseInput(warehouseRenameInputSchema, input);
    return write('sub_warehouse', async (tx) => {
      const current = await findSub(tx, ctx, id);
      if (current.name !== name) {
        await assertSubNameFree(tx, current.warehouseId, name, id);
        await tx.subWarehouse.update({ where: { id }, data: { name } });
        await audit.log(tx, ctx, {
          action: 'UPDATE',
          entityType: 'sub_warehouse',
          entityId: id,
          before: { name: current.name },
          after: { name },
        });
      }
      return loadSubItem(tx, ctx, id);
    });
  },

  /**
   * FR-2.2: only when every product qty here is 0 (ENTITY_NOT_EMPTY) and no
   * stock count is open in its warehouse (OQ-21). The parent warehouse row is
   * locked FOR UPDATE (§2 step 2). No-op when already archived.
   */
  async archive(ctx: ServiceContext, input: WarehouseIdInput): Promise<SubWarehouseItem> {
    return setSubArchived(ctx, input, true);
  },

  /** Refused (ENTITY_ARCHIVED) while its warehouse is archived. No-op when active. */
  async restore(ctx: ServiceContext, input: WarehouseIdInput): Promise<SubWarehouseItem> {
    return setSubArchived(ctx, input, false);
  },
};
