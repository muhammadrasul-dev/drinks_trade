// Sales (FR-3.1–3.3, business-logic §4): drafts (T-501), posting (T-502)
// and reversal (T-503).
// A draft touches neither stock nor cash; each line copies the product's
// per-piece sale price (OQ-05, OQ-15) and carries a stock warning (FR-3.3) — a
// short draft can be saved, posting re-checks under the locks and moves stock
// (inventory), cash (cash) and opens the credit debt (debts) in one
// transaction, and reversal undoes all three. Any user may edit any draft (OQ-14); concurrent edits are
// caught by the `version` column.
import type { Prisma } from '@drinks/db';
import type { QtyUnit } from '@drinks/shared';
import {
  CashDirection,
  CashTxType,
  DebtSource,
  DocStatus,
  DocType,
  DomainError,
  ErrorCode,
  lineStock,
  MovementType,
  type SaleDetail,
  type SaleLine,
  type SaleListItem,
  type SaleListPage,
  type SaleProductOption,
  type StockAvailability,
  stockKeyOf,
  paymentSum,
  unitPieces,
  storeDateOf,
  parseInput,
} from '@drinks/shared';
import {
  SALE_PAGE_SIZE,
  type SaleAvailabilityInput,
  saleAvailabilityInputSchema,
  type SaleDeleteInput,
  saleDeleteInputSchema,
  type SaleDraftInput,
  saleDraftInputSchema,
  type SaleIdInput,
  saleIdInputSchema,
  type SaleListQuery,
  saleListQuerySchema,
  type SalePostInput,
  salePostInputSchema,
  type SaleReverseInput,
  saleReverseInputSchema,
  type SaleUpdateInput,
  saleUpdateInputSchema,
} from '@drinks/shared/schemas';
import type { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { resolveStoreDate, storeDayRange } from '../../core/dates';
import { assertLineProductsUnchanged, loadActiveProducts } from '../../core/doc-lines';
import { lockDebt, lockSale } from '../../core/locks';
import { decimalToString, moneyToBigInt, moneyToNumber } from '../../core/money';
import { nextDocNumber } from '../../core/numbering';
import { assertCan } from '../../core/rbac';
import { type Tx, withTransaction } from '../../core/tx';
import { audit, isBackdated } from '../audit';
import { cash } from '../cash';
import { debts } from '../debts';
import { inventory } from '../inventory';
import { warehouses } from '../warehouses';

type DraftValues = z.output<typeof saleDraftInputSchema>;

const LIST_SELECT = {
  id: true,
  number: true,
  docDate: true,
  status: true,
  totalAmount: true,
  paidCash: true,
  paidCard: true,
  paidCredit: true,
  note: true,
  createdBy: { select: { id: true, fullName: true } },
} as const satisfies Prisma.SaleSelect;

// No unit_cost / cost_amount / cost_total: they are secret for STAFF (CLAUDE.md rule 6).
const DETAIL_SELECT = {
  ...LIST_SELECT,
  version: true,
  createdAt: true,
  postedAt: true,
  postedBy: { select: { id: true, fullName: true } },
  reversedAt: true,
  reverseReason: true,
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      id: true,
      lineNo: true,
      inputUnit: true,
      inputQty: true,
      qty: true,
      unitPrice: true,
      lineTotal: true,
      product: { select: { id: true, name: true, unitsPerBlock: true, archivedAt: true } },
      subWarehouse: {
        select: {
          id: true,
          name: true,
          archivedAt: true,
          warehouse: { select: { name: true, archivedAt: true } },
        },
      },
    },
  },
} as const satisfies Prisma.SaleSelect;

type ListRow = Prisma.SaleGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.SaleGetPayload<{ select: typeof DETAIL_SELECT }>;

