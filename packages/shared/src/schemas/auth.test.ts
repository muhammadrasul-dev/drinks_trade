import { describe, expect, it } from 'vitest';

import { loginInputSchema } from './auth';

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
