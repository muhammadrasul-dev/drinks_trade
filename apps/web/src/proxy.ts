import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

// Next.js 16 renamed middleware.ts to proxy.ts. Locale prefix redirect only for now;
// T-201 adds the session check (no session → /[locale]/login).
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next.js internals and files with an extension.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
