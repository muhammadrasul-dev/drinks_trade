// Regression (T-1002 finding): the sale and purchase forms' line tables must
// fit the page at the widths the app is used at (support/layout.ts). The stock
// count form is checked in stock-count-block.spec.ts, which already has an open count.
import { test } from '@playwright/test';

import { STORAGE_STATE } from '../env';
import { createPostedPurchase, createProduct, createWarehouse, pickProduct } from '../support/app';
import { expectFits } from '../support/layout';
import { msg } from '../support/i18n';

test.use({ storageState: STORAGE_STATE.owner });

const WAREHOUSE = 'E2E-L ombor';
const SUB = 'E2E-L javon';
const PRODUCT = { name: 'E2E-L Mineral suv 0.5 L', unitsPerBlock: 12, salePrice: 3000 };

test('sale and purchase forms fit at 1440 / 1280 / 1024 / 768 / 390 px', async ({ page }) => {
  await createWarehouse(page, WAREHOUSE, [SUB]);
  await createProduct(page, PRODUCT);
  await createPostedPurchase(page, {
    product: PRODUCT.name,
    subWarehouse: SUB,
    blocks: 1,
    pricePerBlock: 24_000,
  });

  const lineReady = (label: string) => () => pickProduct(page, label, PRODUCT.name);
  await expectFits(page, '/uz/sales/new', lineReady(msg('sales.form.product')));
  await expectFits(page, '/uz/purchases/new', lineReady(msg('purchases.form.product')));
});