/** A line ready for INSERT, computed from the input and the product's current data. */
interface ComputedLine {
  lineNo: number;
  productId: string;
  subWarehouseId: string;
  inputUnit: QtyUnit;
  inputQty: number;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

/** The document as the audit log records it (money as number). */
interface Snapshot {
  number: string;
  docDate: Date;
  note: string | null;
  totalAmount: number;
  paidCash: number;
  paidCard: number;
  paidCredit: number;
  lines: ComputedLine[];
}

/** A line or document sum past Number.MAX_SAFE_INTEGER is bad input, not a crash. */
function tooBig(): DomainError {
  return new DomainError(ErrorCode.VALIDATION_FAILED, undefined, { lines: ['total too big'] });
}

function toListItem(row: ListRow, lineCount: number): SaleListItem {
  return {
    id: row.id,
    number: row.number,
    docDate: row.docDate,
    status: row.status,
    totalAmount: moneyToNumber(row.totalAmount),
    paidCash: moneyToNumber(row.paidCash),
    paidCard: moneyToNumber(row.paidCard),
    paidCredit: moneyToNumber(row.paidCredit),
    lineCount,
    note: row.note,
    createdBy: row.createdBy,
  };
}

/**
 * Draft lines get the current stock of their (sub-warehouse, product) pair
 * and the shortage flag (FR-3.3); posted and reversed sales get neither.
 */
async function toDetail(db: Tx, ctx: ServiceContext, row: DetailRow): Promise<SaleDetail> {
  const { lineCount: _, ...base } = toListItem(row, row.lines.length);
  const needs = row.lines.map((line) => ({
    subWarehouseId: line.subWarehouse.id,
    productId: line.product.id,
    qty: line.qty,
  }));
  const isDraft = row.status === DocStatus.DRAFT;
  const stock = isDraft ? await stockOf(db, ctx, needs) : null;

  const lines = row.lines.map((line, index): SaleLine => {
    const sub = line.subWarehouse;
    return {
      id: line.id,
      lineNo: line.lineNo,
      product: {
        id: line.product.id,
        name: line.product.name,
        unitsPerBlock: line.product.unitsPerBlock,
        archived: line.product.archivedAt !== null,
      },
      subWarehouse: {
        id: sub.id,
        name: sub.name,
        warehouseName: sub.warehouse.name,
        archived: sub.archivedAt !== null || sub.warehouse.archivedAt !== null,
      },
      inputUnit: line.inputUnit,
      inputQty: line.inputQty,
      qty: line.qty,
      unitPrice: moneyToNumber(line.unitPrice),
      lineTotal: moneyToNumber(line.lineTotal),
      available: stock?.[index]?.available ?? null,
      stockShort: stock?.[index]?.short ?? false,
    };
  });
  return {
    ...base,
    docDay: storeDateOf(row.docDate),
    version: row.version,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    postedBy: row.postedBy,
    reversedAt: row.reversedAt,
    reverseReason: row.reverseReason,
    lines,
    stockShort: lines.some((line) => line.stockShort),
  };
}

/** FR-3.3 per line: the pair's stock and whether the draft's lines of that pair exceed it. */
async function stockOf(
  db: Tx,
  ctx: ServiceContext,
  needs: { subWarehouseId: string; productId: string; qty: number }[],
) {
  const rows = await inventory.getAvailable(db, ctx, needs);
  const qtyByKey = new Map(rows.map((row) => [stockKeyOf(row), row.qty]));
  return lineStock(needs, (key) => qtyByKey.get(stockKeyOf(key)) ?? 0);
}

/**
 * §4.1 steps 2 and 4: products must be the organization's and active,
 * sub-warehouses the store's and active. Each line copies the product's
 * per-piece sale price (OQ-05, OQ-15); BLOCK lines convert with the current
 * units per block (posting re-checks it, OQ-06).
 */
async function computeLines(
  tx: Tx,
  ctx: ServiceContext,
  lines: DraftValues['lines'],
): Promise<ComputedLine[]> {
  const byId = await loadActiveProducts(
    tx,
    ctx,
    lines.map((line) => line.productId),
  );
  await warehouses.resolveActive(
    tx,
    ctx,
    lines.map((line) => line.subWarehouseId),
  );

  return lines.map((line, index) => {
    const product = byId.get(line.productId)!;
    const qty = unitPieces(line.inputUnit, line.inputQty, product.unitsPerBlock);
    const unitPrice = moneyToNumber(product.salePrice);
    const lineTotal = qty * unitPrice;
    if (!Number.isSafeInteger(qty) || !Number.isSafeInteger(lineTotal)) throw tooBig();
    return {
      lineNo: index + 1,
      productId: line.productId,
      subWarehouseId: line.subWarehouseId,
      inputUnit: line.inputUnit,
      inputQty: line.inputQty,
      qty,
      unitPrice,
      lineTotal,
    };
  });
}

function headerData(values: DraftValues, docDate: Date, lines: readonly ComputedLine[]) {
  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (!Number.isSafeInteger(totalAmount)) throw tooBig();
  return {
    docDate,
    note: values.note,
    totalAmount: moneyToBigInt(totalAmount),
    paidCash: moneyToBigInt(values.paidCash),
    paidCard: moneyToBigInt(values.paidCard),
    paidCredit: moneyToBigInt(values.paidCredit),
  };
}

function lineData(line: ComputedLine) {
  return {
    lineNo: line.lineNo,
    productId: line.productId,
    subWarehouseId: line.subWarehouseId,
    inputUnit: line.inputUnit,
    inputQty: line.inputQty,
    qty: line.qty,
    unitPrice: moneyToBigInt(line.unitPrice),
    lineTotal: moneyToBigInt(line.lineTotal),
  };
}

function snapshot(
  number: string,
  header: ReturnType<typeof headerData>,
  lines: readonly ComputedLine[],
): Snapshot {
  return {
    number,
    docDate: header.docDate,
    note: header.note,
    totalAmount: moneyToNumber(header.totalAmount),
    paidCash: moneyToNumber(header.paidCash),
    paidCard: moneyToNumber(header.paidCard),
    paidCredit: moneyToNumber(header.paidCredit),
    lines: [...lines],
  };
}

function snapshotOf(row: DetailRow): Snapshot {
  return {
    number: row.number,
    docDate: row.docDate,
    note: row.note,
    totalAmount: moneyToNumber(row.totalAmount),
    paidCash: moneyToNumber(row.paidCash),
    paidCard: moneyToNumber(row.paidCard),
    paidCredit: moneyToNumber(row.paidCredit),
    lines: row.lines.map((line) => ({
      lineNo: line.lineNo,
      productId: line.product.id,
      subWarehouseId: line.subWarehouse.id,
      inputUnit: line.inputUnit,
      inputQty: line.inputQty,
      qty: line.qty,
      unitPrice: moneyToNumber(line.unitPrice),
      lineTotal: moneyToNumber(line.lineTotal),
    })),
  };
}

async function loadDetail(db: Tx, ctx: ServiceContext, id: string): Promise<DetailRow> {
  const row = await db.sale.findFirst({
    where: { id, storeId: ctx.storeId },
    select: DETAIL_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'sale' });
  return row;
}

/**
 * §2 step 1: locks the document, then checks it is still the draft the user
 * loaded — another status → DOCUMENT_NOT_DRAFT, another version → DOCUMENT_CHANGED.
 */
async function lockDraft(tx: Tx, ctx: ServiceContext, id: string, version: number) {
  const locked = await lockSale(tx, ctx.storeId, id);
  if (locked.status !== DocStatus.DRAFT) throw new DomainError(ErrorCode.DOCUMENT_NOT_DRAFT);
  if (locked.version !== version) throw new DomainError(ErrorCode.DOCUMENT_CHANGED);
  return locked;
}

/** Newest first; filters by status, store-zone date range and part of the number. */
async function list(ctx: ServiceContext, query: SaleListQuery = {}): Promise<SaleListPage> {
  assertCan(ctx.user, 'sale.write');
  const { status, from, to, q, page = 1 } = parseInput(saleListQuerySchema, query);
  const { prisma } = await import('@drinks/db');
  const docDate = storeDayRange(from, to);
  const where: Prisma.SaleWhereInput = {
    storeId: ctx.storeId,
    ...(status && { status }),
    ...(docDate && { docDate }),
    ...(q && { number: { contains: q, mode: 'insensitive' } }),
  };
  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      select: { ...LIST_SELECT, _count: { select: { lines: true } } },
      orderBy: [{ docDate: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * SALE_PAGE_SIZE,
      take: SALE_PAGE_SIZE,
    }),
  ]);
  return {
    items: rows.map(({ _count, ...row }) => toListItem(row, _count.lines)),
    total,
    page,
    pageSize: SALE_PAGE_SIZE,
  };
}

