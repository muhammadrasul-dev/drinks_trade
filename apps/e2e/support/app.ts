// UI steps shared by the flows. Everything goes through the pages a user
// would use (role / label locators, texts from the app's messages); the only
// thing done behind the UI is the database reset (scripts/prepare-db.ts).
import { expect, type Locator, type Page } from '@playwright/test';

import { msg } from './i18n';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export interface Credentials {
  username: string;
  password: string;
}

/** Signs in on /uz/login and waits for the home page (in the user's saved language). */
export async function login(page: Page, user: Credentials): Promise<void> {
  await page.goto('/uz/login');
  await page.getByLabel(msg('auth.login.username'), { exact: true }).fill(user.username);
  await page.getByLabel(msg('auth.login.password'), { exact: true }).fill(user.password);
  await page.getByRole('button', { name: msg('auth.login.submit'), exact: true }).click();
  await expect(page).toHaveURL(/\/(uz|ru)$/);
}

/** The sidebar (desktop layout). */
export function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: msg('nav.label') });
}

/** Picks `option` in the Radix select labelled `label` inside `scope`. */
export async function choose(scope: Page | Locator, label: string, option: string): Promise<void> {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  const page = 'page' in scope ? scope.page() : scope;
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Searches the document-line product picker and picks the product. */
export async function pickProduct(page: Page, label: string, product: string): Promise<void> {
  const picker = page.getByRole('combobox', { name: label, exact: true });
  await picker.click();
  await picker.fill(product);
  await page.getByRole('option', { name: product }).click();
  await expect(picker).toHaveValue(product);
}

/** Warehouse with sub-warehouses, through the Warehouses page. */
export async function createWarehouse(page: Page, name: string, subs: string[]): Promise<void> {
  await page.goto('/uz/warehouses');
  await page.getByRole('button', { name: msg('warehouses.warehouse.add'), exact: true }).click();
  await fillNameDialog(page, name);

  const card = page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${name}$`) }),
  });
  for (const sub of subs) {
    await card
      .getByRole('button', { name: msg('warehouses.subWarehouse.add'), exact: true })
      .click();
    await fillNameDialog(page, sub);
    await expect(card.getByRole('cell', { name: sub, exact: true })).toBeVisible();
  }
}

async function fillNameDialog(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(msg('warehouses.name'), { exact: true }).fill(name);
  await dialog.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(dialog).toBeHidden();
}

export interface NewUser extends Credentials {
  fullName: string;
}

/** STAFF account through the Users page (the OWNER is signed in). */
export async function createStaffUser(page: Page, user: NewUser): Promise<void> {
  await page.goto('/uz/users');
  await page.getByRole('button', { name: msg('users.add'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(msg('users.fullName'), { exact: true }).fill(user.fullName);
  await dialog.getByLabel(msg('users.username'), { exact: true }).fill(user.username);
  await dialog.getByLabel(msg('users.password'), { exact: true }).fill(user.password);
  await dialog.getByLabel(msg('users.confirmPassword'), { exact: true }).fill(user.password);
  await dialog.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: user.username })).toBeVisible();
}

export interface NewProduct {
  name: string;
  unitsPerBlock: number;
  /** Per piece, whole som. */
  salePrice: number;
  sku?: string;
  category?: string;
  brand?: string;
  /** Pieces. */
  minStock?: number;
}

/** Product card (name, pieces per block, sale price), back on the product list. */
export async function createProduct(page: Page, product: NewProduct): Promise<void> {
  await page.goto('/uz/products/new');
  await page.getByLabel(msg('products.form.name'), { exact: true }).fill(product.name);
  await page
    .getByLabel(msg('products.form.unitsPerBlock'), { exact: true })
    .fill(String(product.unitsPerBlock));
  await page
    .getByLabel(msg('products.form.salePrice'), { exact: true })
    .fill(String(product.salePrice));
  if (product.sku) {
    await page.getByLabel(msg('products.form.sku'), { exact: true }).fill(product.sku);
  }
  if (product.category) await choose(page, msg('products.form.category'), product.category);
  if (product.brand) await choose(page, msg('products.form.brand'), product.brand);
  if (product.minStock !== undefined) {
    await page
      .getByLabel(msg('products.form.minStock'), { exact: true })
      .fill(String(product.minStock));
  }
  await page.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(page).toHaveURL(/\/uz\/products$/);
  await expect(page.getByRole('link', { name: product.name, exact: true })).toBeVisible();
}

export interface NewPurchase {
  product: string;
  subWarehouse: string;
  blocks: number;
  pricePerBlock: number;
}

/**
 * Purchase draft → saved → posted. Paid fully on credit (with the supplier
 * in the note): a fresh store's cashboxes are empty, so a cash payment
 * could not leave them.
 */
export async function createPostedPurchase(page: Page, purchase: NewPurchase): Promise<void> {
  await page.goto('/uz/purchases/new');
  await page.getByLabel(msg('purchases.form.note'), { exact: true }).fill('E2E yetkazib beruvchi');
  await pickProduct(page, msg('purchases.form.product'), purchase.product);
  await choose(page, msg('purchases.form.subWarehouse'), purchase.subWarehouse);
  await page.getByLabel(msg('purchases.form.qty'), { exact: true }).fill(String(purchase.blocks));
  await page
    .getByLabel(msg('purchases.form.price'), { exact: true })
    .fill(String(purchase.pricePerBlock));
  await page
    .getByLabel(msg('purchases.form.paidCredit'), { exact: true })
    .fill(String(purchase.blocks * purchase.pricePerBlock));
  await expect(page.getByText(msg('purchases.form.splitOk'))).toBeVisible();
  await page.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/uz/purchases/${UUID}$`));
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.DRAFT'));

  await postDocument(page, msg('purchases.post.button'));
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.POSTED'));
}

