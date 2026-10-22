import { auth, type AuthSession, type RequestMeta } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { redirect } from '@/i18n/navigation';

import { SESSION_COOKIE } from './session-cookie';

/** The current request's session, read from the DB once per render (ADR-006). */
export const getCurrentSession = cache(async (): Promise<AuthSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return auth.getSession(token);
});

/** For protected pages: no valid session → /[locale]/login. */
export async function requireSession(locale: Locale): Promise<AuthSession> {
  const session = await getCurrentSession();
  return session ?? redirect({ href: '/login', locale });
}

/** IP, user agent and request id for auth and audit (architecture §12). */
export async function getRequestMeta(): Promise<RequestMeta> {
  const list = await headers();
  // The app is expected behind one reverse proxy that sets X-Forwarded-For (OQ-12).
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ip: forwarded || list.get('x-real-ip') || null,
    userAgent: list.get('user-agent'),
    requestId: list.get('x-request-id') ?? crypto.randomUUID(),
  };
}
