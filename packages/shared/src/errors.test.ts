import { describe, expect, it } from 'vitest';

import { DomainError, ErrorCode, isDomainError } from './errors';

describe('DomainError', () => {
  it('carries the code and params', () => {
    const error = new DomainError(ErrorCode.INSUFFICIENT_STOCK, { available: 3, required: 5 });

    expect(error).toBeInstanceOf(Error);
    expect(isDomainError(error)).toBe(true);
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.params).toEqual({ available: 3, required: 5 });
    expect(error.fieldErrors).toBeUndefined();
  });

  it('is not confused with plain errors', () => {
    expect(isDomainError(new Error('FORBIDDEN'))).toBe(false);
  });

  it('uses each code as its own value', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });
});