export interface NewSale {
  product: string;
  subWarehouse: string;
  unit: 'BLOCK' | 'PIECE';
  qty: number;
}

/** Sale draft, paid in cash, saved; returns its page URL. */
export async function createSaleDraft(page: Page, sale: NewSale): Promise<string> {
  await page.goto('/uz/sales/new');
  await pickProduct(page, msg('sales.form.product'), sale.product);
  await choose(page, msg('sales.form.subWarehouse'), sale.subWarehouse);
  if (sale.unit === 'PIECE') {
    await choose(page, msg('sales.form.unit'), msg('enums.QtyUnit.PIECE'));
  }
  await page.getByLabel(msg('sales.form.qty'), { exact: true }).fill(String(sale.qty));
  await page.getByRole('button', { name: msg('sales.form.restToCash'), exact: true }).click();
  await expect(page.getByText(msg('sales.form.splitOk'))).toBeVisible();
  await page.getByRole('button', { name: msg('common.save'), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/uz/sales/${UUID}$`));
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.DRAFT'));
  return page.url();
}

/** Opens a stock count on `warehouse`; lands on its page and returns its number (I-…). */
export async function openStockCount(page: Page, warehouse: string): Promise<string> {
  await page.goto('/uz/stock-counts');
  await page.getByRole('button', { name: msg('stockCounts.open.button'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, msg('stockCounts.open.warehouse'), warehouse);
  await dialog.getByRole('button', { name: msg('stockCounts.open.submit'), exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/uz/stock-counts/${UUID}$`));
  const number = (await docTitle(page).textContent())?.match(/I-\d+/)?.[0];
  if (!number) throw new Error('No stock count number in the page title');
  return number;
}

/** "Bajarish" on a saved draft and the confirmation dialog's own "Bajarish". */
export async function postDocument(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** The page header: document number and status badge. */
export function docTitle(page: Page): Locator {
  return page.getByRole('heading', { level: 1 });
}

/**
 * The report table's header cells. Playwright maps a `<th>` without `scope`
 * to the `cell` role, so they are the cells of the table's first row.
 */
export function columnHeaders(page: Page): Locator {
  return page.getByRole('table').getByRole('row').first().getByRole('cell');
}
