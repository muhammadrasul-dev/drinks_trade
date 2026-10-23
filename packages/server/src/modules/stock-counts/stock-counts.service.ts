// Stock counts (BR-8, FR-5.1–5.2, business-logic §3, §6): open, edit and
// cancel a count of one warehouse (T-601), post it (T-602). While a count is
// DRAFT its warehouse is blocked: sale/purchase posting and reversals there
// fail with WAREHOUSE_IN_STOCK_COUNT (warehouses.lockForPosting); drafts can
// still be saved. Opening and posting take the warehouse row FOR UPDATE (§2
// step 2), so they wait for postings in flight and later postings see the count.
//
// Only counted rows are stored (OQ-13): a row left empty keeps its system qty,
// an explicit 0 is a count. Quantities are visible to both roles; costs and
// amounts only with `stockCount.amount.read` (OWNER, CLAUDE.md rule 6).
import type { Prisma } from '@drinks/db';
import {
  can,
  type CostString,
  costAmount,
  countTotals,
  DocType,
  DomainError,
  ErrorCode,
  type OpenStockCount,
  parseInput,
  type StockCountDetail,
  type StockCountListItem,
  type StockCountListPage,
  type StockCountRow,
  StockCountStatus,
  storeDateOf,
  stockKeyOf,
  toPieces,
} from '@drinks/shared';
import {
  STOCK_COUNT_PAGE_SIZE,
  type StockCountCancelInput,
  stockCountCancelInputSchema,
  type StockCountIdInput,
  stockCountIdInputSchema,
  type StockCountListQuery,
  stockCountListQuerySchema,
  type StockCountOpenInput,
  stockCountOpenInputSchema,
  type StockCountPostInput,
  stockCountPostInputSchema,
  type StockCountUpdateInput,
  stockCountUpdateInputSchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { resolveStoreDate } from '../../core/dates';
import { lockStockCount, lockWarehouses, type StockKey } from '../../core/locks';
import { decimalToString, moneyToBigInt, moneyToNumber } from '../../core/money';
import { nextDocNumber } from '../../core/numbering';
import { assertCan } from '../../core/rbac';
import { isUniqueViolation, type Tx, withTransaction } from '../../core/tx';
import { audit, isBackdated } from '../audit';
import { inventory } from '../inventory';
import { warehouses } from '../warehouses';

/** counted_qty is a Postgres int4. */
const COUNTED_QTY_MAX = 2_147_483_647;

const AUTHOR = { select: { id: true, fullName: true } } as const;

const LIST_SELECT = {
  id: true,
  number: true,
  docDate: true,
  status: true,
  note: true,
  createdAt: true,
  shortageAmount: true,
  surplusAmount: true,
  warehouse: { select: { id: true, name: true } },
  createdBy: AUTHOR,
} as const satisfies Prisma.StockCountSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  version: true,
  postedAt: true,
  postedBy: AUTHOR,
  cancelledAt: true,
  cancelledBy: AUTHOR,
  lines: {
    select: { subWarehouseId: true, productId: true, countedQty: true, systemQty: true },
  },
  /** Posted: the average each product was adjusted at (§6.2 step 5). */
  results: { select: { productId: true, avgCost: true } },
} as const satisfies Prisma.StockCountSelect;

type ListRow = Prisma.StockCountGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.StockCountGetPayload<{ select: typeof DETAIL_SELECT }>;

/** A counted line as stored and audited. */
interface CountedLine extends StockKey {
  countedQty: number;
}

const showAmounts = (ctx: ServiceContext) => can(ctx.user.role, 'stockCount.amount.read');

/** Posting results (T-602), OWNER only: absent keys for STAFF, not null (rule 6). */
function amounts(ctx: ServiceContext, row: ListRow) {
  if (!showAmounts(ctx)) return {};
  return {
    shortageAmount: row.shortageAmount === null ? null : moneyToNumber(row.shortageAmount),
    surplusAmount: row.surplusAmount === null ? null : moneyToNumber(row.surplusAmount),
  };
}

