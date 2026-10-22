// Session cookie contract (ADR-006, architecture §12). Edge-safe and free of
// @drinks/server, so src/proxy.ts can import it too.

export const SESSION_COOKIE = 'dt_session';

/** Matches the server's 30-day sliding session (packages/server auth SESSION_TTL_MS). */
export const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

export function sessionCookieOptions(
  production: boolean = process.env.NODE_ENV === 'production',
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_S,
  };
}
