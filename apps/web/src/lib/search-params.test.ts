import { describe, expect, it } from 'vitest';

import { dateParam, firstParam, uuidParam } from './search-params';

const ID = '0199f3a0-0000-7000-8000-000000000001';

describe('search params', () => {
  it('takes the first of repeated values', () => {
    expect(firstParam(['a', 'b'])).toBe('a');
    expect(firstParam('a')).toBe('a');
    expect(firstParam(undefined)).toBeUndefined();
  });

  it('keeps only real UUIDs and days', () => {
    expect(uuidParam(ID)).toBe(ID);
    expect(uuidParam('abc')).toBeUndefined();
    expect(dateParam(['2026-10-01', 'x'])).toBe('2026-10-01');
    expect(dateParam('2026-02-30')).toBeUndefined();
    expect(dateParam('01.10.2026')).toBeUndefined();
    expect(dateParam('')).toBeUndefined();
  });
});
