// Flow (c), T-1001: an open stock count blocks posting in its warehouse
// (BR-8). The banner announces it on every page, posting a sale there fails
// with the stock-count message, and after the count is cancelled the same
// draft posts.
import { expect, type Page, test } from '@playwright/test';

import { STORAGE_STATE } from '../env';
import {
  choose,
  createPostedPurchase,
  createProduct,
  createSaleDraft,
  createWarehouse,
  docTitle,
  postDocument,
} from '../support/app';
import { msg } from '../support/i18n';

test.use({ storageState: STORAGE_STATE.owner });

const WAREHOUSE = 'E2E-C ombor';
const SUB = 'E2E-C javon';
const PRODUCT = { name: 'E2E-C Mineral suv 0.5 L', unitsPerBlock: 12, salePrice: 3000 };

/** The amber banner line about this warehouse's count. */
function banner(page: Page) {
  return page.getByRole('status').filter({ hasText: `«${WAREHOUSE}»` });
}

test('stock count: posting a sale in the counted warehouse waits for the count', async ({
  page,
}) => {
  await createWarehouse(page, WAREHOUSE, [SUB]);
  await createProduct(page, PRODUCT);
  await createPostedPurchase(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    blocks: 1,
    pricePerBlock: 24_000,
  });
  const saleUrl = await createSaleDraft(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    unit: 'PIECE',
    qty: 3,
  });

  // Open a count on the warehouse.
  await page.goto('/uz/stock-counts');
  await page.getByRole('button', { name: msg('stockCounts.open.button'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, msg('stockCounts.open.warehouse'), WAREHOUSE);
  await dialog.getByRole('button', { name: msg('stockCounts.open.submit'), exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/uz\/stock-counts\/[0-9a-f-]{36}$/);
  const countNumber = (await docTitle(page).textContent())?.match(/I-\d+/)?.[0];
  expect(countNumber).toBeTruthy();

  // Back on the sale draft: the banner names the warehouse and the count.
  await page.goto(saleUrl);
  await expect(banner(page)).toContainText(
    msg('stockCounts.banner.single', { warehouse: WAREHOUSE, number: countNumber! }),
  );

  await postDocument(page, msg('sales.post.button'));
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    msg('sales.post.stockCount', { warehouse: WAREHOUSE, number: countNumber! }),
  );
  await page.reload();
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.DRAFT'));

  // Cancel the count (from the banner link): the block is lifted at once.
  await banner(page).getByRole('link', { name: countNumber! }).click();
  await expect(page).toHaveURL(/\/uz\/stock-counts\/[0-9a-f-]{36}$/);
  await postDocument(page, msg('stockCounts.cancel.button'));
  await expect(docTitle(page)).toContainText(msg('enums.StockCountStatus.CANCELLED'));

  await page.goto(saleUrl);
  await expect(banner(page)).toHaveCount(0);
  await postDocument(page, msg('sales.post.button'));
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.POSTED'));
});
