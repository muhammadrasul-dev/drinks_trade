// Purchase drafts (T-404, FR-4.1–4.2, business-logic §5.1). A draft does not
// touch stock or cash: posting (T-405) and reversal (T-406) do. Any user may
// edit any draft (OQ-14); concurrent edits are caught by the `version` column.
import type { Prisma } from '@drinks/db';
import {
  DocStatus,
  DocType,
  DomainError,
  ErrorCode,
  type PurchaseDetail,
  type PurchaseLine,
  type PurchaseListItem,
  type PurchaseListPage,
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
  type PurchaseUpdateInput,
  purchaseUpdateInputSchema,
} from '@drinks/shared/schemas';
import type { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { lockPurchase } from '../../core/locks';
import { decimalToString, moneyToBigInt, moneyToNumber } from '../../core/money';
import { nextDocNumber } from '../../core/numbering';
import { assertCan } from '../../core/rbac';
import { type Tx, withTransaction } from '../../core/tx';
import { audit, isBackdated } from '../audit';
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
  return day === today ? new Date() : new Date(`${day}T12:00:00+05:00`);
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

/** Day range [from, to] in the store zone → docDate bounds (UTC+5, see resolveDocDate). */
function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(`${from}T00:00:00+05:00`) }),
    ...(to && { lt: new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 86_400_000) }),
  };
}

/** Newest first; filters by status, store-zone date range and part of the number. */
async function list(ctx: ServiceContext, query: PurchaseListQuery = {}): Promise<PurchaseListPage> {
  assertCan(ctx.user, 'purchase.write');
  const { status, from, to, q, page = 1 } = parse(purchaseListQuerySchema, query);
  const { prisma } = await import('@drinks/db');
  const docDate = dateRange(from, to);
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

export const purchases = { list, get, create, update, remove };
