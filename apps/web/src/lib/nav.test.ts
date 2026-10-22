import { UserRole } from '@drinks/shared';
import { describe, expect, it } from 'vitest';

import { canOpenSection, isNavActive, NAV_SECTIONS, type NavSection, navForRole } from './nav';

const hrefs = (role: UserRole) =>
  navForRole(role).flatMap((group) => group.items.map((i) => i.href));

/** T-203 acceptance: STAFF has no Kassa, Qarzlar, P&L, Foydalanuvchilar, Audit. */
const OWNER_ONLY: NavSection[] = ['cash', 'debts', 'pnlReport', 'users', 'audit'];

describe('navForRole', () => {
  it('OWNER sees every section', () => {
    expect(hrefs(UserRole.OWNER)).toEqual(Object.values(NAV_SECTIONS).map((s) => s.href));
  });

  it('STAFF sees no owner-only section', () => {
    const staff = hrefs(UserRole.STAFF);
    for (const section of OWNER_ONLY) {
      expect(staff).not.toContain(NAV_SECTIONS[section].href);
    }
    expect(staff).toEqual([
      '/',
      '/products',
      '/warehouses',
      '/sales',
      '/purchases',
      '/stock-counts',
      '/reports/stock',
      '/reports/sales',
    ]);
  });

  it('drops groups left empty for STAFF', () => {
    expect(navForRole(UserRole.STAFF).map((g) => g.key)).toEqual([
      'main',
      'catalog',
      'documents',
      'reports',
    ]);
  });
});

describe('canOpenSection', () => {
  it.each(OWNER_ONLY)('%s: OWNER yes, STAFF no (page answers 403)', (section) => {
    expect(canOpenSection(UserRole.OWNER, section)).toBe(true);
    expect(canOpenSection(UserRole.STAFF, section)).toBe(false);
  });

  it('dashboard needs no permission', () => {
    expect(canOpenSection(UserRole.STAFF, 'dashboard')).toBe(true);
  });
});

describe('isNavActive', () => {
  it.each([
    ['/', '/', true],
    ['/', '/products', false],
    ['/products', '/products', true],
    ['/products', '/products/42', true],
    ['/reports/sales', '/reports/stock', false],
    ['/sales', '/sales-archive', false],
  ])('%s on %s → %s', (href, pathname, expected) => {
    expect(isNavActive(href, pathname)).toBe(expected);
  });
});
