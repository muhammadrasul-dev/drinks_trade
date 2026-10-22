import { z } from 'zod';

import { Locale } from '../enums';

import { passwordSchema } from './auth';

// User management (T-204, architecture §11, business-logic §11). The service
// re-validates with the same schemas; forms add only the "repeat password" check.

/** Stored login: 3–32 of `a-z 0-9 . _ -`, lowercased (matches the DB CHECK `user_username_format`). */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/);

export const fullNameSchema = z.string().trim().min(1).max(100);

export const localeSchema = z.enum(Locale);

/** The current password typed to confirm an own-account change; only its presence is checked. */
export const currentPasswordSchema = z.string().min(1).max(128);

/** OWNER creates a STAFF account; the role is never an input (one OWNER, set by the seed). */
export const userCreateInputSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  password: passwordSchema,
  locale: localeSchema,
});
export type UserCreateInput = z.input<typeof userCreateInputSchema>;

/** OWNER edits a STAFF account; a changed login signs the user out everywhere. */
export const userUpdateInputSchema = z.object({
  id: z.uuid(),
  fullName: fullNameSchema,
  username: usernameSchema,
  locale: localeSchema,
});
export type UserUpdateInput = z.input<typeof userUpdateInputSchema>;

/** OWNER sets a new password for a STAFF account. */
export const userSetPasswordInputSchema = z.object({
  id: z.uuid(),
  password: passwordSchema,
});
export type UserSetPasswordInput = z.input<typeof userSetPasswordInputSchema>;

/** Deactivate / activate. */
export const userIdInputSchema = z.object({ id: z.uuid() });
export type UserIdInput = z.input<typeof userIdInputSchema>;

/** "My account": the OWNER's own full name (no password needed). */
export const ownProfileInputSchema = z.object({ fullName: fullNameSchema });
export type OwnProfileInput = z.input<typeof ownProfileInputSchema>;

/** "My account": the OWNER's own login, confirmed with the current password. */
export const ownUsernameInputSchema = z.object({
  currentPassword: currentPasswordSchema,
  username: usernameSchema,
});
export type OwnUsernameInput = z.input<typeof ownUsernameInputSchema>;

/** "My account": the OWNER's own password, confirmed with the current password. */
export const ownPasswordInputSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});
export type OwnPasswordInput = z.input<typeof ownPasswordInputSchema>;

// Form-only "repeat the password" check; the error sits on confirmPassword. No
// message here: a schema-level message would override the form's error map.
const mismatch = { path: ['confirmPassword'] };

export const userCreateFormSchema = userCreateInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, mismatch);
export type UserCreateFormInput = z.input<typeof userCreateFormSchema>;

export const userSetPasswordFormSchema = userSetPasswordInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, mismatch);
export type UserSetPasswordFormInput = z.input<typeof userSetPasswordFormSchema>;

export const ownPasswordFormSchema = ownPasswordInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((value) => value.newPassword === value.confirmPassword, mismatch);
export type OwnPasswordFormInput = z.input<typeof ownPasswordFormSchema>;
