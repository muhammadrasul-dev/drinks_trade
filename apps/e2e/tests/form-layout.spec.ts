// Regression (T-1002 finding): the document forms' line tables must fit the
// page at the widths the app is used at. Nothing may stick out of its card or
// scroll the page horizontally - the 1280 px desktop was the one that broke
// (sale "Summa" column and the delete button past the card edge).
import { expect, type Page, test } from '@playwright/test';

import { STORAGE_STATE } from '../env';
import {
  createPostedPurchase,
  createProduct,
  createWarehouse,
  openStockCount,
  pickProduct,
} from '../support/app';
import { msg } from '../support/i18n';

test.use({ storageState: STORAGE_STATE.owner });

const WAREHOUSE = 'E2E-L ombor';
const SUB = 'E2E-L javon';
const PRODUCT = { name: 'E2E-L Mineral suv 0.5 L', unitsPerBlock: 12, salePrice: 3000 };

/** Desktop widths with the sidebar, the tablet breakpoint and a phone. */
const WIDTHS = [1440, 1280, 1024, 768, 390];

/** Page-level horizontal scroll, plus controls whose right edge is past their card's. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      problems.push(`page scrolls: ${root.scrollWidth} > ${root.clientWidth}`);
    }
    for (const card of document.querySelectorAll('[data-slot="card"]')) {
      const right = card.getBoundingClientRect().right;
      for (const el of card.querySelectorAll('input, button, select, [role="combobox"]')) {
        const box = el.getBoundingClientRect();
        // Hidden or sr-only elements are 0-1 px boxes.
        if (box.width > 1 && box.right > right + 0.5) {
          const label = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
          problems.push(`${label} ends at ${box.right} > card edge ${right}`);
        }
      }
    }
    return problems;
  });
}

async function expectFits(page: Page, url: string, ready: () => Promise<void>) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(url);
    await ready();
    expect(await overflow(page), `${url} at ${width}px`).toEqual([]);
  }
}

test('document forms fit at 1440 / 1280 / 1024 / 768 / 390 px', async ({ page }) => {
  await createWarehouse(page, WAREHOUSE, [SUB]);
  await createProduct(page, PRODUCT);
  await createPostedPurchase(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    blocks: 1,
    pricePerBlock: 24_000,
  });

  const lineReady = (label: string) => async () => {
    await pickProduct(page, label, PRODUCT.name);
  };
  await expectFits(page, '/uz/sales/new', lineReady(msg('sales.form.product')));
  await expectFits(page, '/uz/purchases/new', lineReady(msg('purchases.form.product')));

  await openStockCount(page, WAREHOUSE);
  const countUrl = page.url();
  await expectFits(page, countUrl, async () => {
    await expect(page.getByText(PRODUCT.name).first()).toBeVisible();
  });
});
