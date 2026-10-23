// Screenshots for .claude/docs/user-guide.md (T-1002). One tour through a
// fresh store: the OWNER sets up warehouses, catalog and products, buys and
// sells, opens a stock count, records a travel expense; then a STAFF member
// signs in. Every step goes through the UI (OQ-44), so the pictures show what
// a user would see. `pnpm docs:screenshots` (playwright.docs.config.ts).
import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { DOCS_VIEWPORT, OWNER, REPO_ROOT, STAFF } from '../env';
import {
  choose,
  createPostedPurchase,
  createProduct,
  createSaleDraft,
  createStaffUser,
  createWarehouse,
  docTitle,
  login,
  type NewProduct,
  openStockCount,
  pickProduct,
  postDocument,
} from '../support/app';
import { msg } from '../support/i18n';

const OUT_DIR = path.join(REPO_ROOT, '.claude/docs/images/user-guide');

/**
 * Writes `<name>.png` once the page has settled (no toasts, fonts loaded).
 * `fullPage` grows the viewport to the page's height: Playwright's own
 * full-page capture repeats the sticky header and sidebar.
 */
async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize()!;
  if (fullPage) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ ...viewport, height: Math.max(height, viewport.height) });
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  await page.setViewportSize(viewport);
}

const WAREHOUSES: [string, string[]][] = [
  ['Asosiy ombor', ['A qator', 'Sovutgich']],
  ["Do'kon zali", ['Peshtaxta']],
];

const CATEGORIES = ['Gazli ichimliklar', 'Suv', 'Energetik', 'Muzli choy'];
const BRANDS = ['Coca-Cola', 'Nestle', 'Red Bull', 'Lipton'];

const COLA: NewProduct = {
  name: 'Coca-Cola 0.5 L',
  sku: 'CC-05',
  unitsPerBlock: 12,
  salePrice: 7000,
  category: 'Gazli ichimliklar',
  brand: 'Coca-Cola',
  minStock: 24,
};
const FANTA: NewProduct = {
  name: 'Fanta 1.5 L',
  sku: 'FA-15',
  unitsPerBlock: 6,
  salePrice: 13_000,
  category: 'Gazli ichimliklar',
  brand: 'Coca-Cola',
  minStock: 12,
};
const WATER: NewProduct = {
  name: 'Nestle Pure Life 0.5 L',
  sku: 'NS-05',
  unitsPerBlock: 12,
  salePrice: 3000,
  category: 'Suv',
  brand: 'Nestle',
  minStock: 48,
};
const ENERGY: NewProduct = {
  name: 'Red Bull 0.25 L',
  sku: 'RB-025',
  unitsPerBlock: 24,
  salePrice: 18_000,
  category: 'Energetik',
  brand: 'Red Bull',
  minStock: 24,
};
const TEA: NewProduct = {
  name: 'Lipton muzli choy 0.5 L',
  sku: 'LP-05',
  unitsPerBlock: 12,
  salePrice: 8000,
  category: 'Muzli choy',
  brand: 'Lipton',
  minStock: 12,
};

