// Purchases (FR-4.1–4.2, business-logic §5): drafts (T-404), posting
// (T-405) and reversal (T-406). A draft does not touch stock or cash; posting
// moves stock and the average cost (inventory), cash (cash) and opens the
// credit debt (debts) in one transaction, and reversal undoes all three. Any user may edit any draft (OQ-14); concurrent edits are
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
  type PurchaseDetail,
  type PurchaseLine,
  type PurchaseListItem,
  type PurchaseListPage,
  MovementType,
  storeDateOf,
  unitCostOf,
  parseInput,
  paymentSum,
  unitPieces,
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
  type PurchaseReverseInput,
  purchaseReverseInputSchema,
  type PurchaseUpdateInput,
  purchaseUpdateInputSchema,
} from '@drinks/shared/schemas';
import type { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { resolveStoreDate, storeDayRange } from '../../core/dates';
import { assertLineProductsUnchanged, loadActiveProducts } from '../../core/doc-lines';
import { lockDebt, lockPurchase } from '../../core/locks';
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
    const { unitsPerBlock } = byId.get(line.productId)!;
    const qty = unitPieces(line.inputUnit, line.inputQty, unitsPerBlock);
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
  const { status, from, to, q, page = 1 } = parseInput(purchaseListQuerySchema, query);
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
  const { id } = parseInput(purchaseIdInputSchema, input);
  const { prisma } = await import('@drinks/db');
  return toDetail(await loadDetail(prisma, ctx, id));
}

/** New draft with the next P-number (§2 step 3; a rolled-back create leaves a gap). */
async function create(ctx: ServiceContext, input: PurchaseDraftInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'purchase.write');
  assertCan(ctx.user, 'document.paymentSplit.write');
  const values = parseInput(purchaseDraftInputSchema, input);
  const docDate = resolveStoreDate(values.docDate);

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
  const { id, version, ...values } = parseInput(purchaseUpdateInputSchema, input);

  return withTransaction(async (tx) => {
    await lockDraft(tx, ctx, id, version);
    const before = await loadDetail(tx, ctx, id);
    const docDate = resolveStoreDate(values.docDate, before.docDate);
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
  const { id, version } = parseInput(purchaseDeleteInputSchema, input);

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
 * Posts a draft (BR-4): goods enter the chosen sub-warehouses, the average
 * cost is recalculated (BR-6), the cash and card parts leave their cashboxes
 * and the credit part opens a PAYABLE debt — one transaction, locks in
 * business-logic §2 order, audit POST. Both roles may post (OQ-02); errors
 * carry no cashbox amounts (CLAUDE.md rule 6).
 */
async function post(ctx: ServiceContext, input: PurchasePostInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'purchase.post');
  const { id, version } = parseInput(purchasePostInputSchema, input);

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
    assertLineProductsUnchanged(doc.lines);

    // 4. Cashboxes of the paid parts; money goes OUT, so each part must fit
    //    (CASHBOX_INSUFFICIENT before any stock moves, no amounts in the error).
    const paid = await cash.lockPaidParts(tx, ctx, { paidCash, paidCard }, CashDirection.OUT);

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
    const cashTransactionIds = await cash.recordPaidParts(tx, ctx, paid, {
      type: CashTxType.PURCHASE_PAYMENT,
      txDate: doc.docDate,
      note: doc.note,
      purchaseId: id,
    });

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
        movements: inventory.auditMovements(movements, doc.lines),
        cashTransactionIds,
        debtId: debt?.id ?? null,
      },
      backdated: isBackdated(doc.docDate),
    });
    return toDetail(await loadDetail(tx, ctx, id));
  });
}

// ── Reversal (T-406, BR-3, business-logic §5.3) ──────────────────────────

const REVERSE_SELECT = {
  number: true,
  docDate: true,
  paidCash: true,
  paidCard: true,
  paidCredit: true,
  debt: { select: { id: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      id: true,
      lineNo: true,
      productId: true,
      subWarehouseId: true,
      qty: true,
      lineTotal: true,
      unitCost: true,
    },
  },
} as const satisfies Prisma.PurchaseSelect;

/**
 * Reverses a posted purchase (BR-3): its goods leave the sub-warehouses at
 * their purchase cost and the average is recalculated with the 0 floor
 * (OQ-09), the paid parts come back to their cashboxes (PURCHASE_REFUND) and
 * the credit debt is cancelled — blocked while the debt has repayments
 * (OQ-04) or the goods are no longer in stock (sold first: reverse that sale).
 * OWNER only (OQ-03); one transaction, locks in business-logic §2 order,
 * audit REVERSE with the reason. Entries carry the document date (OQ-26).
 */
async function reverse(ctx: ServiceContext, input: PurchaseReverseInput): Promise<PurchaseDetail> {
  assertCan(ctx.user, 'document.reverse');
  const { id, reason } = parseInput(purchaseReverseInputSchema, input);

  return withTransaction(async (tx) => {
    // 1. The document: only a posted one can be reversed.
    const locked = await lockPurchase(tx, ctx.storeId, id);
    if (locked.status !== DocStatus.POSTED) throw new DomainError(ErrorCode.DOCUMENT_NOT_POSTED);
    const doc = await tx.purchase.findUniqueOrThrow({ where: { id }, select: REVERSE_SELECT });
    const paidCash = moneyToNumber(doc.paidCash);
    const paidCard = moneyToNumber(doc.paidCard);

    // 2. Warehouses FOR SHARE and the stock-count block (BR-8, §3). Archived
    //    sub-warehouses are not an error: one holding these goods cannot be
    //    archived (FR-2.2), so step 6 reports it as short of stock.
    await warehouses.lockForPosting(
      tx,
      ctx,
      doc.lines.map((line) => line.subWarehouseId),
      { requireActive: false },
    );

    // 4. Cashboxes of the paid parts: money comes back IN, so no balance check.
    const paid = await cash.lockPaidParts(tx, ctx, { paidCash, paidCard }, CashDirection.IN);

    // 3/5. The credit debt (§2 step 5, after the cashboxes): cancelled here so
    //      DEBT_HAS_REPAYMENTS (OQ-04) fails before any stock moves.
    const debtId = doc.debt?.id ?? null;
    if (debtId) await debts.cancel(tx, ctx, await lockDebt(tx, ctx.storeId, debtId));

    // 5–7. Goods leave at their purchase cost; PURCHASE_REVERSAL_INSUFFICIENT_STOCK
    //      (BR-3) if some were sold. Inventory takes locks 6–7 itself.
    const movements = await inventory.issue(tx, ctx, {
      type: MovementType.PURCHASE_REVERSAL,
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

    // 8. Cash IN for the parts paid at posting.
    const cashTransactionIds = await cash.recordPaidParts(tx, ctx, paid, {
      type: CashTxType.PURCHASE_REFUND,
      txDate: doc.docDate,
      note: reason,
      purchaseId: id,
    });

    // 9. Status, then audit REVERSE (costs are fine here: audit is OWNER-only).
    const reversedAt = new Date();
    await tx.purchase.update({
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
      entityType: 'purchase',
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
    return toDetail(await loadDetail(tx, ctx, id));
  });
}

export const purchases = { list, get, create, update, remove, post, reverse };
