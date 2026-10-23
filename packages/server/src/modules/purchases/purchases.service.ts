// Purchases (FR-4.1–4.2, business-logic §5): drafts (T-404) and posting
// (T-405). A draft does not touch stock or cash; posting moves stock and the
// average cost (inventory), cash (cash) and opens the credit debt (debts) in
// one transaction. Any user may edit any draft (OQ-14); concurrent edits are
// caught by the `version` column.
import type { Prisma } from '@drinks/db';
import {
  CashboxType,
  CashTxType,
  DebtSource,
  DocStatus,
  DocType,
  DomainError,
  ErrorCode,
  type PurchaseDetail,
  type PurchaseLine,
  type PurchaseListItem,
  type PurchaseListPage,
  MovementType,
  QtyUnit,
  storeDateOf,
  storeToday,
  unitCostOf,
  validationError,
} from '@drinks/shared';
import {
  PURCHASE_PAGE_SIZE,
  type PurchaseDeleteInput,
  purchaseDeleteInputSchema,
  type PurchaseDraftInput,
  purchaseDraftInputSchema,
  type PurchaseIdInput,
  purchaseIdInputSchema,
  type PurchaseListQuery,
  purchaseListQuerySchema,
  type PurchasePostInput,
  purchasePostInputSchema,
  type PurchaseUpdateInput,
  purchaseUpdateInputSchema,
} from '@drinks/shared/schemas';
import type { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { storeDayAt, storeDayRange } from '../../core/dates';
import { lockCashboxes, lockPurchase, lockWarehouses } from '../../core/locks';
import { decimalToString, moneyToBigInt, moneyToNumber } from '../../core/money';
import { nextDocNumber } from '../../core/numbering';
import { assertCan } from '../../core/rbac';
import { type Tx, withTransaction } from '../../core/tx';
import { audit, isBackdated } from '../audit';
import { cash } from '../cash';
import { debts } from '../debts';
import { inventory } from '../inventory';
import { warehouses } from '../warehouses';

type DraftValues = z.output<typeof purchaseDraftInputSchema>;

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
} as const satisfies Prisma.PurchaseSelect;

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
      inputPrice: true,
      qty: true,
      lineTotal: true,
      unitCost: true,
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
} as const satisfies Prisma.PurchaseSelect;

type ListRow = Prisma.PurchaseGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.PurchaseGetPayload<{ select: typeof DETAIL_SELECT }>;

/** A line ready for INSERT, computed from the input and the product's current units per block. */
interface ComputedLine {
  lineNo: number;
  productId: string;
  subWarehouseId: string;
  inputUnit: QtyUnit;
  inputQty: number;
  inputPrice: number;
  qty: number;
  lineTotal: number;
  unitCost: string;
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
  lines: Omit<ComputedLine, 'unitCost'>[];
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function toListItem(row: ListRow, lineCount: number): PurchaseListItem {
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

function toLine(row: DetailRow['lines'][number]): PurchaseLine {
  const sub = row.subWarehouse;
  return {
    id: row.id,
    lineNo: row.lineNo,
    product: {
      id: row.product.id,
      name: row.product.name,
      unitsPerBlock: row.product.unitsPerBlock,
      archived: row.product.archivedAt !== null,
    },
    subWarehouse: {
      id: sub.id,
      name: sub.name,
      warehouseName: sub.warehouse.name,
      archived: sub.archivedAt !== null || sub.warehouse.archivedAt !== null,
    },
    inputUnit: row.inputUnit,
    inputQty: row.inputQty,
    inputPrice: moneyToNumber(row.inputPrice),
    qty: row.qty,
    lineTotal: moneyToNumber(row.lineTotal),
    unitCost: decimalToString(row.unitCost),
  };
}

function toDetail(row: DetailRow): PurchaseDetail {
  const { lineCount: _, ...base } = toListItem(row, row.lines.length);
  return {
    ...base,
    docDay: storeDateOf(row.docDate),
    version: row.version,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    postedBy: row.postedBy,
    reversedAt: row.reversedAt,
    reverseReason: row.reverseReason,
    lines: row.lines.map(toLine),
  };
}

/**
 * The form sends a store-zone day (OQ-07). Today → now; a past day → noon of
 * that day (Asia/Tashkent is UTC+5 all year), so the day survives any zone
 * conversion. `keep` is the stored timestamp: an unchanged day keeps it.
 */
function resolveDocDate(day: string, keep?: Date): Date {
  const today = storeToday();
  if (day > today) throw new DomainError(ErrorCode.DOC_DATE_IN_FUTURE);
  if (keep && storeDateOf(keep) === day) return keep;
  return day === today ? new Date() : storeDayAt(day, '12:00:00');
}

/**
 * Products must be the organization's and active, sub-warehouses the store's
 * and active (business-logic §4.1 step 2, also for purchases). BLOCK lines
 * convert with the product's current units per block; posting re-checks it
 * (UNITS_PER_BLOCK_CHANGED, OQ-06).
 */
async function computeLines(
  tx: Tx,
  ctx: ServiceContext,
  lines: DraftValues['lines'],
): Promise<ComputedLine[]> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const rows = await tx.product.findMany({
    where: { id: { in: productIds }, organizationId: ctx.organizationId },
    select: { id: true, name: true, unitsPerBlock: true, archivedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of productIds) {
    const product = byId.get(id);
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'product' });
    if (product.archivedAt) {
      throw new DomainError(ErrorCode.ENTITY_ARCHIVED, { entity: 'product', name: product.name });
    }
  }
  await warehouses.resolveActive(
    tx,
    ctx,
    lines.map((line) => line.subWarehouseId),
  );

  return lines.map((line, index) => {
    const { unitsPerBlock } = byId.get(line.productId)!;
    const qty = line.inputUnit === QtyUnit.BLOCK ? line.inputQty * unitsPerBlock : line.inputQty;
    const lineTotal = line.inputQty * line.inputPrice;
    if (!Number.isSafeInteger(qty)) throw new RangeError(`Line qty overflow: ${qty}`);
    return {
      lineNo: index + 1,
      productId: line.productId,
      subWarehouseId: line.subWarehouseId,
      inputUnit: line.inputUnit,
      inputQty: line.inputQty,
      inputPrice: line.inputPrice,
      qty,
      lineTotal,
      unitCost: unitCostOf(lineTotal, qty),
    };
  });
}

function headerData(values: DraftValues, docDate: Date, lines: readonly ComputedLine[]) {
  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);
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
    inputPrice: moneyToBigInt(line.inputPrice),
    qty: line.qty,
    lineTotal: moneyToBigInt(line.lineTotal),
    unitCost: line.unitCost,
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
    lines: lines.map(({ unitCost: _, ...line }) => line),
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
      inputPrice: moneyToNumber(line.inputPrice),
      qty: line.qty,
      lineTotal: moneyToNumber(line.lineTotal),
    })),
  };
}

