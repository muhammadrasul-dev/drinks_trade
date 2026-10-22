import type { Locale, UserRole } from '../enums';

/** A user account as `users.list` returns it (T-204). Never carries the password hash. */
export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  locale: Locale;
  isActive: boolean;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
}