/** One sale of the store with its lines (a draft with the stock warning); NOT_FOUND otherwise. */
async function get(ctx: ServiceContext, input: SaleIdInput): Promise<SaleDetail> {
  assertCan(ctx.user, 'sale.write');
  const { id } = parseInput(saleIdInputSchema, input);
  const { prisma } = await import('@drinks/db');
  return toDetail(prisma, ctx, await loadDetail(prisma, ctx, id));
}

/** New draft with the next S-number (§2 step 3; a rolled-back create leaves a gap). */
async function create(ctx: ServiceContext, input: SaleDraftInput): Promise<SaleDetail> {
  assertCan(ctx.user, 'sale.write');
  assertCan(ctx.user, 'document.paymentSplit.write');
  const values = parseInput(saleDraftInputSchema, input);
  const docDate = resolveStoreDate(values.docDate);

  return withTransaction(async (tx) => {
    const lines = await computeLines(tx, ctx, values.lines);
    const header = headerData(values, docDate, lines);
    const number = await nextDocNumber(tx, ctx.storeId, DocType.SALE);
    const { id } = await tx.sale.create({
      data: {
        ...header,
        storeId: ctx.storeId,
        number,
        createdById: ctx.user.id,
        lines: { create: lines.map(lineData) },
      },
      select: { id: true },
    });
    await audit.log(tx, ctx, {
      action: 'CREATE',
      entityType: 'sale',
      entityId: id,
      after: snapshot(number, header, lines),
      backdated: isBackdated(docDate),
    });
    return toDetail(tx, ctx, await loadDetail(tx, ctx, id));
  });
}