async function loadDetail(db: Tx, ctx: ServiceContext, id: string): Promise<DetailRow> {
  const row = await db.purchase.findFirst({
    where: { id, storeId: ctx.storeId },
    select: DETAIL_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'purchase' });
  return row;
}

/**
 * §2 step 1: locks the document, then checks it is still the draft the user
 * loaded — another status → DOCUMENT_NOT_DRAFT, another version → DOCUMENT_CHANGED.
 */
async function lockDraft(tx: Tx, ctx: ServiceContext, id: string, version: number) {
  const locked = await lockPurchase(tx, ctx.storeId, id);
  if (locked.status !== DocStatus.DRAFT) throw new DomainError(ErrorCode.DOCUMENT_NOT_DRAFT);
  if (locked.version !== version) throw new DomainError(ErrorCode.DOCUMENT_CHANGED);
  return locked;
}

/** Newest first; filters by status, store-zone date range and part of the number. */
async function list(ctx: ServiceContext, query: PurchaseListQuery = {}): Promise<PurchaseListPage> {
  assertCan(ctx.user, 'purchase.write');
  const { status, from, to, q, page = 1 } = parse(purchaseListQuerySchema, query);
  const { prisma } = await import('@drinks/db');
  const docDate = storeDayRange(from, to);
  const where: Prisma.PurchaseWhereInput = {
    storeId: ctx.storeId,
    ...(status && { status }),
    ...(docDate && { docDate }),
    ...(q && { number: { contains: q, mode: 'insensitive' } }),
  };
  const [total, rows] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      select: { ...LIST_SELECT, _count: { select: { lines: true } } },
      orderBy: [{ docDate: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * PURCHASE_PAGE_SIZE,
      take: PURCHASE_PAGE_SIZE,
    }),
  ]);
  return {
    items: rows.map(({ _count, ...row }) => toListItem(row, _count.lines)),
    total,
    page,
    pageSize: PURCHASE_PAGE_SIZE,
  };
}

/** One purchase of the store with its lines; NOT_FOUND otherwise. */
async function get(ctx: ServiceContext, input: PurchaseIdInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'purchase.write');
  const { id } = parse(purchaseIdInputSchema, input);
  const { prisma } = await import('@drinks/db');
  return toDetail(await loadDetail(prisma, ctx, id));
}

