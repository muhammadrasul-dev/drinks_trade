// Sidebar menu (architecture §6): one entry per (app) section with the
// permission that opens it (packages/shared/src/permissions.ts). The same
// table drives the menu and the page guard (requireSection in lib/session.ts),
// so a hidden menu item is always a 403 by URL too.
import { can, type Permission, type UserRole } from '@drinks/shared';
import {
  ArchiveIcon,
  BanknoteIcon,
  BoxesIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  HandCoinsIcon,
  HouseIcon,
  type LucideIcon,
  PackageIcon,
  ScrollTextIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
} from 'lucide-react';

export const NAV_SECTIONS = {
  dashboard: { href: '/', permission: null, icon: HouseIcon },
  products: { href: '/products', permission: 'product.read', icon: PackageIcon },
  warehouses: { href: '/warehouses', permission: 'warehouse.read', icon: BoxesIcon },
  sales: { href: '/sales', permission: 'sale.write', icon: ShoppingCartIcon },
  purchases: { href: '/purchases', permission: 'purchase.write', icon: TruckIcon },
  stockCounts: { href: '/stock-counts', permission: 'stockCount.write', icon: ClipboardListIcon },
  cash: { href: '/cash', permission: 'cash.read', icon: BanknoteIcon },
  debts: { href: '/debts', permission: 'debt.read', icon: HandCoinsIcon },
  stockReport: { href: '/reports/stock', permission: 'report.stock', icon: ArchiveIcon },
  salesReport: { href: '/reports/sales', permission: 'report.sales', icon: ChartColumnIcon },
  pnlReport: { href: '/reports/pnl', permission: 'report.pnl', icon: TrendingUpIcon },
  users: { href: '/users', permission: 'user.manage', icon: UsersIcon },
  audit: { href: '/audit', permission: 'audit.read', icon: ScrollTextIcon },
} as const satisfies Record<
  string,
  { href: string; permission: Permission | null; icon: LucideIcon }
>;

export type NavSection = keyof typeof NAV_SECTIONS;

/** Menu groups in display order; group and item labels are `nav.*` message keys. */
const NAV_GROUPS = [
  { key: 'main', sections: ['dashboard'] },
  { key: 'catalog', sections: ['products', 'warehouses'] },
  { key: 'documents', sections: ['sales', 'purchases', 'stockCounts'] },
  { key: 'finance', sections: ['cash', 'debts'] },
  { key: 'reports', sections: ['stockReport', 'salesReport', 'pnlReport'] },
  { key: 'admin', sections: ['users', 'audit'] },
] as const satisfies readonly { key: string; sections: readonly NavSection[] }[];

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key'];

/** Plain data (no icon component), safe to pass from the layout to Client Components. */
export interface NavGroup {
  key: NavGroupKey;
  items: { section: NavSection; href: string }[];
}

export function canOpenSection(role: UserRole, section: NavSection): boolean {
  const { permission } = NAV_SECTIONS[section];
  return permission === null || can(role, permission);
}

/** The role's menu: sections it may open, empty groups dropped. */
export function navForRole(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    key: group.key,
    items: group.sections
      .filter((section) => canOpenSection(role, section))
      .map((section) => ({ section, href: NAV_SECTIONS[section].href })),
  })).filter((group) => group.items.length > 0);
}

/** Active-link check: '/' matches only itself, other sections also match their sub-pages. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
