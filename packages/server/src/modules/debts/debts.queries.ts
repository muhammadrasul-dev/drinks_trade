// Debt read side (T-704, FR-7.1): the debts list with repayments and the open
// balances. Confidential — OWNER only (`debt.read`, architecture §5.5); STAFF
// gets FORBIDDEN here, not just a hidden menu item (CLAUDE.md rule 6).
import type { Prisma } from '@drinks/db';
import {
  DebtDirection,
  type DebtListItem,
  type DebtListPage,
  DebtStatus,
  type DebtTotals,
  validationError,
} from '@drinks/shared';
import { DEBT_PAGE_SIZE, type DebtListQuery, debtListQuerySchema } from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { storeDayRange } from '../../core/dates';
import { moneyToNumber } from '../../core/money';
import { assertCan } from '../../core/rbac';

const author = { select: { id: true, fullName: true } } as const;

const LIST_SELECT = {
  id: true,
  direction: true,
  source: true,
  status: true,
  amount: true,
  repaidAmount: true,
  note: true,
  debtDate: true,
  createdAt: true,
  sale: { select: { id: true, number: true } },
  purchase: { select: { id: true, number: true } },
  createdBy: author,
  repayments: {
    orderBy: [{ repaidAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      amount: true,
      repaidAt: true,
      note: true,
      cashTransaction: { select: { cashbox: { select: { type: true } } } },
      createdBy: author,
    },
  },
} as const satisfies Prisma.DebtSelect;

type ListRow = Prisma.DebtGetPayload<{ select: typeof LIST_SELECT }>;

function toItem(row: ListRow): DebtListItem {
  const amount = moneyToNumber(row.amount);
  const repaidAmount = moneyToNumber(row.repaidAmount);
  return {
    id: row.id,
    direction: row.direction,
    source: row.source,
    status: row.status,
    amount,
    repaidAmount,
    remaining: amount - repaidAmount,
    note: row.note,
    debtDate: row.debtDate,
    createdAt: row.createdAt,
    sale: row.sale,
    purchase: row.purchase,
    createdBy: row.createdBy,
    repayments: row.repayments.map((repayment) => ({
      id: repayment.id,
      amount: moneyToNumber(repayment.amount),
      repaidAt: repayment.repaidAt,
      cashbox: repayment.cashTransaction.cashbox.type,
      note: repayment.note,
      createdBy: repayment.createdBy,
    })),
  };
}

/**
 * The store's debts, newest debt date first (ties: newest row first),
 * filtered by direction, status, source, store-zone day range of debt_date
 * and a note substring (the note stands in for the counterparty, BR-10).
 */
async function list(ctx: ServiceContext, query: DebtListQuery = {}): Promise<DebtListPage> {
  assertCan(ctx.user, 'debt.read');
  const parsed = debtListQuerySchema.safeParse(query);
  if (!parsed.success) throw validationError(parsed.error);
  const { direction, status, source, from, to, search, page = 1 } = parsed.data;
  const { prisma } = await import('@drinks/db');
  const debtDate = storeDayRange(from, to);
  const where: Prisma.DebtWhereInput = {
    storeId: ctx.storeId,
    ...(direction && { direction }),
    ...(status && { status }),
    ...(source && { source }),
    ...(debtDate && { debtDate }),
    ...(search && { note: { contains: search, mode: 'insensitive' } }),
  };
  const [total, rows] = await Promise.all([
    prisma.debt.count({ where }),
    prisma.debt.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ debtDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * DEBT_PAGE_SIZE,
      take: DEBT_PAGE_SIZE,
    }),
  ]);
  return { items: rows.map(toItem), total, page, pageSize: DEBT_PAGE_SIZE };
}

/** Σ remaining (amount − repaid) of the store's OPEN debts by direction, regardless of filters. */
async function totals(ctx: ServiceContext): Promise<DebtTotals> {
  assertCan(ctx.user, 'debt.read');
  const { prisma } = await import('@drinks/db');
  const sums = await prisma.debt.groupBy({
    by: ['direction'],
    where: { storeId: ctx.storeId, status: DebtStatus.OPEN },
    _sum: { amount: true, repaidAmount: true },
  });
  const remainingOf = (direction: DebtDirection) => {
    const row = sums.find((sum) => sum.direction === direction);
    return moneyToNumber((row?._sum.amount ?? 0n) - (row?._sum.repaidAmount ?? 0n));
  };
  return {
    receivable: remainingOf(DebtDirection.RECEIVABLE),
    payable: remainingOf(DebtDirection.PAYABLE),
  };
}

export const debtQueries = { list, totals };
