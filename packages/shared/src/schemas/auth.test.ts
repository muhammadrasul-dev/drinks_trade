import { describe, expect, it } from 'vitest';

import { loginInputSchema, resetPasswordInputSchema } from './auth';

describe('loginInputSchema', () => {
  it('trims and lowercases the username, keeps the password as is', () => {
    expect(loginInputSchema.parse({ username: '  Owner ', password: ' Secret ' })).toEqual({
      username: 'owner',
      password: ' Secret ',
    });
  });

  it('rejects empty fields', () => {
    const result = loginInputSchema.safeParse({ username: '   ', password: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['username', 'password']);
  });
});

describe('resetPasswordInputSchema', () => {
  it('normalises the username and requires 8–128 password characters', () => {
    expect(resetPasswordInputSchema.parse({ username: ' Owner ', password: '12345678' })).toEqual({
      username: 'owner',
      password: '12345678',
    });
    expect(
      resetPasswordInputSchema.safeParse({ username: 'owner', password: '1234567' }).success,
    ).toBe(false);
    expect(
      resetPasswordInputSchema.safeParse({ username: 'owner', password: 'x'.repeat(129) }).success,
    ).toBe(false);
  });
});
