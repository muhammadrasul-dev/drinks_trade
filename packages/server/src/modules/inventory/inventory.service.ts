// Inventory core (T-401, business-logic §1.3, §4–§6, ADR-007): the single
// write path for stock_balance, product_cost and stock_movement. Internal
// service — document services (purchase, sale, stock count) check
// permissions, lock steps 1–5 of business-logic §2 and call one of
// receive / issue / adjust inside their own transaction. Those take steps 6–7
// (product_cost, stock_balance) themselves, so the caller must not lock them.
// No audit row here: stock_movement is itself the journal, and the calling
// document writes its POST / REVERSE audit row.
import {
  avgOnPurchaseReversal,
  avgOnReceipt,
  can,
  type CostString,
  costAmount,
  DomainError,
  ErrorCode,
  MovementType,
} from '@drinks/shared';

import type { ServiceContext } from '../../core/context';
import {
  type LockedProductCost,
  type LockedStockBalance,
  lockProductCosts,
  lockStockBalances,
  type StockKey,
} from '../../core/locks';
import { decimalToString, moneyToBigInt } from '../../core/money';
import type { Tx } from '../../core/tx';

// ── Inputs and results ───────────────────────────────────────────────────

interface MovementLink {
  saleLineId?: string;
  purchaseLineId?: string;
  stockCountId?: string;
}

/** A line whose cost is fixed by its document (purchase line, posted sale line). */
export interface CostedLine extends StockKey, Omit<MovementLink, 'stockCountId'> {
  /** Pieces, > 0. */
  qty: number;
  /** Cost per piece, `Decimal(20,4)` string. */
  unitCost: CostString;
  /** Line cost in whole so'm, ≥ 0: purchase `lineTotal` or sale `costAmount`. */
  costAmount: number;
}

export interface ReceiveInput {
  /** PURCHASE (§5.2) or SALE_REVERSAL (§4.3). */
  type: typeof MovementType.PURCHASE | typeof MovementType.SALE_REVERSAL;
  /** The document's doc_date (reports); movements are ordered by created_at (BR-6). */
  docDate: Date;
  lines: CostedLine[];
}

export interface SaleIssueLine extends StockKey, Pick<MovementLink, 'saleLineId'> {
  /** Pieces, > 0. */
  qty: number;
  /** sale_line.line_no, echoed in INSUFFICIENT_STOCK. */
  lineNo?: number;
}

export type IssueInput =
  /** §4.2: goods leave at the current average; the average stays. */
  | { type: typeof MovementType.SALE; docDate: Date; lines: SaleIssueLine[] }
  /** §5.3: goods go back at the purchase cost; the average is recalculated (OQ-09). */
  | { type: typeof MovementType.PURCHASE_REVERSAL; docDate: Date; lines: CostedLine[] };

export interface CountLine extends StockKey {
  /** What was counted, pieces, ≥ 0. Each (sub-warehouse, product) at most once. */
  countedQty: number;
}

export interface AdjustInput {
  /** The stock count's doc_date. */
  docDate: Date;
  stockCountId?: string;
  lines: CountLine[];
}

/** One stock_movement row as written (signed like the row). */
export interface Movement extends StockKey {
  id: bigint;
  /** + in, − out. */
  qtyDelta: number;
  unitCost: CostString;
  /** Signed like qtyDelta, whole so'm. */
  costAmount: number;
  avgCostBefore: CostString;
  avgCostAfter: CostString;
}

export interface CountedLine extends StockKey {
  /** stock_balance.qty under the lock, before the adjustment. */
  systemQty: number;
  countedQty: number;
  /** countedQty − systemQty. */
  qtyDelta: number;
  /** null when qtyDelta is 0. */
  movement: Movement | null;
}

/** Per-product totals of a count: one stock_count_result row (§6.2 step 5). */
export interface CountedProduct {
  productId: string;
  systemQty: number;
  countedQty: number;
  qtyDelta: number;
  avgCost: CostString;
  /** roundHalfUp(qtyDelta × avgCost): − shortage, + surplus. */
  amount: number;
}

