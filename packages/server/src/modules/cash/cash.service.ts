// Cash core (T-402, business-logic §7, BR-9): the single write path for
// cashbox.balance and cash_transaction. Internal service — callers (posting,
// reversals, manual cash entries, debts) check permissions themselves and
// call record() inside their own transaction, after lockCashboxes().
import { CashboxType, CashDirection, CashTxType, DomainError, ErrorCode } from '@drinks/shared';

import type { ServiceContext } from '../../core/context';
import { type LockedCashbox, lockCashboxes } from '../../core/locks';
import { moneyToBigInt, moneyToNumber } from '../../core/money';
import type { Tx } from '../../core/tx';
import { audit } from '../audit';

/** Fixed direction of every type except MANUAL_REVERSAL (database.md, CashTxType). */
export const CASH_TX_DIRECTION = {
  SALE_RECEIPT: CashDirection.IN,
  SALE_REFUND: CashDirection.OUT,
  PURCHASE_PAYMENT: CashDirection.OUT,
  PURCHASE_REFUND: CashDirection.IN,
  DEBT_TAKEN: CashDirection.IN,
  DEBT_GIVEN: CashDirection.OUT,
  DEBT_REPAID_BY_ME: CashDirection.OUT,
  DEBT_REPAID_TO_ME: CashDirection.IN,
  TRAVEL_EXPENSE: CashDirection.OUT,
  OTHER_EXPENSE: CashDirection.OUT,
  TRANSFER_OUT: CashDirection.OUT,
  TRANSFER_IN: CashDirection.IN,
} as const satisfies Record<Exclude<CashTxType, 'MANUAL_REVERSAL'>, CashDirection>;

interface CashRecordBase {
  /** Whole so'm, > 0. */
  amount: number;
  /** Report date; defaults to now. Callers validate it (OQ-07). */
  txDate?: Date;
  note?: string | null;
  saleId?: string;
  purchaseId?: string;
  debtId?: string;
  transferGroupId?: string;
}

export type CashRecordInput = CashRecordBase &
  (
    | { type: keyof typeof CASH_TX_DIRECTION }
    /** OQ-08: the opposite direction of the reversed entry. */
    | { type: 'MANUAL_REVERSAL'; direction: CashDirection; reversalOfId: bigint }
  );

export interface CashRecordResult {
  id: bigint;
  direction: CashDirection;
  balanceAfter: number;
}

/**
 * Books one cash_transaction on a cashbox locked by lockCashboxes() in this
 * transaction and moves its balance. OUT never takes the balance below zero:
 * CASHBOX_INSUFFICIENT carries only the cashbox type, never an amount, since
 * STAFF can hit it while posting (OQ-02, CLAUDE.md rule 6). The caller's
 * transaction must roll back on that error.
 */
export async function record(
  tx: Tx,
  ctx: ServiceContext,
  cashbox: Pick<LockedCashbox, 'id' | 'type'>,
  input: CashRecordInput,
): Promise<CashRecordResult> {
  // NaN fails `> 0` too; fractions are rejected by moneyToBigInt.
  if (!(input.amount > 0)) {
    throw new RangeError(`Cash amount must be positive, got ${input.amount}`);
  }
  const amount = moneyToBigInt(input.amount);
  const note = input.note?.trim() || null;
  if (input.type === CashTxType.OTHER_EXPENSE && note === null) {
    throw new DomainError(ErrorCode.NOTE_REQUIRED);
  }
  const direction =
    input.type === CashTxType.MANUAL_REVERSAL ? input.direction : CASH_TX_DIRECTION[input.type];
  const delta = direction === CashDirection.IN ? amount : -amount;

  // The row is already locked (step 4), so this read-modify-write is safe;
  // the balance guard keeps OUT from reaching the DB CHECK (balance >= 0).
  const rows = await tx.$queryRaw<{ balance: bigint }[]>`
    UPDATE cashbox SET balance = balance + ${delta}, updated_at = now()
    WHERE id = ${cashbox.id}::uuid AND store_id = ${ctx.storeId}::uuid
      AND balance + ${delta} >= 0
    RETURNING balance`;
  const updated = rows[0];
  if (!updated) throw new DomainError(ErrorCode.CASHBOX_INSUFFICIENT, { cashbox: cashbox.type });

  const created = await tx.cashTransaction.create({
    data: {
      storeId: ctx.storeId,
      cashboxId: cashbox.id,
      direction,
      type: input.type,
      amount,
      balanceAfter: updated.balance,
      txDate: input.txDate ?? new Date(),
      note,
      saleId: input.saleId ?? null,
      purchaseId: input.purchaseId ?? null,
      debtId: input.debtId ?? null,
      transferGroupId: input.transferGroupId ?? null,
      reversalOfId: input.type === CashTxType.MANUAL_REVERSAL ? input.reversalOfId : null,
      createdById: ctx.user.id,
    },
    select: { id: true },
  });

  await audit.log(tx, ctx, {
    action: 'CREATE',
    entityType: 'cash_transaction',
    entityId: created.id.toString(),
    after: {
      cashboxId: cashbox.id,
      direction,
      type: input.type,
      amount,
      balanceAfter: updated.balance,
    },
  });

  return { id: created.id, direction, balanceAfter: moneyToNumber(updated.balance) };
}