/** Replaces the draft's header and lines; version + 1 (OQ-14: any user's draft). */
async function update(ctx: ServiceContext, input: SaleUpdateInput): Promise<SaleDetail> {
  assertCan(ctx.user, 'sale.write');
  assertCan(ctx.user, 'document.paymentSplit.write');
  const { id, version, ...values } = parseInput(saleUpdateInputSchema, input);

  return withTransaction(async (tx) => {
    await lockDraft(tx, ctx, id, version);
    const before = await loadDetail(tx, ctx, id);
    const docDate = resolveStoreDate(values.docDate, before.docDate);
    const lines = await computeLines(tx, ctx, values.lines);
    const header = headerData(values, docDate, lines);

    await tx.saleLine.deleteMany({ where: { saleId: id } });
    await tx.sale.update({
      where: { id },
      data: {
        ...header,
        version: { increment: 1 },
        lines: { create: lines.map(lineData) },
      },
    });
    await audit.log(tx, ctx, {
      action: 'UPDATE',
      entityType: 'sale',
      entityId: id,
      before: snapshotOf(before),
      after: snapshot(before.number, header, lines),
      backdated: isBackdated(docDate),
    });
    return toDetail(tx, ctx, await loadDetail(tx, ctx, id));
  });
}

/** Deletes a draft and its lines (database §6.3); its number stays unused. */
async function remove(ctx: ServiceContext, input: SaleDeleteInput): Promise<void> {
  assertCan(ctx.user, 'sale.write');
  const { id, version } = parseInput(saleDeleteInputSchema, input);

  await withTransaction(async (tx) => {
    await lockDraft(tx, ctx, id, version);
    const before = await loadDetail(tx, ctx, id);
    await tx.sale.delete({ where: { id } });
    await audit.log(tx, ctx, {
      action: 'DELETE',
      entityType: 'sale',
      entityId: id,
      before: snapshotOf(before),
    });
  });
}

/**
 * The form's live stock check (FR-3.3): current qty per (sub-warehouse,
 * product) pair, in input order; other stores' sub-warehouses read as 0.
 */