export interface AdjustResult {
  /** In input order. */
  lines: CountedLine[];
  /** Ordered by product id. */
  products: CountedProduct[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

const keyOf = (key: StockKey): string => `${key.subWarehouseId}:${key.productId}`;

function assertLines(lines: readonly unknown[]): void {
  if (lines.length === 0) throw new RangeError('Inventory call needs at least one line');
}

function assertQty(value: number, what: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${what} must be a safe integer ≥ ${min}, got ${value}`);
  }
}

function assertCostedLines(lines: readonly CostedLine[]): void {
  assertLines(lines);
  for (const line of lines) {
    assertQty(line.qty, 'qty', 1);
    assertQty(line.costAmount, 'costAmount', 0);
    // Validates the cost string (RangeError on garbage or > 4 decimals).
    costAmount(line.qty, line.unitCost);
  }
}

/** Σ of `pick(line)` per key, keys in first-seen order. */
function sumBy<L>(lines: readonly L[], keyFn: (line: L) => string, pick: (line: L) => number) {
  const sums = new Map<string, number>();
  for (const line of lines) {
    const key = keyFn(line);
    sums.set(key, (sums.get(key) ?? 0) + pick(line));
  }
  return sums;
}

/**
 * Sub-warehouses must belong to the caller's store and products to its
 * organization; anything else is NOT_FOUND, like the lock helpers.
 */
async function assertInStore(tx: Tx, ctx: ServiceContext, keys: readonly StockKey[]) {
  const subWarehouseIds = [...new Set(keys.map((key) => key.subWarehouseId))];
  const productIds = [...new Set(keys.map((key) => key.productId))];
  const [subWarehouses, products] = await Promise.all([
    tx.subWarehouse.count({
      where: { id: { in: subWarehouseIds }, warehouse: { storeId: ctx.storeId } },
    }),
    tx.product.count({
      where: { id: { in: productIds }, organizationId: ctx.organizationId },
    }),
  ]);
  if (subWarehouses !== subWarehouseIds.length) {
    throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'sub_warehouse' });
  }
  if (products !== productIds.length) {
    throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'product' });
  }
}

interface Locked {
  costs: Map<string, LockedProductCost>;
  balances: Map<string, LockedStockBalance>;
}

/** Lock steps 6 and 7 for every key (rows are created empty when missing). */
async function lockAll(tx: Tx, ctx: ServiceContext, keys: readonly StockKey[]): Promise<Locked> {
  await assertInStore(tx, ctx, keys);
  const costs = await lockProductCosts(
    tx,
    ctx.storeId,
    keys.map((key) => key.productId),
  );
  const balances = await lockStockBalances(tx, keys);
  return {
    costs: new Map(costs.map((row) => [row.productId, row])),
    balances: new Map(balances.map((row) => [keyOf(row), row])),
  };
}

const avgOf = (locked: Locked, productId: string): CostString =>
  decimalToString(locked.costs.get(productId)!.avgCost);
const totalQtyOf = (locked: Locked, productId: string): number =>
  locked.costs.get(productId)!.totalQty;
const balanceOf = (locked: Locked, key: StockKey): number => locked.balances.get(keyOf(key))!.qty;

/** Writes the new qty of every touched balance and product_cost row. */
async function saveTotals(
  tx: Tx,
  ctx: ServiceContext,
  balanceDeltas: ReadonlyMap<string, number>,
  locked: Locked,
  productUpdates: ReadonlyMap<string, { qtyDelta: number; avgCost: CostString }>,
): Promise<void> {
  for (const [key, delta] of balanceDeltas) {
    if (delta === 0) continue;
    const row = locked.balances.get(key)!;
    await tx.stockBalance.update({
      where: {
        subWarehouseId_productId: { subWarehouseId: row.subWarehouseId, productId: row.productId },
      },
      data: { qty: row.qty + delta },
    });
  }
  for (const [productId, { qtyDelta, avgCost }] of productUpdates) {
    await tx.productCost.update({
      where: { storeId_productId: { storeId: ctx.storeId, productId } },
      data: { totalQty: totalQtyOf(locked, productId) + qtyDelta, avgCost },
    });
  }
}

interface MovementData extends StockKey, MovementLink {
  qtyDelta: number;
  unitCost: CostString;
  costAmount: number;
  avgCostBefore: CostString;
  avgCostAfter: CostString;
}

async function insertMovement(
  tx: Tx,
  ctx: ServiceContext,
  type: MovementType,
  docDate: Date,
  data: MovementData,
): Promise<Movement> {
  const { id } = await tx.stockMovement.create({
    data: {
      storeId: ctx.storeId,
      productId: data.productId,
      subWarehouseId: data.subWarehouseId,
      type,
      qtyDelta: data.qtyDelta,
      unitCost: data.unitCost,
      costAmount: moneyToBigInt(data.costAmount),
      avgCostBefore: data.avgCostBefore,
      avgCostAfter: data.avgCostAfter,
      docDate,
      saleLineId: data.saleLineId ?? null,
      purchaseLineId: data.purchaseLineId ?? null,
      stockCountId: data.stockCountId ?? null,
      createdById: ctx.user.id,
    },
    select: { id: true },
  });
  return {
    id,
    subWarehouseId: data.subWarehouseId,
    productId: data.productId,
    qtyDelta: data.qtyDelta,
    unitCost: data.unitCost,
    costAmount: data.costAmount,
    avgCostBefore: data.avgCostBefore,
    avgCostAfter: data.avgCostAfter,
  };
}

// ── Writes ───────────────────────────────────────────────────────────────

/**
 * Goods come in (purchase posting §5.2, sale reversal §4.3). Lines are grouped
 * by product: `newAvg = avgOnReceipt(Q, avg, Σ qty, Σ costAmount)` — one
 * recalculation per product, so every line of a product carries the same
 * avgCostBefore / avgCostAfter. Returns one movement per line, in input order.
 */
export async function receive(
  tx: Tx,
  ctx: ServiceContext,
  input: ReceiveInput,
): Promise<Movement[]> {
  assertCostedLines(input.lines);
  const locked = await lockAll(tx, ctx, input.lines);

  const inQty = sumBy(
    input.lines,
    (l) => l.productId,
    (l) => l.qty,
  );
  const inCost = sumBy(
    input.lines,
    (l) => l.productId,
    (l) => l.costAmount,
  );
  const products = new Map<string, { qtyDelta: number; avgCost: CostString; before: CostString }>();
  for (const [productId, qty] of inQty) {
    const before = avgOf(locked, productId);
    const avgCost = avgOnReceipt({
      totalQty: totalQtyOf(locked, productId),
      avgCost: before,
      inQty: qty,
      inCost: inCost.get(productId)!,
    });
    products.set(productId, { qtyDelta: qty, avgCost, before });
  }

  await saveTotals(
    tx,
    ctx,
    sumBy(input.lines, keyOf, (l) => l.qty),
    locked,
    products,
  );
  const movements: Movement[] = [];
  for (const line of input.lines) {
    const product = products.get(line.productId)!;
    movements.push(
      await insertMovement(tx, ctx, input.type, input.docDate, {
        ...line,
        qtyDelta: line.qty,
        avgCostBefore: product.before,
        avgCostAfter: product.avgCost,
      }),
    );
  }
  return movements;
}

/**
 * Goods go out (sale posting §4.2, purchase reversal §5.3). Every
 * (sub-warehouse, product) must hold Σ qty of its lines, otherwise
 * INSUFFICIENT_STOCK (BR-7) or PURCHASE_REVERSAL_INSUFFICIENT_STOCK (BR-3) —
 * quantities are not secret, so STAFF sees them too. The caller's
 * transaction must roll back on either error.
 *
 * SALE: each line costs `costAmount(qty, avg)` at the current average, which
 * stays. PURCHASE_REVERSAL: lines leave at their own cost and the average is
 * recalculated per product with avgOnPurchaseReversal (OQ-09).
 * Returns one movement per line, in input order; for a sale,
 * `-movement.costAmount` / `movement.unitCost` go to sale_line.
 */
export async function issue(tx: Tx, ctx: ServiceContext, input: IssueInput): Promise<Movement[]> {
  if (input.type === MovementType.SALE) {
    assertLines(input.lines);
    for (const line of input.lines) assertQty(line.qty, 'qty', 1);
  } else {
    assertCostedLines(input.lines);
  }
  const lines: readonly (SaleIssueLine | CostedLine)[] = input.lines;
  const locked = await lockAll(tx, ctx, lines);

  const outByKey = sumBy(lines, keyOf, (l) => l.qty);
  const short = lines.filter((line) => balanceOf(locked, line) < outByKey.get(keyOf(line))!);
  if (short.length > 0) await throwShortage(tx, input.type, short, locked, outByKey);

  const outQty = sumBy(
    lines,
    (l) => l.productId,
    (l) => l.qty,
  );
  const outCost =
    input.type === MovementType.SALE
      ? null
      : sumBy(
          input.lines,
          (l) => l.productId,
          (l) => l.costAmount,
        );
  const products = new Map<string, { qtyDelta: number; avgCost: CostString; before: CostString }>();
  for (const [productId, qty] of outQty) {
    const before = avgOf(locked, productId);
    const avgCost =
      outCost === null
        ? before
        : avgOnPurchaseReversal({
            totalQty: totalQtyOf(locked, productId),
            avgCost: before,
            outQty: qty,
            outCost: outCost.get(productId)!,
          });
    products.set(productId, { qtyDelta: -qty, avgCost, before });
  }

  await saveTotals(
    tx,
    ctx,
    sumBy(lines, keyOf, (l) => -l.qty),
    locked,
    products,
  );
  const movements: Movement[] = [];
  for (const line of lines) {
    const product = products.get(line.productId)!;
    const cost =
      'unitCost' in line
        ? { unitCost: line.unitCost, costAmount: line.costAmount }
        : { unitCost: product.before, costAmount: costAmount(line.qty, product.before) };
    movements.push(
      await insertMovement(tx, ctx, input.type, input.docDate, {
        subWarehouseId: line.subWarehouseId,
        productId: line.productId,
        saleLineId: line.saleLineId,
        purchaseLineId: 'purchaseLineId' in line ? line.purchaseLineId : undefined,
        qtyDelta: -line.qty,
        unitCost: cost.unitCost,
        costAmount: -cost.costAmount,
        avgCostBefore: product.before,
        avgCostAfter: product.avgCost,
      }),
    );
  }
  return movements;
}

async function throwShortage(
  tx: Tx,
  type: IssueInput['type'],
  short: readonly (SaleIssueLine | CostedLine)[],
  locked: Locked,
  outByKey: ReadonlyMap<string, number>,
): Promise<never> {
  const productNames = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: short.map((line) => line.productId) } },
        select: { id: true, name: true },
      })
    ).map((p) => [p.id, p.name]),
  );
  if (type === MovementType.SALE) {
    throw new DomainError(ErrorCode.INSUFFICIENT_STOCK, {
      lines: short.map((line) => ({
        lineNo: 'lineNo' in line ? line.lineNo : undefined,
        productId: line.productId,
        product: productNames.get(line.productId),
        subWarehouseId: line.subWarehouseId,
        available: balanceOf(locked, line),
        required: outByKey.get(keyOf(line)),
      })),
    });
  }
  // §5.3 reports one (sub-warehouse, product): the first short one in lock order.
  const [first] = [...short].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  const subWarehouse = await tx.subWarehouse.findUniqueOrThrow({
    where: { id: first!.subWarehouseId },
    select: { name: true },
  });
  throw new DomainError(ErrorCode.PURCHASE_REVERSAL_INSUFFICIENT_STOCK, {
    productId: first!.productId,
    product: productNames.get(first!.productId),
    subWarehouseId: first!.subWarehouseId,
    subWarehouse: subWarehouse.name,
    available: balanceOf(locked, first!),
    required: outByKey.get(keyOf(first!)),
  });
}

/**
 * Stock count posting (§6.2 steps 3–5): sets each (sub-warehouse, product) to
 * its counted qty. A line that differs writes a COUNT_ADJUSTMENT movement at
 * the current average (`costAmount(delta, avg)`); product_cost.total_qty
 * moves by the per-product Σ delta and the average stays. Lines that match
 * write nothing (OQ-13: uncounted rows are simply not passed).
 */
export async function adjust(
  tx: Tx,
  ctx: ServiceContext,
  input: AdjustInput,
): Promise<AdjustResult> {
  assertLines(input.lines);
  const seen = new Set<string>();
  for (const line of input.lines) {
    assertQty(line.countedQty, 'countedQty', 0);
    if (seen.has(keyOf(line))) throw new RangeError(`Duplicate count line ${keyOf(line)}`);
    seen.add(keyOf(line));
  }
  const locked = await lockAll(tx, ctx, input.lines);

  const counted = input.lines.map((line) => {
    const systemQty = balanceOf(locked, line);
    return { ...line, systemQty, qtyDelta: line.countedQty - systemQty };
  });
  const products: CountedProduct[] = [...locked.costs.keys()].sort().map((productId) => {
    const own = counted.filter((line) => line.productId === productId);
    const qtyDelta = own.reduce((sum, line) => sum + line.qtyDelta, 0);
    const avgCost = avgOf(locked, productId);
    return {
      productId,
      systemQty: own.reduce((sum, line) => sum + line.systemQty, 0),
      countedQty: own.reduce((sum, line) => sum + line.countedQty, 0),
      qtyDelta,
      avgCost,
      amount: costAmount(qtyDelta, avgCost),
    };
  });

  await saveTotals(
    tx,
    ctx,
    new Map(counted.map((line) => [keyOf(line), line.qtyDelta])),
    locked,
    new Map(
      products
        .filter((p) => p.qtyDelta !== 0)
        .map((p) => [p.productId, { qtyDelta: p.qtyDelta, avgCost: p.avgCost }]),
    ),
  );
  const lines: CountedLine[] = [];
  for (const line of counted) {
    const avgCost = avgOf(locked, line.productId);
    const movement =
      line.qtyDelta === 0
        ? null
        : await insertMovement(tx, ctx, MovementType.COUNT_ADJUSTMENT, input.docDate, {
            subWarehouseId: line.subWarehouseId,
            productId: line.productId,
            stockCountId: input.stockCountId,
            qtyDelta: line.qtyDelta,
            unitCost: avgCost,
            costAmount: costAmount(line.qtyDelta, avgCost),
            avgCostBefore: avgCost,
            avgCostAfter: avgCost,
          });
    lines.push({
      subWarehouseId: line.subWarehouseId,
      productId: line.productId,
      systemQty: line.systemQty,
      countedQty: line.countedQty,
      qtyDelta: line.qtyDelta,
      movement,
    });
  }
  return { lines, products };
}

// ── Queries (no locks) ───────────────────────────────────────────────────

/**
 * Current qty per (sub-warehouse, product), in input order; missing rows and
 * sub-warehouses of other stores read as 0. For the draft warning (FR-3.3)
 * and the stock count form — posting re-checks under the lock.
 */
export async function getAvailable(
  db: Tx,
  ctx: ServiceContext,
  keys: readonly StockKey[],
): Promise<(StockKey & { qty: number })[]> {
  if (keys.length === 0) return [];
  const rows = await db.stockBalance.findMany({
    where: {
      OR: keys.map(({ subWarehouseId, productId }) => ({ subWarehouseId, productId })),
      subWarehouse: { warehouse: { storeId: ctx.storeId } },
    },
    select: { subWarehouseId: true, productId: true, qty: true },
  });
  const qtyByKey = new Map(rows.map((row) => [keyOf(row), row.qty]));
  return keys.map(({ subWarehouseId, productId }) => ({
    subWarehouseId,
    productId,
    qty: qtyByKey.get(keyOf({ subWarehouseId, productId })) ?? 0,
  }));
}

export interface ProductTotals {
  productId: string;
  /** Pieces across the store's warehouses. */
  totalQty: number;
  /** Weighted average cost; omitted unless the user may see cost (rule 6). */
  avgCost?: CostString;
}

/**
 * Store-wide qty (and, for `report.sales.cost` holders, the average cost) per
 * product, in input order; a product never received reads as 0 / "0.0000".
 */
export async function getProductTotals(
  db: Tx,
  ctx: ServiceContext,
  productIds: readonly string[],
): Promise<ProductTotals[]> {
  if (productIds.length === 0) return [];
  const rows = await db.productCost.findMany({
    where: { storeId: ctx.storeId, productId: { in: [...new Set(productIds)] } },
    select: { productId: true, totalQty: true, avgCost: true },
  });
  const byId = new Map(rows.map((row) => [row.productId, row]));
  const showCost = can(ctx.user.role, 'report.sales.cost');
  return productIds.map((productId) => {
    const row = byId.get(productId);
    const totals: ProductTotals = { productId, totalQty: row?.totalQty ?? 0 };
    if (showCost) totals.avgCost = row ? decimalToString(row.avgCost) : '0.0000';
    return totals;
  });
}
