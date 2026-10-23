// Debt actions of the debts screen (T-704, FR-7.1–7.2, business-logic §7):
// give / take a debt by hand and repay any debt. OWNER only (`debt.write`) —
// STAFF gets FORBIDDEN (CLAUDE.md rule 6). Each is one transaction with the
// locks of business-logic §2 (cashbox → debt); the writes themselves are
// debts.open / debts.repay, cash moves only through cash.record.
import { DebtSource, DomainError, ErrorCode, storeDateOf, parseInput } from '@drinks/shared';
import {
  type DebtOpenInput,
  debtOpenInputSchema,
  type DebtRepayInput,
  debtRepayInputSchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { resolveStoreDate } from '../../core/dates';
import { lockCashboxes, lockDebt } from '../../core/locks';
import { assertCan } from '../../core/rbac';
import { withTransaction } from '../../core/tx';
import * as debts from './debts.service';

/**
 * Debt given (RECEIVABLE: DEBT_GIVEN, cash OUT — the cashbox must cover it)
 * or taken (PAYABLE: DEBT_TAKEN, cash IN). Blank note → NOTE_REQUIRED.
 */
async function open(ctx: ServiceContext, input: DebtOpenInput): Promise<{ id: string }> {
  assertCan(ctx.user, 'debt.write');
  const values = parseInput(debtOpenInputSchema, input);
  const debtDate = resolveStoreDate(values.date);

  return withTransaction(async (tx) => {
    const [cashbox] = await lockCashboxes(tx, ctx.storeId, [values.cashbox]);
    const debt = await debts.open(tx, ctx, {
      source: DebtSource.MANUAL,
      direction: values.direction,
      cashbox: cashbox!,
      amount: values.amount,
      note: values.note,
      debtDate,
    });
    return { id: debt.id };
  });
}

/**
 * Repays any OPEN debt (manual or credit document) through the cashbox the
 * user picks (FR-7.2). A repayment dated before its debt is refused (OQ-27).
 */
async function repay(
  ctx: ServiceContext,
  input: DebtRepayInput,
): Promise<Awaited<ReturnType<typeof debts.repay>>> {
  assertCan(ctx.user, 'debt.write');
  const values = parseInput(debtRepayInputSchema, input);
  const repaidAt = resolveStoreDate(values.date);

  return withTransaction(async (tx) => {
    const [cashbox] = await lockCashboxes(tx, ctx.storeId, [values.cashbox]);
    const debt = await lockDebt(tx, ctx.storeId, values.debtId);
    const { debtDate } = await tx.debt.findUniqueOrThrow({
      where: { id: debt.id },
      select: { debtDate: true },
    });
    if (values.date < storeDateOf(debtDate)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { reason: 'BEFORE_DEBT_DATE' },
        { date: ['before debt date'] },
      );
    }
    return debts.repay(tx, ctx, debt, {
      cashbox: cashbox!,
      amount: values.amount,
      note: values.note,
      repaidAt,
    });
  });
}

export const debtCommands = { open, repay };
