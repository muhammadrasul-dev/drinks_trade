// SELECT … FOR UPDATE helpers, always taken in the fixed order of
// business-logic.md §2 to avoid deadlocks. Services lock rows only through
// these functions; each one sorts in SQL, so two transactions touching the
// same rows queue up instead of deadlocking.
import type { Prisma } from '@drinks/db';
import {
  type CashboxType,
  type DebtDirection,
  type DebtSource,
  type DebtStatus,
  type DocStatus,
  DomainError,
  ErrorCode,
  type StockCountStatus,
} from '@drinks/shared';

import { moneyToNumber } from './money';
import type { Tx } from './tx';

/** business-logic.md §2, in order. Skipping a step is fine; going back is not. */
export const LockStep = {
  DOCUMENT: 1,
  WAREHOUSE: 2,
  DOC_SEQUENCE: 3,
  CASHBOX: 4,
  DEBT: 5,
  PRODUCT_COST: 6,
  STOCK_BALANCE: 7,
} as const;
export type LockStep = (typeof LockStep)[keyof typeof LockStep];

const lastStep = new WeakMap<Tx, LockStep>();

/**
 * Throws if `step` is not after the last step taken in this transaction.
 * A step is taken once: pass every id of one kind in a single call, so the
 * SQL ORDER BY covers all of them.
 */
export function assertLockOrder(tx: Tx, step: LockStep): void {
  const previous = lastStep.get(tx);
  if (previous !== undefined && previous >= step) {
    throw new Error(
      `Lock order violation: step ${step} requested after step ${previous} (business-logic.md §2)`,
    );
  }
  lastStep.set(tx, step);
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** The single locked row, or NOT_FOUND when it is missing or in another store. */
function only<T>(rows: T[], entity: string): T {
  const row = rows[0];
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity });
  return row;
}

/** All requested rows, or NOT_FOUND when any is missing or in another store. */
function every<T>(rows: T[], expected: number, entity: string): T[] {
  if (rows.length !== expected) throw new DomainError(ErrorCode.NOT_FOUND, { entity });
  return rows;
}

// ── 1. Document row ──────────────────────────────────────────────────────

export interface LockedDocument<S extends string> {
  id: string;
  status: S;
  version: number;
}

export async function lockSale(
  tx: Tx,
  storeId: string,
  id: string,
): Promise<LockedDocument<DocStatus>> {
  assertLockOrder(tx, LockStep.DOCUMENT);
  const rows = await tx.$queryRaw<LockedDocument<DocStatus>[]>`
    SELECT id, status::text AS status, version FROM sale
    WHERE id = ${id}::uuid AND store_id = ${storeId}::uuid
    FOR UPDATE`;
  return only(rows, 'sale');
}

export async function lockPurchase(
  tx: Tx,
  storeId: string,
  id: string,
): Promise<LockedDocument<DocStatus>> {
  assertLockOrder(tx, LockStep.DOCUMENT);
  const rows = await tx.$queryRaw<LockedDocument<DocStatus>[]>`
    SELECT id, status::text AS status, version FROM purchase
    WHERE id = ${id}::uuid AND store_id = ${storeId}::uuid
    FOR UPDATE`;
  return only(rows, 'purchase');
}

export async function lockStockCount(
  tx: Tx,
  storeId: string,
  id: string,
): Promise<LockedDocument<StockCountStatus> & { warehouseId: string }> {
  assertLockOrder(tx, LockStep.DOCUMENT);
  const rows = await tx.$queryRaw<(LockedDocument<StockCountStatus> & { warehouseId: string })[]>`
    SELECT id, status::text AS status, version, warehouse_id AS "warehouseId" FROM stock_count
    WHERE id = ${id}::uuid AND store_id = ${storeId}::uuid
    FOR UPDATE`;
  return only(rows, 'stock_count');
}

// ── 2. Warehouses ────────────────────────────────────────────────────────

export interface LockedWarehouse {
  id: string;
  archivedAt: Date | null;
}

/**
 * FOR SHARE by default (sale/purchase posting only needs the warehouse to
 * stay put); `exclusive: true` → FOR UPDATE, used by stock counts (BR-8).
 */
export async function lockWarehouses(
  tx: Tx,
  storeId: string,
  ids: readonly string[],
  { exclusive = false }: { exclusive?: boolean } = {},
): Promise<LockedWarehouse[]> {
  assertLockOrder(tx, LockStep.WAREHOUSE);
  const wanted = unique(ids);
  if (wanted.length === 0) return [];
  const rows = exclusive
    ? await tx.$queryRaw<LockedWarehouse[]>`
        SELECT id, archived_at AS "archivedAt" FROM warehouse
        WHERE id = ANY(${wanted}::uuid[]) AND store_id = ${storeId}::uuid
        ORDER BY id FOR UPDATE`
    : await tx.$queryRaw<LockedWarehouse[]>`
        SELECT id, archived_at AS "archivedAt" FROM warehouse
        WHERE id = ANY(${wanted}::uuid[]) AND store_id = ${storeId}::uuid
        ORDER BY id FOR SHARE`;
  return every(rows, wanted.length, 'warehouse');
}

// ── 3. doc_sequence → core/numbering.ts (nextDocNumber) ──────────────────

// ── 4. Cashboxes ─────────────────────────────────────────────────────────

