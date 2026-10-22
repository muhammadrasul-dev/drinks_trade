import { describe, expect, it } from 'vitest';

import { assertLockOrder, LockStep } from './locks';
import type { Tx } from './tx';

const newTx = () => ({}) as Tx;

describe('assertLockOrder (business-logic §2)', () => {
  it('accepts steps in order, skipping some', () => {
    const tx = newTx();
    expect(() => {
      assertLockOrder(tx, LockStep.DOCUMENT);
      assertLockOrder(tx, LockStep.WAREHOUSE);
      assertLockOrder(tx, LockStep.CASHBOX);
      assertLockOrder(tx, LockStep.PRODUCT_COST);
      assertLockOrder(tx, LockStep.STOCK_BALANCE);
    }).not.toThrow();
  });

  it('rejects going back to an earlier step', () => {
    const tx = newTx();
    assertLockOrder(tx, LockStep.STOCK_BALANCE);
    expect(() => assertLockOrder(tx, LockStep.PRODUCT_COST)).toThrow(/Lock order violation/);
  });

  it('rejects taking the same step twice', () => {
    const tx = newTx();
    assertLockOrder(tx, LockStep.CASHBOX);
    expect(() => assertLockOrder(tx, LockStep.CASHBOX)).toThrow(/Lock order violation/);
  });

  it('tracks each transaction separately', () => {
    const first = newTx();
    assertLockOrder(first, LockStep.STOCK_BALANCE);
    expect(() => assertLockOrder(newTx(), LockStep.DOCUMENT)).not.toThrow();
  });
});
