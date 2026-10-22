import { describe, expect, it } from 'vitest';

import { formatDocNumber } from './numbering';

describe('formatDocNumber', () => {
  it('uses the document prefix and 6 digits', () => {
    expect(formatDocNumber('SALE', 1)).toBe('S-000001');
    expect(formatDocNumber('PURCHASE', 45)).toBe('P-000045');
    expect(formatDocNumber('STOCK_COUNT', 7)).toBe('I-000007');
  });

  it('keeps growing past 6 digits', () => {
    expect(formatDocNumber('SALE', 1_234_567)).toBe('S-1234567');
  });
});