function toListItem(ctx: ServiceContext, row: ListRow, lineCount: number): StockCountListItem {
  return {
    id: row.id,
    number: row.number,
    docDate: row.docDate,
    status: row.status,
    warehouse: row.warehouse,
    lineCount,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    ...amounts(ctx, row),
  };
}

async function loadRow(db: Tx, ctx: ServiceContext, id: string): Promise<DetailRow> {
  const row = await db.stockCount.findFirst({
    where: { id, storeId: ctx.storeId },
    select: DETAIL_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'stock_count' });
  return row;
}

/**
 * The counting form. DRAFT: every pair holding stock in the warehouse plus
 * the counted pairs, against the live balance (it cannot move while the
 * warehouse is blocked). POSTED / CANCELLED: the counted pairs only.
 */
async function toDetail(db: Tx, ctx: ServiceContext, row: DetailRow): Promise<StockCountDetail> {
  const draft = row.status === StockCountStatus.DRAFT;
  const posted = row.status === StockCountStatus.POSTED;
  const counted = new Map(row.lines.map((line) => [stockKeyOf(line), line]));

  const keys: StockKey[] = row.lines.map(({ subWarehouseId, productId }) => ({
    subWarehouseId,
    productId,
  }));
  const systemQty = new Map<string, number>();
  if (draft) {
    for (const stock of await inventory.getWarehouseStock(db, ctx, row.warehouse.id)) {
      if (!counted.has(stockKeyOf(stock))) keys.push(stock);
    }
    for (const stock of await inventory.getAvailable(db, ctx, keys)) {
      systemQty.set(stockKeyOf(stock), stock.qty);
    }
  } else {
    for (const line of row.lines) {
      if (line.systemQty !== null) systemQty.set(stockKeyOf(line), line.systemQty);
    }
  }

  const productIds = [...new Set(keys.map((key) => key.productId))];
  // One after the other: `db` may be a transaction, which runs one query at a time.
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      unitsPerBlock: true,
      archivedAt: true,
    },
  });
  const subs = await db.subWarehouse.findMany({
    where: { warehouseId: row.warehouse.id },
    select: { id: true, name: true, archivedAt: true },
  });
  const totals =
    showAmounts(ctx) && !posted ? await inventory.getProductTotals(db, ctx, productIds) : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const subById = new Map(subs.map((s) => [s.id, s]));
  // A posted count shows the average it was adjusted at; otherwise the current one.
  const avgById = new Map<string, CostString>(
    posted
      ? row.results.map((r) => [r.productId, decimalToString(r.avgCost)])
      : totals.map((t) => [t.productId, t.avgCost ?? '0.0000']),
  );

  const rows: StockCountRow[] = keys.map((key) => {
    const product = productById.get(key.productId)!;
    const sub = subById.get(key.subWarehouseId)!;
    const system = systemQty.get(stockKeyOf(key)) ?? null;
    const countedQty = counted.get(stockKeyOf(key))?.countedQty ?? null;
    const diffQty = system !== null && countedQty !== null ? countedQty - system : null;
    const result: StockCountRow = {
      subWarehouse: { id: sub.id, name: sub.name, archived: sub.archivedAt !== null },
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        unitsPerBlock: product.unitsPerBlock,
        archived: product.archivedAt !== null,
      },
      systemQty: system,
      countedQty,
      diffQty,
    };
    if (showAmounts(ctx)) {
      const avgCost = avgById.get(key.productId) ?? '0.0000';
      result.avgCost = avgCost;
      result.diffAmount = diffQty === null ? null : costAmount(diffQty, avgCost);
    }
    return result;
  });
  rows.sort(
    (a, b) =>
      a.subWarehouse.name.localeCompare(b.subWarehouse.name) ||
      a.product.name.localeCompare(b.product.name) ||
      a.product.id.localeCompare(b.product.id),
  );

  const { lineCount: _, ...base } = toListItem(ctx, row, row.lines.length);
  const detail: StockCountDetail = {
    ...base,
    docDay: storeDateOf(row.docDate),
    version: row.version,
    postedAt: row.postedAt,
    postedBy: row.postedBy,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    rows,
    countedCount: row.lines.length,
  };
  // What posting would write now (§6.2 steps 5–6 on the current rows).
  if (draft && showAmounts(ctx)) {
    detail.estimate = countTotals(
      rows.flatMap((r) =>
        r.diffQty === null
          ? []
          : [{ productId: r.product.id, diffQty: r.diffQty, avgCost: r.avgCost! }],
      ),
    );
  }
  return detail;
}

