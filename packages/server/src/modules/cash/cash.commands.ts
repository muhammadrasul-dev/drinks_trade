// Manual cash actions of the cash screen (T-702, FR-6.2–6.3, BR-9,
// business-logic §7): travel expense, other expense and the CASH ↔ CARD
// transfer. OWNER only (`cash.write`) — STAFF gets FORBIDDEN (CLAUDE.md
// rule 6). Each is one transaction: lockCashboxes (§2, step 4) → cash.record,
// which moves the balance, refuses to go below zero and writes the audit row.
import { randomUUID } from 'node:crypto';

import { CashTxType, parseInput } from '@drinks/shared';
import {
  type CashExpenseInput,
  cashExpenseInputSchema,
  type CashTransferInput,
  cashTransferInputSchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { resolveStoreDate } from '../../core/dates';
import { lockCashboxes } from '../../core/locks';
import { assertCan } from '../../core/rbac';
import { withTransaction } from '../../core/tx';
import * as cash from './cash.service';

type ExpenseType = typeof CashTxType.TRAVEL_EXPENSE | typeof CashTxType.OTHER_EXPENSE;

async function expense(
  ctx: ServiceContext,
  type: ExpenseType,
  input: CashExpenseInput,
): Promise<{ id: string }> {
  assertCan(ctx.user, 'cash.write');
  const values = parseInput(cashExpenseInputSchema, input);
  const txDate = resolveStoreDate(values.date);

  return withTransaction(async (tx) => {
    const [cashbox] = await lockCashboxes(tx, ctx.storeId, [values.cashbox]);
    const entry = await cash.record(tx, ctx, cashbox!, {
      type,
      amount: values.amount,
      note: values.note,
      txDate,
    });
    return { id: entry.id.toString() };
  });
}

/** TRAVEL_EXPENSE, cash OUT; the note is optional. */
function travelExpense(ctx: ServiceContext, input: CashExpenseInput): Promise<{ id: string }> {
  return expense(ctx, CashTxType.TRAVEL_EXPENSE, input);
}

/** OTHER_EXPENSE, cash OUT; a blank note is NOTE_REQUIRED (FR-6.2, from cash.record). */
function otherExpense(ctx: ServiceContext, input: CashExpenseInput): Promise<{ id: string }> {
  return expense(ctx, CashTxType.OTHER_EXPENSE, input);
}

/**
 * Moves money between the two cashboxes (FR-6.3): TRANSFER_OUT on `from`,
 * TRANSFER_IN on `to`, one transfer_group_id and one tx_date. Both cashboxes
 * are locked in a single lockCashboxes call; the OUT goes first, so a short
 * source answers CASHBOX_INSUFFICIENT and the transaction writes nothing.
 * `from === to` fails the schema (VALIDATION_FAILED on `to`).
 */
async function transfer(
  ctx: ServiceContext,
  input: CashTransferInput,
): Promise<{ transferGroupId: string; outId: string; inId: string }> {
  assertCan(ctx.user, 'cash.write');
  const values = parseInput(cashTransferInputSchema, input);
  const txDate = resolveStoreDate(values.date);
  const transferGroupId = randomUUID();

  return withTransaction(async (tx) => {
    const locked = await lockCashboxes(tx, ctx.storeId, [values.from, values.to]);
    const source = locked.find((box) => box.type === values.from)!;
    const target = locked.find((box) => box.type === values.to)!;
    const common = { amount: values.amount, note: values.note, txDate, transferGroupId };
    const out = await cash.record(tx, ctx, source, { type: CashTxType.TRANSFER_OUT, ...common });
    const into = await cash.record(tx, ctx, target, { type: CashTxType.TRANSFER_IN, ...common });
    return { transferGroupId, outId: out.id.toString(), inId: into.id.toString() };
  });
}

export const cashCommands = { travelExpense, otherExpense, transfer };