export interface LockedCashbox {
  id: string;
  type: CashboxType;
  balance: number;
}

/** Ordered by type name: CARD before CASH. */
export async function lockCashboxes(
  tx: Tx,
  storeId: string,
  types: readonly CashboxType[],
): Promise<LockedCashbox[]> {
  assertLockOrder(tx, LockStep.CASHBOX);
  const wanted = unique(types);
  if (wanted.length === 0) return [];
  const rows = await tx.$queryRaw<{ id: string; type: CashboxType; balance: bigint }[]>`
    SELECT id, type::text AS type, balance FROM cashbox
    WHERE store_id = ${storeId}::uuid AND type::text = ANY(${wanted}::text[])
    ORDER BY type::text FOR UPDATE`;
  return every(rows, wanted.length, 'cashbox').map((row) => ({
    ...row,
    balance: moneyToNumber(row.balance),
  }));
}

// ── 5. Debt ──────────────────────────────────────────────────────────────

export interface LockedDebt {
  id: string;
  direction: DebtDirection;
  source: DebtSource;
  status: DebtStatus;
  amount: number;
  repaidAmount: number;
}

export async function lockDebt(tx: Tx, storeId: string, id: string): Promise<LockedDebt> {
  assertLockOrder(tx, LockStep.DEBT);
  const rows = await tx.$queryRaw<
    {
      id: string;
      direction: DebtDirection;
      source: DebtSource;
      status: DebtStatus;
      amount: bigint;
      repaidAmount: bigint;
    }[]
  >`
    SELECT id, direction::text AS direction, source::text AS source, status::text AS status,
           amount, repaid_amount AS "repaidAmount"
    FROM debt
    WHERE id = ${id}::uuid AND store_id = ${storeId}::uuid
    FOR UPDATE`;
  const row = only(rows, 'debt');
  return {
    ...row,
    amount: moneyToNumber(row.amount),
    repaidAmount: moneyToNumber(row.repaidAmount),
  };
}

// ── 6. product_cost ──────────────────────────────────────────────────────

export interface LockedProductCost {
  productId: string;
  totalQty: number;
  avgCost: Prisma.Decimal;
}

/**
 * Locks the store's cost rows of `productIds`, ordered by product_id. Missing
 * rows are first created empty (total_qty 0, avg_cost 0 — the BR-6 "Q = 0"
 * state), so callers always get one locked row per product.
 */
export async function lockProductCosts(
  tx: Tx,
  storeId: string,
  productIds: readonly string[],
): Promise<LockedProductCost[]> {
  assertLockOrder(tx, LockStep.PRODUCT_COST);
  const wanted = unique(productIds);
  if (wanted.length === 0) return [];
  await tx.$executeRaw`
    INSERT INTO product_cost (store_id, product_id, total_qty, avg_cost, updated_at)
    SELECT ${storeId}::uuid, p.id, 0, 0, now()
    FROM unnest(${wanted}::uuid[]) AS p(id)
    ORDER BY p.id
    ON CONFLICT (store_id, product_id) DO NOTHING`;
  return tx.$queryRaw<LockedProductCost[]>`
    SELECT product_id AS "productId", total_qty AS "totalQty", avg_cost AS "avgCost"
    FROM product_cost
    WHERE store_id = ${storeId}::uuid AND product_id = ANY(${wanted}::uuid[])
    ORDER BY product_id FOR UPDATE`;
}

// ── 7. stock_balance ─────────────────────────────────────────────────────

export interface StockKey {
  subWarehouseId: string;
  productId: string;
}

export interface LockedStockBalance extends StockKey {
  qty: number;
}

/**
 * Locks balances ordered by (sub_warehouse_id, product_id); missing rows are
 * first created with qty 0, like lockProductCosts.
 */
export async function lockStockBalances(
  tx: Tx,
  keys: readonly StockKey[],
): Promise<LockedStockBalance[]> {
  assertLockOrder(tx, LockStep.STOCK_BALANCE);
  const wanted = [
    ...new Map(keys.map((key) => [`${key.subWarehouseId}:${key.productId}`, key])).values(),
  ];
  if (wanted.length === 0) return [];
  const subWarehouseIds = wanted.map((key) => key.subWarehouseId);
  const productIds = wanted.map((key) => key.productId);
  await tx.$executeRaw`
    INSERT INTO stock_balance (sub_warehouse_id, product_id, qty, updated_at)
    SELECT k.sub_warehouse_id, k.product_id, 0, now()
    FROM unnest(${subWarehouseIds}::uuid[], ${productIds}::uuid[]) AS k(sub_warehouse_id, product_id)
    ORDER BY k.sub_warehouse_id, k.product_id
    ON CONFLICT (sub_warehouse_id, product_id) DO NOTHING`;
  return tx.$queryRaw<LockedStockBalance[]>`
    SELECT b.sub_warehouse_id AS "subWarehouseId", b.product_id AS "productId", b.qty
    FROM stock_balance b
    JOIN unnest(${subWarehouseIds}::uuid[], ${productIds}::uuid[]) AS k(sub_warehouse_id, product_id)
      ON b.sub_warehouse_id = k.sub_warehouse_id AND b.product_id = k.product_id
    ORDER BY b.sub_warehouse_id, b.product_id
    FOR UPDATE OF b`;
}