async function availability(
  ctx: ServiceContext,
  input: SaleAvailabilityInput,
): Promise<StockAvailability[]> {
  assertCan(ctx.user, 'sale.write');
  const { keys } = parseInput(saleAvailabilityInputSchema, input);
  const { prisma } = await import('@drinks/db');
  return inventory.getAvailable(prisma, ctx, keys);
}

/** The sale form's product picker: active products by name, with the per-piece sale price. */
async function productOptions(ctx: ServiceContext): Promise<SaleProductOption[]> {
  assertCan(ctx.user, 'sale.write');
  const { prisma } = await import('@drinks/db');
  const rows = await prisma.product.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      unitsPerBlock: true,
      salePrice: true,
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({ ...row, salePrice: moneyToNumber(row.salePrice) }));
}

// ── Posting (T-502, BR-5, BR-7, business-logic §4.2) ─────────────────────

const POST_SELECT = {
  number: true,
  docDate: true,
  note: true,
  totalAmount: true,
  paidCash: true,
  paidCard: true,
  paidCredit: true,
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      id: true,
      lineNo: true,
      productId: true,
      subWarehouseId: true,
      inputUnit: true,
      inputQty: true,
      qty: true,
      unitPrice: true,
      product: {
        select: { name: true, unitsPerBlock: true, salePrice: true, archivedAt: true },
      },
    },
  },
} as const satisfies Prisma.SaleSelect;

type PostRow = Prisma.SaleGetPayload<{ select: typeof POST_SELECT }>;

/**
 * Products must still be active; a BLOCK line must still hold inputQty × the
 * product's current units per block (OQ-06) and every line the product's
 * current sale price (OQ-29). Otherwise the user re-saves the draft, which
 * recomputes pieces, prices and the total.
 */
function assertProductsUnchanged(lines: PostRow['lines']): void {
  assertLineProductsUnchanged(lines);
  const priceChanged = lines.filter((line) => line.unitPrice !== line.product.salePrice);
  if (priceChanged.length > 0) {
    throw new DomainError(ErrorCode.SALE_PRICE_CHANGED, {
      lines: priceChanged.map((line) => ({
        lineNo: line.lineNo,
        productId: line.productId,
        product: line.product.name,
        unitPrice: moneyToNumber(line.unitPrice),
        salePrice: moneyToNumber(line.product.salePrice),
      })),
    });
  }
}

/**
 * Posts a draft (BR-5): goods leave the chosen sub-warehouses at the current
 * average cost, which is frozen on each line (BR-6) and stays the average;
 * any (sub-warehouse, product) short of stock fails the whole sale with
 * INSUFFICIENT_STOCK (BR-7). The cash and card parts come IN to their
 * cashboxes (SALE_RECEIPT) and the credit part opens a RECEIVABLE debt — one
 * transaction, locks in business-logic §2 order, audit POST. Both roles may
 * post (OQ-02); no error carries a cash amount or a cost (CLAUDE.md rule 6).
 */
