import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE_MAX_AGE_S, sessionCookieOptions } from './session-cookie';

describe('sessionCookieOptions (architecture §12)', () => {
  it('is httpOnly, sameSite=lax, path=/ and lives 30 days', () => {
    expect(sessionCookieOptions(false)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(SESSION_COOKIE_MAX_AGE_S).toBe(2_592_000);
  });

  it('is secure in production', () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
