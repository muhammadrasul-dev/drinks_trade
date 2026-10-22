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
