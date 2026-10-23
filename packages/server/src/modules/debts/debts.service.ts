// Debt core (T-403, BR-10, business-logic §7): the single write path that
// opens and cancels debt rows. Internal service — callers (manual cash entries,
// sale/purchase posting and reversal) check permissions, validate input and
// dates (OQ-07) and take the locks of business-logic §2 themselves. Repayments
// (debt_repayment, CLOSED) were added with the debts screen (T-704).
import {
  CashTxType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  DomainError,
  ErrorCode,
} from '@drinks/shared';

import type { ServiceContext } from '../../core/context';
import type { LockedCashbox, LockedDebt } from '../../core/locks';
import { moneyToBigInt } from '../../core/money';
import type { Tx } from '../../core/tx';
import { audit } from '../audit';
import { cash } from '../cash';

/** Cash entry a MANUAL debt is opened with (business-logic §7). */
export const MANUAL_DEBT_CASH_TYPE = {
  RECEIVABLE: CashTxType.DEBT_GIVEN,
  PAYABLE: CashTxType.DEBT_TAKEN,
} as const satisfies Record<DebtDirection, CashTxType>;

/** Direction of a credit (nasiya) debt, fixed by its document (BR-10). */
export const DOCUMENT_DEBT_DIRECTION = {
  SALE: DebtDirection.RECEIVABLE,
  PURCHASE: DebtDirection.PAYABLE,
} as const satisfies Record<Exclude<DebtSource, 'MANUAL'>, DebtDirection>;

type Cashbox = Pick<LockedCashbox, 'id' | 'type'>;

interface DebtOpenBase {
  /** Whole so'm, > 0. */
  amount: number;
  /**
   * BR-10: the note stands in for the counterparty, so it is required for
   * every source (OQ-19: a credit document's note becomes its debt's note).
   */
  note: string;
  /** Defaults to now. Callers validate it (OQ-07). */
  debtDate?: Date;
}

export type DebtOpenInput = DebtOpenBase &
  (
    | {
        /** Debt given (RECEIVABLE, cash OUT) or taken (PAYABLE, cash IN). */
        source: 'MANUAL';
        direction: DebtDirection;
        /** Locked by lockCashboxes() in this transaction. */
        cashbox: Cashbox;
      }
    /** Credit part of a sale being posted: RECEIVABLE, no cash movement. */
    | { source: 'SALE'; saleId: string }
    /** Credit part of a purchase being posted: PAYABLE, no cash movement. */
    | { source: 'PURCHASE'; purchaseId: string }
  );

/** Cash entry of a repayment (business-logic §7). */
export const DEBT_REPAYMENT_CASH_TYPE = {
  RECEIVABLE: CashTxType.DEBT_REPAID_TO_ME,
  PAYABLE: CashTxType.DEBT_REPAID_BY_ME,
} as const satisfies Record<DebtDirection, CashTxType>;

export interface DebtOpenResult {
  id: string;
  direction: DebtDirection;
  /** The DEBT_GIVEN / DEBT_TAKEN entry of a MANUAL debt, else null. */
  cashTransactionId: bigint | null;
}

/**
 * Opens an OPEN debt. A MANUAL debt also books its cash entry through
 * cash.record, so a debt given beyond the cashbox balance throws
 * CASHBOX_INSUFFICIENT (no amounts) and the caller's transaction rolls back.
 */
export async function open(
  tx: Tx,
  ctx: ServiceContext,
  input: DebtOpenInput,
): Promise<DebtOpenResult> {
  // NaN fails `> 0` too; fractions are rejected by moneyToBigInt.
  if (!(input.amount > 0)) {
    throw new RangeError(`Debt amount must be positive, got ${input.amount}`);
  }
  const amount = moneyToBigInt(input.amount);
  const note = input.note.trim();
  if (note === '') {
    throw new DomainError(ErrorCode.NOTE_REQUIRED);
  }
  const direction =
    input.source === DebtSource.MANUAL ? input.direction : DOCUMENT_DEBT_DIRECTION[input.source];
  const debtDate = input.debtDate ?? new Date();

  const debt = await tx.debt.create({
    data: {
      storeId: ctx.storeId,
      direction,
      source: input.source,
      amount,
      note,
      debtDate,
      saleId: input.source === DebtSource.SALE ? input.saleId : null,
      purchaseId: input.source === DebtSource.PURCHASE ? input.purchaseId : null,
      createdById: ctx.user.id,
    },
    select: { id: true, saleId: true, purchaseId: true },
  });

  await audit.log(tx, ctx, {
    action: 'CREATE',
    entityType: 'debt',
    entityId: debt.id,
    after: {
      direction,
      source: input.source,
      amount,
      note,
      debtDate,
      saleId: debt.saleId,
      purchaseId: debt.purchaseId,
    },
  });

  let cashTransactionId: bigint | null = null;
  if (input.source === DebtSource.MANUAL) {
    const entry = await cash.record(tx, ctx, input.cashbox, {
      type: MANUAL_DEBT_CASH_TYPE[direction],
      amount: input.amount,
      txDate: debtDate,
      note,
      debtId: debt.id,
    });
    cashTransactionId = entry.id;
  }

  return { id: debt.id, direction, cashTransactionId };
}

export interface DebtCancelOptions {
  /**
   * MANUAL debts only: the cashbox of the debt's DEBT_GIVEN / DEBT_TAKEN
   * entry, locked by lockCashboxes() before lockDebt() (§2 steps 4 → 5).
   */
  cashbox?: Cashbox;
}

