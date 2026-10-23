// Flow (a), T-1001: the OWNER signs in, adds a product, buys it (draft →
// post), sells part of it (draft → post) and the stock report shows what is
// left — in blocks and pieces, with the average cost and stock value.
import { expect, test } from '@playwright/test';

import { OWNER } from '../env';
import {
  columnHeaders,
  createPostedPurchase,
  createProduct,
  createSaleDraft,
  createWarehouse,
  docTitle,
  login,
  postDocument,
} from '../support/app';
import { msg, som } from '../support/i18n';

const WAREHOUSE = 'E2E-A ombor';
const SUB = 'E2E-A javon';
const PRODUCT = { name: 'E2E-A Limonad 1 L', unitsPerBlock: 6, salePrice: 8000 };

test('owner: login → product → purchase → sale → stock report', async ({ page }) => {
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/uz$/);
  await expect(docTitle(page)).toHaveText(msg('nav.sections.dashboard'));

  await createWarehouse(page, WAREHOUSE, [SUB]);
  await createProduct(page, PRODUCT);

  // 2 blocks × 6 = 12 pieces at 30 000 per block → 5 000 per piece.
  await createPostedPurchase(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    blocks: 2,
    pricePerBlock: 30_000,
  });

  // 5 pieces at the product's sale price.
  await createSaleDraft(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    unit: 'PIECE',
    qty: 5,
  });
  await postDocument(page, msg('sales.post.button'));
  await expect(docTitle(page)).toContainText(msg('enums.DocStatus.POSTED'));
  await expect(page.getByRole('main')).toContainText(som(5 * PRODUCT.salePrice));

  // 12 − 5 = 7 pieces = 1 block 1 piece, valued at 7 × 5 000.
  await page.goto('/uz/reports/stock');
  await expect(columnHeaders(page)).toContainText([
    msg('stockReport.columns.product'),
    msg('stockReport.columns.locations'),
    msg('stockReport.columns.qty'),
    msg('stockReport.columns.avgCost'),
    msg('stockReport.columns.value'),
  ]);
  const row = page.getByRole('row').filter({ hasText: PRODUCT.name });
  await expect(row).toContainText(`${WAREHOUSE} → ${SUB}`);
  await expect(row).toContainText(
    `1 ${msg('enums.QtyUnit.BLOCK')} 1 ${msg('enums.QtyUnit.PIECE')}`,
  );
  await expect(row).toContainText(msg('stockReport.pieces', { qty: 7 }));
  await expect(row).toContainText(som(5_000));
  await expect(row).toContainText(som(35_000));
});
