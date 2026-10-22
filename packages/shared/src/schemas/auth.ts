import { z } from 'zod';

/** Login form and `auth.login` input. The username is matched case-insensitively (architecture §11). */
export const loginInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toLowerCase()),
  // Upper bound keeps argon2 work per request bounded.
  password: z.string().min(1).max(128),
});

export type LoginInput = z.input<typeof loginInputSchema>;

/** New-password rule (architecture §11): at least 8 characters; the cap bounds argon2 work. */
export const passwordSchema = z.string().min(8).max(128);

/** `users.resetPassword` input (CLI `pnpm user:reset-password <login>`, business-logic §11). */
export const resetPasswordInputSchema = z.object({
  username: loginInputSchema.shape.username,
  password: passwordSchema,
});

export type ResetPasswordInput = z.input<typeof resetPasswordInputSchema>;
