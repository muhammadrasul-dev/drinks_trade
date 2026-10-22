import { describe, expect, it } from 'vitest';

import {
  ownPasswordFormSchema,
  userCreateFormSchema,
  userCreateInputSchema,
  usernameSchema,
  userUpdateInputSchema,
} from './users';

const id = '0199f0d2-6b1c-7c3a-9b1e-2f4d5a6b7c8d';

describe('usernameSchema', () => {
  it('trims and lowercases before checking the format', () => {
    expect(usernameSchema.parse('  Ali.Valiyev_1 ')).toBe('ali.valiyev_1');
    expect(usernameSchema.parse('a-b')).toBe('a-b');
  });

  it('allows 3–32 of a-z 0-9 . _ - only', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('x'.repeat(32)).success).toBe(true);
    expect(usernameSchema.safeParse('x'.repeat(33)).success).toBe(false);
    for (const bad of ['ali vali', 'ali@shop', 'алишер', 'ali+1']) {
      expect(usernameSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('user input schemas', () => {
  it('create: trims the name, never takes a role, needs an 8+ password', () => {
    const parsed = userCreateInputSchema.parse({
      fullName: '  Ali Valiyev ',
      username: 'Ali',
      password: '12345678',
      locale: 'ru',
      role: 'OWNER',
    });
    expect(parsed).toEqual({
      fullName: 'Ali Valiyev',
      username: 'ali',
      password: '12345678',
      locale: 'ru',
    });
    expect(
      userCreateInputSchema.safeParse({ ...parsed, password: '1234567' }).error?.issues[0]?.path,
    ).toEqual(['password']);
    expect(userCreateInputSchema.safeParse({ ...parsed, locale: 'en' }).success).toBe(false);
  });

  it('update: requires a uuid and a non-empty name', () => {
    const input = { id, fullName: 'Ali', username: 'ali', locale: 'uz' };
    expect(userUpdateInputSchema.safeParse(input).success).toBe(true);
    expect(userUpdateInputSchema.safeParse({ ...input, id: 'x' }).success).toBe(false);
    expect(userUpdateInputSchema.safeParse({ ...input, fullName: '  ' }).success).toBe(false);
  });

  it('form schemas: the repeated password must match', () => {
    const base = { fullName: 'Ali', username: 'ali', password: '12345678', locale: 'uz' };
    expect(userCreateFormSchema.safeParse({ ...base, confirmPassword: '12345678' }).success).toBe(
      true,
    );
    expect(
      userCreateFormSchema.safeParse({ ...base, confirmPassword: '87654321' }).error?.issues[0]
        ?.path,
    ).toEqual(['confirmPassword']);
    expect(
      ownPasswordFormSchema.safeParse({
        currentPassword: 'old',
        newPassword: 'new password',
        confirmPassword: 'new password',
      }).success,
    ).toBe(true);
  });
});
