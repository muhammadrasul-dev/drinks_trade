// Role → permission matrix, the single source of truth for RBAC
// (.claude/docs/architecture.md §5.5). Enforced by assertCan in services and
// by mappers; the UI uses it only to hide menus and buttons.
import { UserRole } from './enums';

export const PERMISSIONS = [
  'product.read',
  'product.write',
  'product.purchasePrice.read',
  'warehouse.read',
  'warehouse.write',
  'sale.write',
  'sale.post',
  'purchase.write',
  'purchase.post',
  'stockCount.write',
  'stockCount.post',
  'document.reverse',
  'document.paymentSplit.write',
  'report.stock',
  'report.sales',
  'report.sales.cost',
  'report.pnl',
  'cash.read',
  'cash.write',
  'debt.read',
  'debt.write',
  'stockCount.amount.read',
  'user.manage',
  'document.draft.editAny',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'product.read',
  'product.write',
  'product.purchasePrice.read',
  'warehouse.read',
  'warehouse.write',
  'sale.write',
  'sale.post',
  'purchase.write',
  'purchase.post',
  'stockCount.write',
  'stockCount.post',
  'document.paymentSplit.write',
  'report.stock',
  'report.sales',
  'document.draft.editAny',
];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  [UserRole.OWNER]: new Set(PERMISSIONS),
  [UserRole.STAFF]: new Set(STAFF_PERMISSIONS),
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