/**
 * §2 step 1: locks the count, then checks it is still the draft the user
 * loaded — another status → DOCUMENT_NOT_DRAFT, another version → DOCUMENT_CHANGED.
 */
async function lockDraft(tx: Tx, ctx: ServiceContext, id: string, version: number) {
  const locked = await lockStockCount(tx, ctx.storeId, id);
  if (locked.status !== StockCountStatus.DRAFT) {
    throw new DomainError(ErrorCode.DOCUMENT_NOT_DRAFT);
  }
  if (locked.version !== version) throw new DomainError(ErrorCode.DOCUMENT_CHANGED);
  return locked;
}

/**
 * The counted lines in pieces. Sub-warehouses must be active ones of the
 * counted warehouse (another warehouse's → NOT_FOUND). Products must be the
 * organization's and active — except an archived product that still has
 * stock in that sub-warehouse (OQ-20 allows that; counting it is how it is
 * written off, OQ-32).
 */
async function computeLines(
  tx: Tx,
  ctx: ServiceContext,
  warehouseId: string,
  lines: StockCountUpdateInput['lines'],
): Promise<CountedLine[]> {
  if (lines.length === 0) return [];
  const subToWarehouse = await warehouses.resolveActive(
    tx,
    ctx,
    lines.map((line) => line.subWarehouseId),
  );
  if ([...subToWarehouse.values()].some((id) => id !== warehouseId)) {
    throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'sub_warehouse' });
  }

  const productIds = [...new Set(lines.map((line) => line.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, organizationId: ctx.organizationId },
    select: { id: true, name: true, unitsPerBlock: true, archivedAt: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  if (byId.size !== productIds.length) {
    throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'product' });
  }
  const archivedLines = lines.filter((line) => byId.get(line.productId)!.archivedAt !== null);
  if (archivedLines.length > 0) {
    const stock = await inventory.getAvailable(tx, ctx, archivedLines);
    const empty = stock.find((s) => s.qty === 0);
    if (empty) {
      throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
        entity: 'product',
        name: byId.get(empty.productId)!.name,
      });
    }
  }

  return lines.map((line, index) => {
    const countedQty = toPieces(line.blocks, line.pieces, byId.get(line.productId)!.unitsPerBlock);
    if (countedQty > COUNTED_QTY_MAX) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, undefined, {
        [`lines.${index}`]: ['too big'],
      });
    }
    return { subWarehouseId: line.subWarehouseId, productId: line.productId, countedQty };
  });
}

/** The draft as the audit log records it. */
function snapshotOf(row: DetailRow) {
  return {
    number: row.number,
    warehouseId: row.warehouse.id,
    docDate: row.docDate,
    note: row.note,
    lines: row.lines.map(({ subWarehouseId, productId, countedQty }) => ({
      subWarehouseId,
      productId,
      countedQty,
    })),
  };
}

// ── Queries ──────────────────────────────────────────────────────────────

