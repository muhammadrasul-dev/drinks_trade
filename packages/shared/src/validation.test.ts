import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ErrorCode } from './errors';
import { validationError } from './validation';

describe('validationError', () => {
  it('maps a zod failure to VALIDATION_FAILED with per-field messages', () => {
    const result = z.object({ name: z.string().min(1), qty: z.number() }).safeParse({ name: '' });
    if (result.success) throw new Error('expected failure');

    const error = validationError(result.error);

    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.params).toBeUndefined();
    expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(['name', 'qty']);
  });

  it('ignores form-level issues that have no field', () => {
    const result = z.string().safeParse(1);
    if (result.success) throw new Error('expected failure');

    expect(validationError(result.error).fieldErrors).toEqual({});
  });
});
