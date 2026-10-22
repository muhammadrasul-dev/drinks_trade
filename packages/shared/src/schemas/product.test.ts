import { describe, expect, it } from 'vitest';

import {
  PRODUCT_IMAGE_MAX_BYTES,
  productCreateInputSchema,
  productImageFileSchema,
  productListQuerySchema,
  productUpdateInputSchema,
  SALE_PRICE_MAX,
} from './product';

const valid = {
  name: '  Coca-Cola 1.5 L ',
  unitsPerBlock: 6,
  salePrice: 12_000,
  minStock: 12,
};
const id = '0199f0d2-6b1c-7c3a-9b1e-2f4d5a6b7c8d';

describe('product schemas', () => {
  it('trims text and turns empty optional fields into null', () => {
    expect(
      productCreateInputSchema.parse({
        ...valid,
        sku: '  ',
        barcode: '',
        categoryId: '',
        brandId: undefined,
        expiryDate: '',
      }),
    ).toEqual({
      name: 'Coca-Cola 1.5 L',
      unitsPerBlock: 6,
      salePrice: 12_000,
      minStock: 12,
      sku: null,
      barcode: null,
      categoryId: null,
      brandId: null,
      expiryDate: null,
    });
  });

  it('keeps filled optional fields', () => {
    const parsed = productUpdateInputSchema.parse({
      ...valid,
      id,
      sku: ' CC-15 ',
      barcode: '4780000000017',
      categoryId: id,
      expiryDate: '2027-03-01',
    });
    expect(parsed).toMatchObject({ id, sku: 'CC-15', barcode: '4780000000017', categoryId: id });
    expect(parsed.expiryDate).toBe('2027-03-01');
  });

  it('rejects bad numbers, codes with spaces and bad dates', () => {
    const bad = [
      { unitsPerBlock: 0 },
      { unitsPerBlock: 1.5 },
      { salePrice: -1 },
      { salePrice: 10.5 },
      { salePrice: SALE_PRICE_MAX + 1 },
      { minStock: -1 },
      { name: ' ' },
      { sku: 'A B' },
      { barcode: 'x'.repeat(65) },
      { expiryDate: '2027-02-30' },
      { categoryId: 'nope' },
    ];
    for (const patch of bad) {
      expect(
        productCreateInputSchema.safeParse({ ...valid, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });

  it('list query: optional filters, page ≥ 1', () => {
    expect(productListQuerySchema.parse({ q: ' cola ', archived: true })).toEqual({
      q: 'cola',
      archived: true,
    });
    expect(productListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('image file: ≤ 2 MB, jpg/png/webp', () => {
    const file = (size: number, type: string) => new File([new Uint8Array(size)], 'a', { type });
    expect(productImageFileSchema.safeParse(file(10, 'image/png')).success).toBe(true);
    expect(productImageFileSchema.safeParse(file(10, 'image/gif')).success).toBe(false);
    expect(
      productImageFileSchema.safeParse(file(PRODUCT_IMAGE_MAX_BYTES + 1, 'image/jpeg')).success,
    ).toBe(false);
  });
});