async function post(ctx: ServiceContext, input: SalePostInput): Promise<SaleDetail> {
  assertCan(ctx.user, 'sale.post');
  const { id, version } = parseInput(salePostInputSchema, input);

  return withTransaction(async (tx) => {
    // 1. The document: still the draft the user saw.
    await lockDraft(tx, ctx, id, version);
    const doc: PostRow = await tx.sale.findUniqueOrThrow({ where: { id }, select: POST_SELECT });
    const totalAmount = moneyToNumber(doc.totalAmount);
    const paidCash = moneyToNumber(doc.paidCash);
    const paidCard = moneyToNumber(doc.paidCard);
    const paidCredit = moneyToNumber(doc.paidCredit);

    // 3. Header rules need no further lock, so they fail first (OQ-19: before other work).
    if (paymentSum({ paidCash, paidCard, paidCredit }) !== totalAmount) {
      throw new DomainError(ErrorCode.PAYMENT_SPLIT_MISMATCH);
    }
    if (paidCredit > 0 && !doc.note?.trim()) throw new DomainError(ErrorCode.NOTE_REQUIRED);
    if (doc.docDate.getTime() > Date.now()) throw new DomainError(ErrorCode.DOC_DATE_IN_FUTURE);

    // 2. Warehouses FOR SHARE, the stock-count block (BR-8, §3) and the
    //    archive state under that lock (§9c).
    await warehouses.lockForPosting(
      tx,
      ctx,
      doc.lines.map((line) => line.subWarehouseId),
    );
    assertProductsUnchanged(doc.lines);

    // 4. Cashboxes of the paid parts: money comes IN, so no balance check.
    const paid = await cash.lockPaidParts(tx, ctx, { paidCash, paidCard }, CashDirection.IN);

    // 5–8. Stock out at the current average (inventory takes locks 6–7 and
    //      throws INSUFFICIENT_STOCK per short pair), then the cost is frozen.
    const movements = await inventory.issue(tx, ctx, {
      type: MovementType.SALE,
      docDate: doc.docDate,
      lines: doc.lines.map((line) => ({
        subWarehouseId: line.subWarehouseId,
        productId: line.productId,
        qty: line.qty,
        lineNo: line.lineNo,
        saleLineId: line.id,
      })),
    });
    let costTotal = 0;
    for (const [index, line] of doc.lines.entries()) {
      const movement = movements[index]!;
      const costAmount = -movement.costAmount;
      costTotal += costAmount;
      await tx.saleLine.update({
        where: { id: line.id },
        data: { unitCost: movement.unitCost, costAmount: moneyToBigInt(costAmount) },
        select: { id: true },
      });
    }

    // 9. Cash IN for the cash and card parts.
    const cashTransactionIds = await cash.recordPaidParts(tx, ctx, paid, {
      type: CashTxType.SALE_RECEIPT,
      txDate: doc.docDate,
      note: doc.note,
      saleId: id,
    });

    // 10. Credit part → RECEIVABLE debt; its note is the document note (OQ-19).
    const debt =
      paidCredit > 0
        ? await debts.open(tx, ctx, {
            source: DebtSource.SALE,
            saleId: id,
            amount: paidCredit,
            note: doc.note ?? '',
            debtDate: doc.docDate,
          })
        : null;

    // 11–12. Status and cost total, then audit POST (costs are fine here: audit is OWNER-only).
    const postedAt = new Date();
    await tx.sale.update({
      where: { id },
      data: {
        status: DocStatus.POSTED,
        costTotal: moneyToBigInt(costTotal),
        postedAt,
        postedById: ctx.user.id,
        version: { increment: 1 },
      },
      select: { id: true },
    });
    await audit.log(tx, ctx, {
      action: 'POST',
      entityType: 'sale',
      entityId: id,
      before: { status: DocStatus.DRAFT, version },
      after: {
        status: DocStatus.POSTED,
        number: doc.number,
        docDate: doc.docDate,
        postedAt,
        totalAmount,
        paidCash,
        paidCard,
        paidCredit,
        costTotal,
        movements: movements.map((movement, index) => ({
          lineNo: doc.lines[index]!.lineNo,
          productId: movement.productId,
          subWarehouseId: movement.subWarehouseId,
          qty: movement.qtyDelta,
          unitCost: movement.unitCost,
          costAmount: -movement.costAmount,
        })),
        cashTransactionIds,
        debtId: debt?.id ?? null,
      },
      backdated: isBackdated(doc.docDate),
    });
    return toDetail(tx, ctx, await loadDetail(tx, ctx, id));
  });
}

// ── Reversal (T-503, BR-3, business-logic §4.3) ──────────────────────────

const REVERSE_SELECT = {
  number: true,
  docDate: true,
  paidCash: true,
  paidCard: true,
  debt: { select: { id: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      id: true,
      lineNo: true,
      productId: true,
      subWarehouseId: true,
      qty: true,
      unitCost: true,
      costAmount: true,
    },
  },
} as const satisfies Prisma.SaleSelect;

/**
 * Reverses a posted sale (BR-3): its goods come back to the sub-warehouses at
 * the cost frozen on each line and the average is recalculated (OQ-18), the
 * paid parts leave their cashboxes (SALE_REFUND) and the credit debt is
 * cancelled. Blocked while the debt has repayments (OQ-04), while a cashbox
 * holds less than its part (CASHBOX_INSUFFICIENT, BR-9), during an open stock
 * count (BR-8) or when a sub-warehouse was archived since (OQ-31). OWNER only
 * (OQ-03); one transaction, locks in business-logic §2 order, audit REVERSE
 * with the reason. Entries carry the document date, so the sale leaves the
 * reports of its own period (OQ-01, OQ-26).
 */
