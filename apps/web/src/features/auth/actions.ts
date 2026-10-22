'use server';

import { auth } from '@drinks/server';
import { loginInputSchema } from '@drinks/shared/schemas';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { publicAction } from '@/lib/action';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

/**
 * Checks the credentials in packages/server, sets the httpOnly session cookie
 * and redirects to the home page in the user's saved language (architecture §7).
 * Returns only on failure.
 */
export const loginAction = publicAction(loginInputSchema, async (input, meta) => {
  const result = await auth.login(input, meta);
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions());
  return redirect({ href: '/', locale: result.session.user.locale });
});

/** Deletes the session row and the cookie, then shows the login page. */
export async function logoutAction(): Promise<void> {
  const store = await cookies();
  await auth.logout(store.get(SESSION_COOKIE)?.value);
  store.delete({ name: SESSION_COOKIE, path: '/' });
  redirect({ href: '/login', locale: await getLocale() });
}
