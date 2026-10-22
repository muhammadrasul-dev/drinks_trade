import { describe, expect, it } from 'vitest';

import {
  catalogCreateInputSchema,
  catalogIdInputSchema,
  catalogRenameInputSchema,
} from './catalog';

describe('catalog schemas', () => {
  it('trims the name and requires 1–100 characters', () => {
    expect(catalogCreateInputSchema.parse({ name: '  Coca-Cola ' })).toEqual({ name: 'Coca-Cola' });
    expect(catalogCreateInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(catalogCreateInputSchema.safeParse({ name: 'x'.repeat(100) }).success).toBe(true);
    expect(catalogCreateInputSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });

  it('requires a uuid id for rename, archive and restore', () => {
    const id = '0199f0d2-6b1c-7c3a-9b1e-2f4d5a6b7c8d';
    expect(catalogRenameInputSchema.parse({ id, name: ' Suv ' })).toEqual({ id, name: 'Suv' });
    expect(catalogIdInputSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });
});
