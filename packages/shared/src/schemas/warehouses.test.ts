import { describe, expect, it } from 'vitest';

import {
  subWarehouseCreateInputSchema,
  warehouseCreateInputSchema,
  warehouseIdInputSchema,
  warehouseRenameInputSchema,
} from './warehouses';

const id = '0199f0d2-6b1c-7c3a-9b1e-2f4d5a6b7c8d';

describe('warehouse schemas', () => {
  it('trims the name and requires 1–100 characters', () => {
    expect(warehouseCreateInputSchema.parse({ name: '  Asosiy ombor ' })).toEqual({
      name: 'Asosiy ombor',
    });
    expect(warehouseCreateInputSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(warehouseCreateInputSchema.safeParse({ name: 'x'.repeat(100) }).success).toBe(true);
    expect(warehouseCreateInputSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });

  it('requires uuids for the parent warehouse, rename, archive and restore', () => {
    expect(subWarehouseCreateInputSchema.parse({ warehouseId: id, name: ' Javon A ' })).toEqual({
      warehouseId: id,
      name: 'Javon A',
    });
    expect(subWarehouseCreateInputSchema.safeParse({ name: 'Javon A' }).success).toBe(false);
    expect(warehouseRenameInputSchema.parse({ id, name: 'Muzlatgich' })).toEqual({
      id,
      name: 'Muzlatgich',
    });
    expect(warehouseIdInputSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });
});
