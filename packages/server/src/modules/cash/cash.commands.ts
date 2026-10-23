// Manual cash actions of the cash screen (T-702, FR-6.2–6.3, BR-9,
// business-logic §7): travel expense, other expense, the CASH ↔ CARD
// transfer and the reversal of those entries (T-703, OQ-08). OWNER only (`cash.write`) — STAFF gets FORBIDDEN (CLAUDE.md
// rule 6). Each is one transaction: lockCashboxes (§2, step 4) → cash.record,
// which moves the balance, refuses to go below zero and writes the audit row.
import { randomUUID } from 'node:crypto';

import { CashTxType, DomainError, ErrorCode, parseInput } from '@drinks/shared';
import {
  type CashExpenseInput,
  cashExpenseInputSchema,
  type CashReverseInput,
  cashReverseInputSchema,
  type CashTransferInput,
  cashTransferInputSchema,
  isReversibleCashTxType,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { resolveStoreDate } from '../../core/dates';
import { lockCashboxes } from '../../core/locks';
import { assertCan } from '../../core/rbac';
import { withTransaction } from '../../core/tx';
import { audit } from '../audit';
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

/**
 * Reverses a manual entry (OQ-08): TRAVEL_EXPENSE, OTHER_EXPENSE, or a transfer
 * — both sides of its transfer_group_id together. Each original gets a
 * MANUAL_REVERSAL with the opposite direction and the original's tx_date
 * (OQ-30: the mistake nets to zero in its own day, like document reversals,
 * OQ-26), and an audit REVERSE row; nothing is deleted. Sale/purchase/debt
 * entries → CASH_TX_NOT_REVERSIBLE (reversed through their document or debt).
 *
 * Locks: only the cashboxes (§2 step 4). The entry is read before locking to
 * learn its cashbox, and re-checked after: every reversal of an entry locks
 * its cashbox, so a concurrent second reversal waits there and then sees the
 * first one → CASH_TX_ALREADY_REVERSED (reversal_of_id is also unique).
 * Reversing an IN (the transfer's target side) can be CASHBOX_INSUFFICIENT;
 * the whole transaction then writes nothing.
 */
async function reverse(
  ctx: ServiceContext,
  input: CashReverseInput,
): Promise<{ reversalIds: string[] }> {
  assertCan(ctx.user, 'cash.write');
  const values = parseInput(cashReverseInputSchema, input);
  const id = BigInt(values.id);

  return withTransaction(async (tx) => {
    const target = await tx.cashTransaction.findFirst({
      where: { id, storeId: ctx.storeId },
      select: { type: true, transferGroupId: true },
    });
    if (!target) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'cash_transaction' });
    if (!isReversibleCashTxType(target.type)) {
      throw new DomainError(ErrorCode.CASH_TX_NOT_REVERSIBLE, { type: target.type });
    }

    // A transfer goes back as a pair: TRANSFER_OUT and TRANSFER_IN of its group.
    const where = target.transferGroupId
      ? {
          storeId: ctx.storeId,
          transferGroupId: target.transferGroupId,
          type: { in: [CashTxType.TRANSFER_OUT, CashTxType.TRANSFER_IN] },
        }
      : { storeId: ctx.storeId, id };
    const select = {
      id: true,
      direction: true,
      amount: true,
      txDate: true,
      cashbox: { select: { type: true } },
    } as const;
    const group = await tx.cashTransaction.findMany({ where, select, orderBy: { id: 'asc' } });

    const locked = await lockCashboxes(
      tx,
      ctx.storeId,
      group.map((entry) => entry.cashbox.type),
    );
    // Read again under the cashbox locks: a reversal committed meanwhile shows up here.
    const reversed = await tx.cashTransaction.count({
      where: { reversalOfId: { in: group.map((entry) => entry.id) } },
    });
    if (reversed > 0) throw new DomainError(ErrorCode.CASH_TX_ALREADY_REVERSED);

    const reversalIds: string[] = [];
    for (const original of group) {
      const cashbox = locked.find((box) => box.type === original.cashbox.type)!;
      const reversal = await cash.reverse(tx, ctx, cashbox, original, {
        txDate: original.txDate,
        note: values.note,
      });
      await audit.log(tx, ctx, {
        action: 'REVERSE',
        entityType: 'cash_transaction',
        entityId: original.id.toString(),
        after: { reversalId: reversal.id, note: values.note ?? null },
      });
      reversalIds.push(reversal.id.toString());
    }
    return { reversalIds };
  });
}

export const cashCommands = { travelExpense, otherExpense, transfer, reverse };
