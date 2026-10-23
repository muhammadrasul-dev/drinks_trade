import { describe, expect, it } from 'vitest';

import { stockReportQuerySchema } from './reports';

const ID = '0199f3a0-0000-7000-8000-000000000001';

describe('stockReportQuerySchema', () => {
  it('accepts an empty query and every filter', () => {
    expect(stockReportQuerySchema.parse({})).toEqual({});
    const full = {
      warehouseId: ID,
      subWarehouseId: ID,
      categoryId: ID,
      brandId: ID,
      lowStock: true,
      archived: false,
    };
    expect(stockReportQuerySchema.parse(full)).toEqual(full);
  });

  it('rejects malformed ids and flags', () => {
    expect(stockReportQuerySchema.safeParse({ warehouseId: 'abc' }).success).toBe(false);
    expect(stockReportQuerySchema.safeParse({ lowStock: '1' }).success).toBe(false);
    expect(stockReportQuerySchema.safeParse({ archived: 'yes' }).success).toBe(false);
  });
});
