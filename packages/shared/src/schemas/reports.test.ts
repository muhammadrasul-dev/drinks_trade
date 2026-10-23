import { describe, expect, it } from 'vitest';

import { salesReportQuerySchema, stockReportQuerySchema } from './reports';

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

describe('salesReportQuerySchema', () => {
  it('accepts open, one-sided, one-day and closed ranges', () => {
    expect(salesReportQuerySchema.parse({})).toEqual({});
    expect(salesReportQuerySchema.parse({ from: '2026-10-01' })).toEqual({ from: '2026-10-01' });
    expect(salesReportQuerySchema.parse({ to: '2026-10-31' })).toEqual({ to: '2026-10-31' });
    const day = { from: '2026-10-23', to: '2026-10-23' };
    expect(salesReportQuerySchema.parse(day)).toEqual(day);
    const month = { from: '2026-10-01', to: '2026-10-31' };
    expect(salesReportQuerySchema.parse(month)).toEqual(month);
  });

  it('rejects malformed days and a reversed range', () => {
    expect(salesReportQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(salesReportQuerySchema.safeParse({ to: '23.10.2026' }).success).toBe(false);
    const reversed = salesReportQuerySchema.safeParse({ from: '2026-10-02', to: '2026-10-01' });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.path).toEqual(['to']);
  });
});