/** Open counts first (BR-8: visible, so nobody forgets one), then newest first. */
async function list(
  ctx: ServiceContext,
  query: StockCountListQuery = {},
): Promise<StockCountListPage> {
  assertCan(ctx.user, 'stockCount.write');
  const { status, warehouseId, q, page = 1 } = parseInput(stockCountListQuerySchema, query);
  const { prisma } = await import('@drinks/db');
  const where: Prisma.StockCountWhereInput = {
    storeId: ctx.storeId,
    ...(status && { status }),
    ...(warehouseId && { warehouseId }),
    ...(q && { number: { contains: q, mode: 'insensitive' } }),
  };
  const [total, rows] = await Promise.all([
    prisma.stockCount.count({ where }),
    prisma.stockCount.findMany({
      where,
      select: { ...LIST_SELECT, _count: { select: { lines: true } } },
      // DRAFT sorts first: the enum is declared DRAFT, POSTED, CANCELLED.
      orderBy: [{ status: 'asc' }, { docDate: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * STOCK_COUNT_PAGE_SIZE,
      take: STOCK_COUNT_PAGE_SIZE,
    }),
  ]);
  return {
    items: rows.map(({ _count, ...row }) => toListItem(ctx, row, _count.lines)),
    total,
    page,
    pageSize: STOCK_COUNT_PAGE_SIZE,
  };
}

/** One count of the store with its form rows; NOT_FOUND otherwise. */
async function get(ctx: ServiceContext, input: StockCountIdInput): Promise<StockCountDetail> {
  assertCan(ctx.user, 'stockCount.write');
  const { id } = parseInput(stockCountIdInputSchema, input);
  const { prisma } = await import('@drinks/db');
  return toDetail(prisma, ctx, await loadRow(prisma, ctx, id));
}

/** Every open (DRAFT) count of the store — warehouses page and the T-603 banner. */
async function openCounts(ctx: ServiceContext): Promise<OpenStockCount[]> {
  assertCan(ctx.user, 'warehouse.read');
  const { prisma } = await import('@drinks/db');
  const rows = await prisma.stockCount.findMany({
    where: { storeId: ctx.storeId, status: StockCountStatus.DRAFT },
    select: { id: true, number: true, warehouse: { select: { id: true, name: true } } },
    orderBy: { number: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    warehouseId: row.warehouse.id,
    warehouseName: row.warehouse.name,
  }));
}

// ── Commands ─────────────────────────────────────────────────────────────

/**
 * §6.1: locks the warehouse FOR UPDATE (§2 step 2) — a posting in flight
 * there finishes first — then refuses an archived warehouse (ENTITY_ARCHIVED)
 * or a second open count (STOCK_COUNT_ALREADY_OPEN; the partial unique index
 * backs it up). The next I-number comes from §2 step 3. Audit CREATE.
 */
async function open(ctx: ServiceContext, input: StockCountOpenInput): Promise<StockCountDetail> {
  assertCan(ctx.user, 'stockCount.write');
  const values = parseInput(stockCountOpenInputSchema, input);
  const docDate = resolveStoreDate(values.docDate);

  try {
    return await withTransaction(async (tx) => {
      const [locked] = await lockWarehouses(tx, ctx.storeId, [values.warehouseId], {
        exclusive: true,
      });
      const warehouse = await tx.warehouse.findUniqueOrThrow({
        where: { id: locked!.id },
        select: { id: true, name: true },
      });
      if (locked!.archivedAt !== null) {
        throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
          entity: 'warehouse',
          name: warehouse.name,
        });
      }
      const existing = await tx.stockCount.findFirst({
        where: { warehouseId: warehouse.id, status: StockCountStatus.DRAFT },
        select: { number: true },
      });
      if (existing) {
        throw new DomainError(ErrorCode.STOCK_COUNT_ALREADY_OPEN, {
          warehouseName: warehouse.name,
          stockCountNumber: existing.number,
        });
      }

      const number = await nextDocNumber(tx, ctx.storeId, DocType.STOCK_COUNT);
      const { id } = await tx.stockCount.create({
        data: {
          storeId: ctx.storeId,
          warehouseId: warehouse.id,
          number,
          docDate,
          note: values.note,
          createdById: ctx.user.id,
        },
        select: { id: true },
      });
      await audit.log(tx, ctx, {
        action: 'CREATE',
        entityType: 'stock_count',
        entityId: id,
        after: { number, warehouseId: warehouse.id, docDate, note: values.note, lines: [] },
        backdated: isBackdated(docDate),
      });
      return toDetail(tx, ctx, await loadRow(tx, ctx, id));
    });
  } catch (error) {
    // Only reachable if the lock were bypassed: the index allows one DRAFT per warehouse.
    if (isUniqueViolation(error)) throw new DomainError(ErrorCode.STOCK_COUNT_ALREADY_OPEN);
    throw error;
  }
}

