import { describe, expect, it } from 'vitest';

import { UserRole } from './enums';
import { can, PERMISSIONS, ROLE_PERMISSIONS, type Permission } from './permissions';

// architecture.md §5.5, written out row by row so a change to the matrix has to
// be made in both places on purpose.
const MATRIX: Record<Permission, { OWNER: boolean; STAFF: boolean }> = {
  'product.read': { OWNER: true, STAFF: true },
  'product.write': { OWNER: true, STAFF: true },
  'product.purchasePrice.read': { OWNER: true, STAFF: true },
  'warehouse.read': { OWNER: true, STAFF: true },
  'warehouse.write': { OWNER: true, STAFF: true },
  'sale.write': { OWNER: true, STAFF: true },
  'sale.post': { OWNER: true, STAFF: true },
  'purchase.write': { OWNER: true, STAFF: true },
  'purchase.post': { OWNER: true, STAFF: true },
  'stockCount.write': { OWNER: true, STAFF: true },
  'stockCount.post': { OWNER: true, STAFF: true },
  'document.reverse': { OWNER: true, STAFF: false },
  'document.paymentSplit.write': { OWNER: true, STAFF: true },
  'report.stock': { OWNER: true, STAFF: true },
  'report.sales': { OWNER: true, STAFF: true },
  'report.sales.cost': { OWNER: true, STAFF: false },
  'report.pnl': { OWNER: true, STAFF: false },
  'cash.read': { OWNER: true, STAFF: false },
  'cash.write': { OWNER: true, STAFF: false },
  'debt.read': { OWNER: true, STAFF: false },
  'debt.write': { OWNER: true, STAFF: false },
  'stockCount.amount.read': { OWNER: true, STAFF: false },
  'user.manage': { OWNER: true, STAFF: false },
  'document.draft.editAny': { OWNER: true, STAFF: true },
  'audit.read': { OWNER: true, STAFF: false },
};

const OWNER_ONLY: Permission[] = [
  'document.reverse',
  'report.sales.cost',
  'report.pnl',
  'cash.read',
  'cash.write',
  'debt.read',
  'debt.write',
  'stockCount.amount.read',
  'user.manage',
  'audit.read',
];

describe('permissions matrix (architecture §5.5)', () => {
  it('covers every permission exactly once', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  it('defines a permission set for every role', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(Object.values(UserRole).sort());
  });

  it.each(Object.entries(MATRIX) as [Permission, { OWNER: boolean; STAFF: boolean }][])(
    '%s',
    (permission, expected) => {
      expect(can(UserRole.OWNER, permission)).toBe(expected.OWNER);
      expect(can(UserRole.STAFF, permission)).toBe(expected.STAFF);
    },
  );

  it('OWNER has every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(can(UserRole.OWNER, permission)).toBe(true);
    }
  });

  it('STAFF lacks cash.read (OQ-02: no cashbox balances for staff)', () => {
    expect(can(UserRole.STAFF, 'cash.read')).toBe(false);
  });

  it('STAFF lacks every OWNER-only permission', () => {
    for (const permission of OWNER_ONLY) {
      expect(can(UserRole.STAFF, permission)).toBe(false);
    }
  });

  it('STAFF can reverse nothing (OQ-03) but may edit others’ drafts (OQ-14)', () => {
    expect(can(UserRole.STAFF, 'document.reverse')).toBe(false);
    expect(can(UserRole.STAFF, 'document.draft.editAny')).toBe(true);
  });
});
