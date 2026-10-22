import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';
import { SESSION_COOKIE, sessionCookieOptions } from './lib/session-cookie';

const intl = createMiddleware(routing);

/** Pages reachable without a session (path after the locale prefix). */
const PUBLIC_PATHS = new Set(['/login']);

// Next.js 16 renamed middleware.ts to proxy.ts (Node.js runtime). Order:
// 1) next-intl adds the locale prefix (/ → /uz); 2) no session cookie → /[locale]/login.
// Only the cookie's presence is checked here; pages and Server Actions validate
// the session in the DB (lib/session.ts), so a stale cookie still ends at login.
export default function proxy(request: NextRequest) {
  const response = intl(request);
  if (response.headers.has('location')) return response;

  const [, segment, ...rest] = request.nextUrl.pathname.split('/');
  const locale = hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
  const path = `/${rest.join('/')}`.replace(/\/+$/, '') || '/';
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    if (PUBLIC_PATHS.has(path)) return response;
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  // Slide the cookie with the server-side 30-day expiry.
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