/** New draft with the next P-number (§2 step 3; a rolled-back create leaves a gap). */
async function create(ctx: ServiceContext, input: PurchaseDraftInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'purchase.write');
  assertCan(ctx.user, 'document.paymentSplit.write');
  const values = parse(purchaseDraftInputSchema, input);
  const docDate = resolveDocDate(values.docDate);

  return withTransaction(async (tx) => {
    const lines = await computeLines(tx, ctx, values.lines);
    const header = headerData(values, docDate, lines);
    const number = await nextDocNumber(tx, ctx.storeId, DocType.PURCHASE);
    const { id } = await tx.purchase.create({
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
      entityType: 'purchase',
      entityId: id,
      after: snapshot(number, header, lines),
      backdated: isBackdated(docDate),
    });
    return toDetail(await loadDetail(tx, ctx, id));
  });
}

/** Replaces the draft's header and lines; version + 1 (OQ-14: any user's draft). */
async function update(ctx: ServiceContext, input: PurchaseUpdateInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'purchase.write');
  assertCan(ctx.user, 'document.paymentSplit.write');
  const { id, version, ...values } = parse(purchaseUpdateInputSchema, input);

  return withTransaction(async (tx) => {
    await lockDraft(tx, ctx, id, version);
    const before = await loadDetail(tx, ctx, id);
    const docDate = resolveDocDate(values.docDate, before.docDate);
    const lines = await computeLines(tx, ctx, values.lines);
    const header = headerData(values, docDate, lines);

    await tx.purchaseLine.deleteMany({ where: { purchaseId: id } });
    await tx.purchase.update({
      where: { id },
      data: {
        ...header,
        version: { increment: 1 },
        lines: { create: lines.map(lineData) },
      },
    });
    await audit.log(tx, ctx, {
      action: 'UPDATE',
      entityType: 'purchase',
      entityId: id,
      before: snapshotOf(before),
      after: snapshot(before.number, header, lines),
      backdated: isBackdated(docDate),
    });
    return toDetail(await loadDetail(tx, ctx, id));
  });
}

/** Deletes a draft and its lines (database §6.3); its number stays unused. */
async function remove(ctx: ServiceContext, input: PurchaseDeleteInput): Promise<void> {
  assertCan(ctx.user, 'purchase.write');
  const { id, version } = parse(purchaseDeleteInputSchema, input);

  await withTransaction(async (tx) => {
    await lockDraft(tx, ctx, id, version);
    const before = await loadDetail(tx, ctx, id);
    await tx.purchase.delete({ where: { id } });
    await audit.log(tx, ctx, {
      action: 'DELETE',
      entityType: 'purchase',
      entityId: id,
      before: snapshotOf(before),
    });
  });
}

// ── Posting (T-405, BR-4, business-logic §5.2) ───────────────────────────

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
      lineTotal: true,
      unitCost: true,
      product: { select: { name: true, unitsPerBlock: true, archivedAt: true } },
    },
  },
} as const satisfies Prisma.PurchaseSelect;

type PostRow = Prisma.PurchaseGetPayload<{ select: typeof POST_SELECT }>;

/**
 * Products must still be active, and a BLOCK line must still hold
 * inputQty × the product's current units per block (OQ-06); otherwise the
 * user re-saves the draft, which recomputes the pieces.
 */
function assertProductsUnchanged(lines: PostRow['lines']): void {
  for (const line of lines) {
    if (line.product.archivedAt !== null) {
      throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
        entity: 'product',
        name: line.product.name,
      });
    }
  }
  const changed = lines.filter(
    (line) =>
      line.inputUnit === QtyUnit.BLOCK && line.qty !== line.inputQty * line.product.unitsPerBlock,
  );
  if (changed.length > 0) {
    throw new DomainError(ErrorCode.UNITS_PER_BLOCK_CHANGED, {
      lines: changed.map((line) => ({
        lineNo: line.lineNo,
        productId: line.productId,
        product: line.product.name,
        qty: line.qty,
        unitsPerBlock: line.product.unitsPerBlock,
      })),
    });
  }
}

/**
 * Posts a draft (BR-4): goods enter the chosen sub-warehouses, the average
 * cost is recalculated (BR-6), the cash and card parts leave their cashboxes
 * and the credit part opens a PAYABLE debt — one transaction, locks in
 * business-logic §2 order, audit POST. Both roles may post (OQ-02); errors
 * carry no cashbox amounts (CLAUDE.md rule 6).
 */