async function reverse(ctx: ServiceContext, input: SaleReverseInput): Promise<SaleDetail> {
  assertCan(ctx.user, 'document.reverse');
  const { id, reason } = parseInput(saleReverseInputSchema, input);

  return withTransaction(async (tx) => {
    // 1. The document: only a posted one can be reversed.
    const locked = await lockSale(tx, ctx.storeId, id);
    if (locked.status !== DocStatus.POSTED) throw new DomainError(ErrorCode.DOCUMENT_NOT_POSTED);
    const doc = await tx.sale.findUniqueOrThrow({ where: { id }, select: REVERSE_SELECT });
    const paidCash = moneyToNumber(doc.paidCash);
    const paidCard = moneyToNumber(doc.paidCard);

    // 3. Warehouses FOR SHARE, the stock-count block (BR-8, §3) and the archive
    //    state: goods must not come back into an archived sub-warehouse (OQ-31).
    await warehouses.lockForPosting(
      tx,
      ctx,
      doc.lines.map((line) => line.subWarehouseId),
    );

    // 5. Cashboxes of the paid parts (§2 step 4, before the debt): the money
    //    goes back OUT, so each part must fit (BR-9) — CASHBOX_INSUFFICIENT
    //    before any stock moves.
    const paid = await cash.lockPaidParts(tx, ctx, { paidCash, paidCard }, CashDirection.OUT);

    // 4/9. The credit debt (§2 step 5): cancelled here so DEBT_HAS_REPAYMENTS
    //      (OQ-04) fails before any stock moves.
    const debtId = doc.debt?.id ?? null;
    if (debtId) await debts.cancel(tx, ctx, await lockDebt(tx, ctx.storeId, debtId));

    // 6–7. Goods come back at the cost frozen on each line (OQ-18); the
    //      average is recalculated per product. Inventory takes locks 6–7.
    const movements = await inventory.receive(tx, ctx, {
      type: MovementType.SALE_REVERSAL,
      docDate: doc.docDate,
      lines: doc.lines.map((line) => {
        if (line.unitCost === null || line.costAmount === null) {
          throw new Error(`Posted sale line ${line.id} has no frozen cost`);
        }
        return {
          subWarehouseId: line.subWarehouseId,
          productId: line.productId,
          qty: line.qty,
          unitCost: decimalToString(line.unitCost),
          costAmount: moneyToNumber(line.costAmount),
          saleLineId: line.id,
        };
      }),
    });

    // 8. Cash OUT for the parts received at posting.
    const cashTransactionIds = await cash.recordPaidParts(tx, ctx, paid, {
      type: CashTxType.SALE_REFUND,
      txDate: doc.docDate,
      note: reason,
      saleId: id,
    });

    // 10–11. Status, then audit REVERSE (costs are fine here: audit is OWNER-only).
    const reversedAt = new Date();
    await tx.sale.update({
      where: { id },
      data: {
        status: DocStatus.REVERSED,
        reversedAt,
        reversedById: ctx.user.id,
        reverseReason: reason,
        version: { increment: 1 },
      },
      select: { id: true },
    });
    await audit.log(tx, ctx, {
      action: 'REVERSE',
      entityType: 'sale',
      entityId: id,
      before: { status: DocStatus.POSTED, version: locked.version },
      after: {
        status: DocStatus.REVERSED,
        number: doc.number,
        docDate: doc.docDate,
        reversedAt,
        reverseReason: reason,
        movements: inventory.auditMovements(movements, doc.lines),
        cashTransactionIds,
        cancelledDebtId: debtId,
      },
      backdated: isBackdated(doc.docDate),
      meta: { reason },
    });
    return toDetail(tx, ctx, await loadDetail(tx, ctx, id));
  });
}

export const sales = {
  list,
  get,
  create,
  update,
  remove,
  post,
  reverse,
  availability,
  productOptions,
};