/**
 * Saves the counting form: date, note and the full set of counted lines
 * (replaced), version + 1. Any user may edit any open count (OQ-14). Audit
 * UPDATE with before/after.
 */
async function update(
  ctx: ServiceContext,
  input: StockCountUpdateInput,
): Promise<StockCountDetail> {
  assertCan(ctx.user, 'stockCount.write');
  const { id, version, ...values } = parseInput(stockCountUpdateInputSchema, input);

  return withTransaction(async (tx) => {
    const locked = await lockDraft(tx, ctx, id, version);
    const before = await loadRow(tx, ctx, id);
    const docDate = resolveStoreDate(values.docDate, before.docDate);
    const lines = await computeLines(tx, ctx, locked.warehouseId, values.lines);

    await tx.stockCountLine.deleteMany({ where: { stockCountId: id } });
    await tx.stockCount.update({
      where: { id },
      data: {
        docDate,
        note: values.note,
        version: { increment: 1 },
        lines: { create: lines },
      },
      select: { id: true },
    });
    await audit.log(tx, ctx, {
      action: 'UPDATE',
      entityType: 'stock_count',
      entityId: id,
      before: snapshotOf(before),
      after: { ...snapshotOf(before), docDate, note: values.note, lines },
      backdated: isBackdated(docDate),
    });
    return toDetail(tx, ctx, await loadRow(tx, ctx, id));
  });
}

/** §6.3: DRAFT → CANCELLED; stock is untouched and the warehouse block lifts at commit. Audit CANCEL. */
async function cancel(
  ctx: ServiceContext,
  input: StockCountCancelInput,
): Promise<StockCountDetail> {
  assertCan(ctx.user, 'stockCount.write');
  const { id, version } = parseInput(stockCountCancelInputSchema, input);

  return withTransaction(async (tx) => {
    await lockDraft(tx, ctx, id, version);
    const cancelledAt = new Date();
    const row = await tx.stockCount.update({
      where: { id },
      data: {
        status: StockCountStatus.CANCELLED,
        cancelledAt,
        cancelledById: ctx.user.id,
        version: { increment: 1 },
      },
      select: { number: true, warehouseId: true },
    });
    await audit.log(tx, ctx, {
      action: 'CANCEL',
      entityType: 'stock_count',
      entityId: id,
      before: { status: StockCountStatus.DRAFT, version },
      after: {
        status: StockCountStatus.CANCELLED,
        number: row.number,
        warehouseId: row.warehouseId,
        cancelledAt,
      },
    });
    return toDetail(tx, ctx, await loadRow(tx, ctx, id));
  });
}

/**
 * §6.2: the counted lines become the balance; uncounted pairs keep theirs
 * (OQ-13). inventory.adjust takes §2 steps 6–7, writes a COUNT_ADJUSTMENT per
 * changed pair at the current average and moves product_cost.total_qty by the
 * warehouse total. The system qty under the lock is kept on each line, one
 * stock_count_result per product (BR-8: priced on the warehouse total, so a
 * move between sub-warehouses costs nothing — P&L reads these), shortage and
 * surplus on the header. A count with no counted line → STOCK_COUNT_EMPTY
 * (OQ-33: cancel it instead). Any user may post (`stockCount.post`); STAFF
 * gets the result without amounts. Audit POST; the block lifts at commit.
 */