async function post(ctx: ServiceContext, input: PurchasePostInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'purchase.post');
  const { id, version } = parse(purchasePostInputSchema, input);

  return withTransaction(async (tx) => {
    // 1. The document: still the draft the user saw.
    await lockDraft(tx, ctx, id, version);
    const doc: PostRow = await tx.purchase.findUniqueOrThrow({
      where: { id },
      select: POST_SELECT,
    });
    const totalAmount = moneyToNumber(doc.totalAmount);
    const paidCash = moneyToNumber(doc.paidCash);
    const paidCard = moneyToNumber(doc.paidCard);
    const paidCredit = moneyToNumber(doc.paidCredit);

    // 3. Header rules need no further lock, so they fail first (OQ-19: before other work).
    if (paidCash + paidCard + paidCredit !== totalAmount) {
      throw new DomainError(ErrorCode.PAYMENT_SPLIT_MISMATCH);
    }
    if (paidCredit > 0 && !doc.note?.trim()) throw new DomainError(ErrorCode.NOTE_REQUIRED);
    if (doc.docDate.getTime() > Date.now()) throw new DomainError(ErrorCode.DOC_DATE_IN_FUTURE);

    // 2. Warehouses FOR SHARE, then the stock-count block (BR-8, §3) and the
    //    archive state under that lock (§9c). A sub-warehouse never changes its
    //    warehouse, so the first resolveActive may run before the lock.
    const subWarehouseIds = doc.lines.map((line) => line.subWarehouseId);
    const warehouseIds = [
      ...new Set((await warehouses.resolveActive(tx, ctx, subWarehouseIds)).values()),
    ];
    await lockWarehouses(tx, ctx.storeId, warehouseIds);
    await warehouses.assertNoOpenStockCount(tx, ctx, warehouseIds);
    await warehouses.resolveActive(tx, ctx, subWarehouseIds);
    assertProductsUnchanged(doc.lines);

    // 4. Cashboxes of the paid parts. cash.record re-checks the balance; this
    //    pre-check just fails before any stock moves. No amounts in the error.
    const paid = [
      { type: CashboxType.CASH, amount: paidCash },
      { type: CashboxType.CARD, amount: paidCard },
    ].filter((part) => part.amount > 0);
    const locked = await lockCashboxes(
      tx,
      ctx.storeId,
      paid.map((part) => part.type),
    );
    const cashboxes = new Map(locked.map((box) => [box.type, box]));
    for (const part of paid) {
      if (cashboxes.get(part.type)!.balance < part.amount) {
        throw new DomainError(ErrorCode.CASHBOX_INSUFFICIENT, { cashbox: part.type });
      }
    }

    // 5–6. Stock and average cost per product (inventory takes locks 6–7 itself).
    const movements = await inventory.receive(tx, ctx, {
      type: MovementType.PURCHASE,
      docDate: doc.docDate,
      lines: doc.lines.map((line) => ({
        subWarehouseId: line.subWarehouseId,
        productId: line.productId,
        qty: line.qty,
        unitCost: decimalToString(line.unitCost),
        costAmount: moneyToNumber(line.lineTotal),
        purchaseLineId: line.id,
      })),
    });

    // 7. Cash OUT for the cash and card parts.
    const cashTransactionIds: string[] = [];
    for (const part of paid) {
      const entry = await cash.record(tx, ctx, cashboxes.get(part.type)!, {
        type: CashTxType.PURCHASE_PAYMENT,
        amount: part.amount,
        txDate: doc.docDate,
        note: doc.note,
        purchaseId: id,
      });
      cashTransactionIds.push(entry.id.toString());
    }

    // 8. Credit part → PAYABLE debt; its note is the document note (OQ-19).
    const debt =
      paidCredit > 0
        ? await debts.open(tx, ctx, {
            source: DebtSource.PURCHASE,
            purchaseId: id,
            amount: paidCredit,
            note: doc.note ?? '',
            debtDate: doc.docDate,
          })
        : null;

    // 9. Status, then audit POST (costs are fine here: audit is OWNER-only).
    const postedAt = new Date();
    await tx.purchase.update({
      where: { id },
      data: {
        status: DocStatus.POSTED,
        postedAt,
        postedById: ctx.user.id,
        version: { increment: 1 },
      },
      select: { id: true },
    });
    await audit.log(tx, ctx, {
      action: 'POST',
      entityType: 'purchase',
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
        movements: movements.map((movement, index) => ({
          lineNo: doc.lines[index]!.lineNo,
          productId: movement.productId,
          subWarehouseId: movement.subWarehouseId,
          qty: movement.qtyDelta,
          unitCost: movement.unitCost,
          avgCostBefore: movement.avgCostBefore,
          avgCostAfter: movement.avgCostAfter,
        })),
        cashTransactionIds,
        debtId: debt?.id ?? null,
      },
      backdated: isBackdated(doc.docDate),
    });
    return toDetail(await loadDetail(tx, ctx, id));
  });
}

export const purchases = { list, get, create, update, remove, post };
