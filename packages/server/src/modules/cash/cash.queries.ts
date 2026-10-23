// Cash read side (T-701, FR-6.1): cashbox balances and the cash_transaction
// journal. Confidential — OWNER only (`cash.read`, architecture §5.5); STAFF
// gets FORBIDDEN here, not just a hidden menu item (CLAUDE.md rule 6).
// Writes stay in cash.service.ts (`record`).
import type { Prisma } from '@drinks/db';
import {
  type CashboxBalance,
  CashboxType,
  CashDirection,
  type CashJournalEntry,
  type CashJournalPage,
  validationError,
} from '@drinks/shared';
import {
  CASH_JOURNAL_PAGE_SIZE,
  type CashJournalQuery,
  cashJournalQuerySchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { moneyToNumber } from '../../core/money';
import { assertCan } from '../../core/rbac';

const CASHBOX_ORDER = Object.values(CashboxType);

const JOURNAL_SELECT = {
  id: true,
  txDate: true,
  createdAt: true,
  direction: true,
  type: true,
  amount: true,
  balanceAfter: true,
  note: true,
  transferGroupId: true,
  reversalOfId: true,
  cashbox: { select: { id: true, type: true, name: true } },
  sale: { select: { id: true, number: true } },
  purchase: { select: { id: true, number: true } },
  debt: { select: { id: true, direction: true, source: true, note: true } },
  reversedBy: { select: { id: true } },
  createdBy: { select: { id: true, fullName: true } },
} as const satisfies Prisma.CashTransactionSelect;

type JournalRow = Prisma.CashTransactionGetPayload<{ select: typeof JOURNAL_SELECT }>;

function toEntry(row: JournalRow): CashJournalEntry {
  return {
    id: row.id.toString(),
    txDate: row.txDate,
    createdAt: row.createdAt,
    cashbox: row.cashbox,
    type: row.type,
    direction: row.direction,
    amount: moneyToNumber(row.amount),
    balanceAfter: moneyToNumber(row.balanceAfter),
    note: row.note,
    sale: row.sale,
    purchase: row.purchase,
    debt: row.debt,
    transferGroupId: row.transferGroupId,
    reversalOfId: row.reversalOfId?.toString() ?? null,
    reversedById: row.reversedBy?.id.toString() ?? null,
    createdBy: row.createdBy,
  };
}

/**
 * Day range [from, to] in the store zone → tx_date bounds. Asia/Tashkent is
 * UTC+5 all year (same rule as the document lists, business-logic §5.1).
 */
function dayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(`${from}T00:00:00+05:00`) }),
    ...(to && { lt: new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 86_400_000) }),
  };
}

/** Both cashboxes of the store (CASH, then CARD) with their current balance. */
async function balances(ctx: ServiceContext): Promise<CashboxBalance[]> {
  assertCan(ctx.user, 'cash.read');
  const { prisma } = await import('@drinks/db');
  const rows = await prisma.cashbox.findMany({
    where: { storeId: ctx.storeId },
    select: { id: true, type: true, name: true, balance: true, updatedAt: true },
  });
  return rows
    .sort((a, b) => CASHBOX_ORDER.indexOf(a.type) - CASHBOX_ORDER.indexOf(b.type))
    .map((row) => ({ ...row, balance: moneyToNumber(row.balance) }));
}

/**
 * The store's cash journal, newest report date first (ties: newest entry
 * first, OQ-24), filtered by store-zone day range, cashbox, type and
 * direction; `totals` sums every filtered entry, not just the page.
 */
async function journal(
  ctx: ServiceContext,
  query: CashJournalQuery = {},
): Promise<CashJournalPage> {
  assertCan(ctx.user, 'cash.read');
  const parsed = cashJournalQuerySchema.safeParse(query);
  if (!parsed.success) throw validationError(parsed.error);
  const { from, to, cashbox, type, direction, page = 1 } = parsed.data;
  const { prisma } = await import('@drinks/db');
  const txDate = dayRange(from, to);
  const where: Prisma.CashTransactionWhereInput = {
    storeId: ctx.storeId,
    ...(txDate && { txDate }),
    ...(cashbox && { cashbox: { type: cashbox } }),
    ...(type && { type }),
    ...(direction && { direction }),
  };
  const [total, rows, sums] = await Promise.all([
    prisma.cashTransaction.count({ where }),
    prisma.cashTransaction.findMany({
      where,
      select: JOURNAL_SELECT,
      orderBy: [{ txDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * CASH_JOURNAL_PAGE_SIZE,
      take: CASH_JOURNAL_PAGE_SIZE,
    }),
    prisma.cashTransaction.groupBy({ by: ['direction'], where, _sum: { amount: true } }),
  ]);
  const sumOf = (dir: CashDirection) =>
    moneyToNumber(sums.find((row) => row.direction === dir)?._sum.amount ?? 0n);
  return {
    items: rows.map(toEntry),
    total,
    page,
    pageSize: CASH_JOURNAL_PAGE_SIZE,
    totals: { in: sumOf(CashDirection.IN), out: sumOf(CashDirection.OUT) },
  };
}

export const cashQueries = { balances, journal };