export interface DebtCancelResult {
  /** The MANUAL_REVERSAL entry of a MANUAL debt, else null. */
  cashTransactionId: bigint | null;
}

/**
 * OPEN → CANCELLED. A debt with repayments is blocked (OQ-04): those are
 * reversed first. A MANUAL debt's cash entry is reversed with MANUAL_REVERSAL
 * (OQ-08) — cancelling a debt taken is a cash OUT and can throw
 * CASHBOX_INSUFFICIENT. A SALE/PURCHASE debt moves no cash here: the
 * document reversal refunds its paid parts itself (business-logic §5.3).
 */
export async function cancel(
  tx: Tx,
  ctx: ServiceContext,
  debt: LockedDebt,
  options: DebtCancelOptions = {},
): Promise<DebtCancelResult> {
  if (debt.status === DebtStatus.CANCELLED) throw new DomainError(ErrorCode.DEBT_CANCELLED);
  // Covers CLOSED too: a fully repaid debt has repayments.
  if (debt.repaidAmount > 0) throw new DomainError(ErrorCode.DEBT_HAS_REPAYMENTS);

  let cashTransactionId: bigint | null = null;
  if (debt.source === DebtSource.MANUAL) {
    const original = await tx.cashTransaction.findFirstOrThrow({
      where: {
        storeId: ctx.storeId,
        debtId: debt.id,
        type: MANUAL_DEBT_CASH_TYPE[debt.direction],
      },
      select: { id: true, cashboxId: true, direction: true, amount: true },
    });
    if (options.cashbox?.id !== original.cashboxId) {
      throw new Error(`Debt ${debt.id}: pass its locked cashbox ${original.cashboxId} to cancel`);
    }
    const reversal = await cash.reverse(tx, ctx, options.cashbox, original, { debtId: debt.id });
    cashTransactionId = reversal.id;
  } else if (options.cashbox) {
    throw new Error(`Debt ${debt.id} (${debt.source}) moves no cash on cancel`);
  }

  await tx.debt.update({
    where: { id: debt.id },
    data: { status: DebtStatus.CANCELLED },
    select: { id: true },
  });
  await audit.log(tx, ctx, {
    action: 'CANCEL',
    entityType: 'debt',
    entityId: debt.id,
    before: { status: debt.status },
    after: { status: DebtStatus.CANCELLED },
  });

  return { cashTransactionId };
}

export interface DebtRepayInput {
  /** Locked by lockCashboxes() before lockDebt() (§2 steps 4 → 5); the user picks it (FR-7.2). */
  cashbox: Cashbox;
  /** Whole som, > 0 and ≤ the remaining amount. */
  amount: number;
  note?: string | null;
  /** Defaults to now. Callers validate it (OQ-07). */
  repaidAt?: Date;
}

export interface DebtRepayResult {
  id: string;
  cashTransactionId: bigint;
  repaidAmount: number;
  status: DebtStatus;
}

/**
 * Books a (partial) repayment of an OPEN debt of any source: a
 * DEBT_REPAID_TO_ME (IN) / DEBT_REPAID_BY_ME (OUT) entry on the picked
 * cashbox, a debt_repayment row and `repaidAmount += amount`; the debt is
 * CLOSED once fully repaid. More than the remaining amount (a CLOSED debt
 * has none) → DEBT_OVERPAYMENT; repaying a debt taken beyond the cashbox
 * balance → CASHBOX_INSUFFICIENT and the caller's transaction rolls back.
 */
export async function repay(
  tx: Tx,
  ctx: ServiceContext,
  debt: LockedDebt,
  input: DebtRepayInput,
): Promise<DebtRepayResult> {
  if (!(input.amount > 0)) {
    throw new RangeError(`Repayment amount must be positive, got ${input.amount}`);
  }
  const amount = moneyToBigInt(input.amount);
  if (debt.status === DebtStatus.CANCELLED) throw new DomainError(ErrorCode.DEBT_CANCELLED);
  if (input.amount > debt.amount - debt.repaidAmount) {
    throw new DomainError(ErrorCode.DEBT_OVERPAYMENT);
  }
  const note = input.note?.trim() || null;
  const repaidAt = input.repaidAt ?? new Date();

  const entry = await cash.record(tx, ctx, input.cashbox, {
    type: DEBT_REPAYMENT_CASH_TYPE[debt.direction],
    amount: input.amount,
    txDate: repaidAt,
    note,
    debtId: debt.id,
  });
  const repayment = await tx.debtRepayment.create({
    data: {
      debtId: debt.id,
      amount,
      repaidAt,
      cashTransactionId: entry.id,
      note,
      createdById: ctx.user.id,
    },
    select: { id: true },
  });
  await audit.log(tx, ctx, {
    action: 'CREATE',
    entityType: 'debt_repayment',
    entityId: repayment.id,
    after: {
      debtId: debt.id,
      amount,
      repaidAt,
      cashboxId: input.cashbox.id,
      cashTransactionId: entry.id,
      note,
    },
  });

  const repaidAmount = debt.repaidAmount + input.amount;
  const status = repaidAmount === debt.amount ? DebtStatus.CLOSED : DebtStatus.OPEN;
  await tx.debt.update({
    where: { id: debt.id },
    data: { repaidAmount: moneyToBigInt(repaidAmount), status },
    select: { id: true },
  });
  await audit.log(tx, ctx, {
    action: 'UPDATE',
    entityType: 'debt',
    entityId: debt.id,
    before: { repaidAmount: debt.repaidAmount, status: debt.status },
    after: { repaidAmount, status },
  });

  return { id: repayment.id, cashTransactionId: entry.id, repaidAmount, status };
}