async function post(ctx: ServiceContext, input: StockCountPostInput): Promise<StockCountDetail> {
  assertCan(ctx.user, 'stockCount.post');
  const { id, version } = parseInput(stockCountPostInputSchema, input);

  return withTransaction(async (tx) => {
    // 1. The count: still the draft the user saw.
    const locked = await lockDraft(tx, ctx, id, version);
    const doc = await tx.stockCount.findUniqueOrThrow({
      where: { id },
      select: {
        number: true,
        docDate: true,
        lines: { select: { subWarehouseId: true, productId: true, countedQty: true } },
      },
    });
    if (doc.lines.length === 0) throw new DomainError(ErrorCode.STOCK_COUNT_EMPTY);

    // 2. The warehouse FOR UPDATE: nothing else touches it until commit.
    await lockWarehouses(tx, ctx.storeId, [locked.warehouseId], { exclusive: true });

    // 3–5. Balances to the count (inventory takes locks 6–7).
    const adjusted = await inventory.adjust(tx, ctx, {
      docDate: doc.docDate,
      stockCountId: id,
      lines: doc.lines,
    });
    await tx.$executeRaw`
      UPDATE stock_count_line AS l SET system_qty = s.system_qty
      FROM unnest(
        ${adjusted.lines.map((line) => line.subWarehouseId)}::uuid[],
        ${adjusted.lines.map((line) => line.productId)}::uuid[],
        ${adjusted.lines.map((line) => line.systemQty)}::int[]
      ) AS s(sub_warehouse_id, product_id, system_qty)
      WHERE l.stock_count_id = ${id}::uuid
        AND l.sub_warehouse_id = s.sub_warehouse_id
        AND l.product_id = s.product_id`;
    await tx.stockCountResult.createMany({
      data: adjusted.products.map((product) => ({
        stockCountId: id,
        productId: product.productId,
        systemQty: product.systemQty,
        countedQty: product.countedQty,
        diffQty: product.qtyDelta,
        avgCost: product.avgCost,
        amount: moneyToBigInt(product.amount),
      })),
    });

    // 6–7. Totals, status, audit POST (costs are fine here: audit is OWNER-only).
    const { shortageAmount, surplusAmount } = countTotals(
      adjusted.products.map((product) => ({
        productId: product.productId,
        diffQty: product.qtyDelta,
        avgCost: product.avgCost,
      })),
    );
    const postedAt = new Date();
    await tx.stockCount.update({
      where: { id },
      data: {
        status: StockCountStatus.POSTED,
        shortageAmount: moneyToBigInt(shortageAmount),
        surplusAmount: moneyToBigInt(surplusAmount),
        postedAt,
        postedById: ctx.user.id,
        version: { increment: 1 },
      },
      select: { id: true },
    });
    await audit.log(tx, ctx, {
      action: 'POST',
      entityType: 'stock_count',
      entityId: id,
      before: { status: StockCountStatus.DRAFT, version },
      after: {
        status: StockCountStatus.POSTED,
        number: doc.number,
        warehouseId: locked.warehouseId,
        docDate: doc.docDate,
        postedAt,
        shortageAmount,
        surplusAmount,
        results: adjusted.products,
        movements: adjusted.lines.flatMap(({ movement }) =>
          movement
            ? [
                {
                  productId: movement.productId,
                  subWarehouseId: movement.subWarehouseId,
                  qty: movement.qtyDelta,
                  unitCost: movement.unitCost,
                },
              ]
            : [],
        ),
      },
      backdated: isBackdated(doc.docDate),
    });
    return toDetail(tx, ctx, await loadRow(tx, ctx, id));
  });
}

export const stockCounts = { list, get, openCounts, open, update, cancel, post };