/** The entry being reversed, as read from cash_transaction. */
export interface ReversedCashEntry {
  id: bigint;
  direction: CashDirection;
  amount: bigint;
}

/**
 * Books the MANUAL_REVERSAL of `original` (OQ-08) on its cashbox, locked by the
 * caller: same amount, opposite direction, reversal_of_id → original. Reversing
 * an IN is a cash OUT and can throw CASHBOX_INSUFFICIENT. reversal_of_id is
 * unique, so a second reversal of the same entry cannot commit.
 */
export function reverse(
  tx: Tx,
  ctx: ServiceContext,
  cashbox: Pick<LockedCashbox, 'id' | 'type'>,
  original: ReversedCashEntry,
  options: Omit<CashRecordBase, 'amount'> = {},
): Promise<CashRecordResult> {
  return record(tx, ctx, cashbox, {
    ...options,
    type: CashTxType.MANUAL_REVERSAL,
    direction: original.direction === CashDirection.IN ? CashDirection.OUT : CashDirection.IN,
    amount: moneyToNumber(original.amount),
    reversalOfId: original.id,
  });
}

// ── Paid parts of a document (sale/purchase posting and reversal) ─────────

/** The cash or card part of a document's payment split, whole so'm > 0. */
export interface PaidPart {
  type: CashboxType;
  amount: number;
}

export interface LockedPaidParts {
  /** CASH then CARD, only the parts > 0. */
  parts: PaidPart[];
  cashboxes: ReadonlyMap<CashboxType, LockedCashbox>;
}

/**
 * Lock step 4 (business-logic §2) for a document's cash and card parts. When
 * the money goes OUT (purchase posting, sale reversal) each part must fit its
 * cashbox: record() re-checks, but this fails before any stock moves.
 * CASHBOX_INSUFFICIENT carries only the cashbox type (OQ-02, CLAUDE.md rule 6).
 */
export async function lockPaidParts(
  tx: Tx,
  ctx: ServiceContext,
  paid: { paidCash: number; paidCard: number },
  direction: CashDirection,
): Promise<LockedPaidParts> {
  const parts = [
    { type: CashboxType.CASH, amount: paid.paidCash },
    { type: CashboxType.CARD, amount: paid.paidCard },
  ].filter((part) => part.amount > 0);
  const locked = await lockCashboxes(
    tx,
    ctx.storeId,
    parts.map((part) => part.type),
  );
  const cashboxes = new Map(locked.map((box) => [box.type, box]));
  if (direction === CashDirection.OUT) {
    for (const part of parts) {
      if (cashboxes.get(part.type)!.balance < part.amount) {
        throw new DomainError(ErrorCode.CASHBOX_INSUFFICIENT, { cashbox: part.type });
      }
    }
  }
  return { parts, cashboxes };
}

/** Books one entry per part locked by lockPaidParts(); returns their ids as strings (audit). */
export async function recordPaidParts(
  tx: Tx,
  ctx: ServiceContext,
  { parts, cashboxes }: LockedPaidParts,
  entry: Omit<CashRecordBase, 'amount'> & { type: keyof typeof CASH_TX_DIRECTION },
): Promise<string[]> {
  const ids: string[] = [];
  for (const part of parts) {
    const result = await record(tx, ctx, cashboxes.get(part.type)!, {
      ...entry,
      amount: part.amount,
    });
    ids.push(result.id.toString());
  }
  return ids;
}
