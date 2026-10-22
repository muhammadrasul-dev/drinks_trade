'use server';

import { users } from '@drinks/server';
import {
  ownPasswordInputSchema,
  ownProfileInputSchema,
  ownUsernameInputSchema,
  userCreateInputSchema,
  userIdInputSchema,
  userSetPasswordInputSchema,
  userUpdateInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { action } from '@/lib/action';
import { SESSION_COOKIE } from '@/lib/session-cookie';

// User management (T-204). The services check `user.manage` and re-validate;
// the actions return nothing the UI needs beyond success.

function refreshUsers(): void {
  revalidatePath('/[locale]/users', 'page');
}

/** Own-account changes also show in the header (user menu), so refresh the whole shell. */
function refreshShell(): void {
  revalidatePath('/[locale]', 'layout');
}

/** The caller's cookie token: own login/password changes keep this session (OQ-22). */
async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export const createUser = action(userCreateInputSchema, async (input, { ctx }) => {
  await users.create(ctx, input);
  refreshUsers();
  return null;
});

export const updateUser = action(userUpdateInputSchema, async (input, { ctx }) => {
  await users.update(ctx, input);
  refreshUsers();
  return null;
});

export const setUserPassword = action(userSetPasswordInputSchema, async (input, { ctx }) => {
  await users.setPassword(ctx, input);
  refreshUsers();
  return null;
});

export const deactivateUser = action(userIdInputSchema, async (input, { ctx }) => {
  await users.deactivate(ctx, input);
  refreshUsers();
  return null;
});

export const activateUser = action(userIdInputSchema, async (input, { ctx }) => {
  await users.activate(ctx, input);
  refreshUsers();
  return null;
});

export const updateOwnProfile = action(ownProfileInputSchema, async (input, { ctx }) => {
  await users.updateOwnProfile(ctx, input);
  refreshShell();
  return null;
});

export const changeOwnUsername = action(ownUsernameInputSchema, async (input, { ctx }) => {
  await users.changeOwnUsername(ctx, input, await currentSessionToken());
  refreshShell();
  return null;
});

export const changeOwnPassword = action(ownPasswordInputSchema, async (input, { ctx }) => {
  await users.changeOwnPassword(ctx, input, await currentSessionToken());
  refreshShell();
  return null;
});
