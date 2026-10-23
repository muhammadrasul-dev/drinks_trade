// Flow (b), T-1001: a STAFF user never sees profit, cost or cash (CLAUDE.md
// rule 6, SRS §5): those sections are not in the menu, their URLs answer 403,
// the reports have no cost / profit columns and the home page no amounts.
import { expect, test } from '@playwright/test';

import { STORAGE_STATE } from '../env';
import {
  columnHeaders,
  createPostedPurchase,
  createProduct,
  createSaleDraft,
  createWarehouse,
  docTitle,
  postDocument,
  sidebar,
} from '../support/app';
import { msg } from '../support/i18n';

test.use({ storageState: STORAGE_STATE.staff });

const WAREHOUSE = 'E2E-B ombor';
const SUB = 'E2E-B javon';
const PRODUCT = { name: 'E2E-B Sharbat 1 L', unitsPerBlock: 12, salePrice: 15000 };

const VISIBLE = ['dashboard', 'products', 'warehouses', 'sales', 'purchases', 'stockCounts'];
const VISIBLE_REPORTS = ['stockReport', 'salesReport'];
const HIDDEN = {
  cash: '/uz/cash',
  debts: '/uz/debts',
  pnlReport: '/uz/reports/pnl',
  users: '/uz/users',
  audit: '/uz/audit',
};

test('staff: no cash, debts, P&L or audit — in the menu, by URL and in reports', async ({
  page,
}) => {
  await page.goto('/uz');
  const nav = sidebar(page);
  for (const section of [...VISIBLE, ...VISIBLE_REPORTS]) {
    await expect(
      nav.getByRole('link', { name: msg(`nav.sections.${section}`), exact: true }),
    ).toBeVisible();
  }
  for (const section of Object.keys(HIDDEN)) {
    await expect(
      nav.getByRole('link', { name: msg(`nav.sections.${section}`), exact: true }),
    ).toHaveCount(0);
  }
  await expect(nav).not.toContainText(msg('nav.groups.finance'));
  await expect(nav).not.toContainText(msg('nav.groups.admin'));

  // The menu only hides; the server refuses too.
  for (const url of Object.values(HIDDEN)) {
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(403);
    await expect(docTitle(page)).toHaveText(msg('forbidden.title'));
  }

  // Data of its own, so the reports have a row to show.
  await createWarehouse(page, WAREHOUSE, [SUB]);
  await createProduct(page, PRODUCT);
  await createPostedPurchase(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    blocks: 1,
    pricePerBlock: 120_000,
  });
  await createSaleDraft(page, { product: PRODUCT.name, subWarehouse: SUB, unit: 'PIECE', qty: 2 });
  await postDocument(page, msg('sales.post.button'));
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.POSTED'));

  // Sales report: quantity and revenue, no cost and no gross profit.
  await page.goto('/uz/reports/sales');
  await expect(page.getByRole('row').filter({ hasText: PRODUCT.name })).toBeVisible();
  await expect(columnHeaders(page)).toHaveText([
    msg('salesReport.columns.product'),
    msg('salesReport.columns.qty'),
    msg('salesReport.columns.revenue'),
  ]);
  const main = page.getByRole('main');
  await expect(main).toContainText(msg('salesReport.totals.revenue'));
  await expect(main).not.toContainText(msg('salesReport.totals.cost'));
  await expect(main).not.toContainText(msg('salesReport.totals.grossProfit'));

  // Stock report: where and how much, no average cost and no stock value.
  await page.goto('/uz/reports/stock');
  await expect(page.getByRole('row').filter({ hasText: PRODUCT.name })).toContainText(
    `10 ${msg('enums.QtyUnit.PIECE')}`,
  );
  await expect(columnHeaders(page)).toHaveText([
    msg('stockReport.columns.product'),
    msg('stockReport.columns.locations'),
    msg('stockReport.columns.qty'),
  ]);
  await expect(main).not.toContainText(msg('stockReport.totals.value'));

  // Home: counts only, no money anywhere.
  await page.goto('/uz');
  await expect(docTitle(page)).toHaveText(msg('nav.sections.dashboard'));
  await expect(main).toContainText(msg('home.lowStock.title'));
  await expect(main).not.toContainText(msg('common.som'));
});