async function addCatalogItem(page: Page, kind: 'category' | 'brand', name: string) {
  await page.goto(kind === 'category' ? '/uz/products/categories' : '/uz/products/brands');
  await page.getByRole('button', { name: msg(`catalog.${kind}.add`), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(msg('catalog.name'), { exact: true }).fill(name);
  await dialog.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('user guide screenshots', async ({ browser, page }) => {
  // §2 — sign-in page.
  await page.goto('/uz/login');
  await shot(page, '01-login');
  await login(page, OWNER);

  // §5 — first setup.
  for (const [warehouse, subs] of WAREHOUSES) await createWarehouse(page, warehouse, subs);
  await page.goto('/uz/warehouses');
  await shot(page, '03-warehouses');

  for (const name of CATEGORIES) await addCatalogItem(page, 'category', name);
  for (const name of BRANDS) await addCatalogItem(page, 'brand', name);
  for (const product of [COLA, FANTA, WATER, ENERGY]) await createProduct(page, product);

  // The product form, filled in, just before saving the last product.
  await createProduct(page, TEA);
  await page.goto('/uz/products/new');
  await page.getByLabel(msg('products.form.name'), { exact: true }).fill('Pepsi 1 L');
  await page.getByLabel(msg('products.form.unitsPerBlock'), { exact: true }).fill('12');
  await page.getByLabel(msg('products.form.salePrice'), { exact: true }).fill('9000');
  await page.getByLabel(msg('products.form.minStock'), { exact: true }).fill('16');
  await shot(page, '04-product-form', true);

  // §6 — purchases (on credit: a new store's cashboxes are empty).
  const purchases = [
    { product: COLA.name, subWarehouse: 'A qator', blocks: 10, pricePerBlock: 66_000 },
    { product: FANTA.name, subWarehouse: 'A qator', blocks: 4, pricePerBlock: 60_000 },
    { product: WATER.name, subWarehouse: 'Sovutgich', blocks: 3, pricePerBlock: 26_000 },
    { product: ENERGY.name, subWarehouse: 'Sovutgich', blocks: 2, pricePerBlock: 380_000 },
    { product: TEA.name, subWarehouse: 'Peshtaxta', blocks: 5, pricePerBlock: 72_000 },
  ];
  for (const purchase of purchases) await createPostedPurchase(page, purchase);
  await shot(page, '06-purchase', true);
  await page.goto('/uz/products');
  await shot(page, '05-products');

  // §7 — sales, paid in cash.
  const sales = [
    { product: COLA.name, subWarehouse: 'A qator', unit: 'BLOCK', qty: 2 },
    { product: ENERGY.name, subWarehouse: 'Sovutgich', unit: 'PIECE', qty: 30 },
    { product: WATER.name, subWarehouse: 'Sovutgich', unit: 'BLOCK', qty: 2 },
    { product: TEA.name, subWarehouse: 'Peshtaxta', unit: 'BLOCK', qty: 1 },
  ] as const;
  for (const sale of sales) {
    await createSaleDraft(page, sale);
    await postDocument(page, msg('sales.post.button'));
    await expect(docTitle(page)).toContainText(msg('enums.DocStatus.POSTED'));
  }
  await shot(page, '08-sale', true);

  // A draft that asks for more than the shelf holds: the line turns red.
  await createSaleDraft(page, {
    product: FANTA.name,
    subWarehouse: 'A qator',
    unit: 'BLOCK',
    qty: 1,
  });
  await page.goto('/uz/sales/new');
  await pickProduct(page, msg('sales.form.product'), TEA.name);
  await choose(page, msg('sales.form.subWarehouse'), 'Peshtaxta');
  await page.getByLabel(msg('sales.form.qty'), { exact: true }).fill('6');
  await page.getByRole('button', { name: msg('sales.form.restToCash'), exact: true }).click();
  await shot(page, '07-sale-form', true);
  await page.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.DRAFT'));

  // §8 — a stock count on the shop floor: two pieces of tea are missing.
  await openStockCount(page, "Do'kon zali");
  const countUrl = page.url();
  const countLabel = { product: TEA.name, sub: 'Peshtaxta' };
  await page.getByLabel(msg('stockCounts.form.blocksOf', countLabel), { exact: true }).fill('3');
  await page.getByLabel(msg('stockCounts.form.piecesOf', countLabel), { exact: true }).fill('10');
  await page.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await shot(page, '09-stock-count', true);

  // §2 — the home page while the count is open and two sale drafts wait.
  await page.goto('/uz');
  await shot(page, '02-dashboard', true);

  await page.goto(countUrl);
  await postDocument(page, msg('stockCounts.post.button'));
  await expect(docTitle(page)).toContainText(msg('enums.StockCountStatus.POSTED'));

  // §9 — cash: a travel expense from the cash taken in by the sales.
  await page.goto('/uz/cash');
  await page.getByRole('button', { name: msg('cash.travel.button'), exact: true }).click();
  const travel = page.getByRole('dialog');
  await travel.getByLabel(msg('cash.form.amount'), { exact: true }).fill('50000');
  await travel.getByLabel(msg('cash.form.note'), { exact: true }).fill('Tovar olib kelish, taksi');
  await travel.getByRole('button', { name: msg('cash.travel.submit'), exact: true }).click();
  await expect(travel).toBeHidden();
  await page.reload();
  await shot(page, '10-cash', true);

  // §10 — debts: the purchases bought on credit.
  await page.goto('/uz/debts');
  await shot(page, '11-debts', true);

  // §11 — reports.
  await page.goto('/uz/reports/stock');
  await shot(page, '12-stock-report', true);
  await page.goto('/uz/reports/sales');
  await shot(page, '13-sales-report', true);
  await page.goto('/uz/reports/pnl');
  await shot(page, '14-pnl', true);

  // §12–13 — users and the audit log.
  await createStaffUser(page, { ...STAFF, fullName: 'Aliyev Vali' });
  await shot(page, '15-users');
  await page.goto('/uz/audit');
  await shot(page, '16-audit');

  // §3 — what a STAFF member sees (own browser): a shorter menu, no cost or profit.
  const staff = await browser.newPage({ viewport: DOCS_VIEWPORT });
  await login(staff, STAFF);
  await staff.goto('/uz/reports/sales');
  await shot(staff, '17-staff-sales-report', true);
  await staff.goto('/uz/cash');
  await shot(staff, '18-staff-forbidden');

  // A phone: the menu folds away.
  await staff.setViewportSize({ width: 390, height: 844 });
  await staff.goto('/uz');
  await shot(staff, '19-mobile-dashboard', true);
  await staff.close();
});
