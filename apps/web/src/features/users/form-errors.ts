'use client';

import type { ActionError } from '@drinks/shared';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/** The parts of a zod issue the user forms translate (zod 4 error-map input). */
interface Issue {
  code?: string;
  minimum?: unknown;
}

/**
 * zod messages for the user forms (T-204), by issue code: the login regex is
 * the only format check, the 8-character minimum the only non-trivial one,
 * and the refine is the "repeat password" check.
 */
export function useUserFormErrorMap(): (issue: Issue) => string {
  const t = useTranslations('users.errors');
  const tCommon = useTranslations('common');
  return useCallback(
    (issue: Issue) => {
      switch (issue.code) {
        case 'invalid_format':
          return t('usernameFormat');
        case 'too_small':
          return Number(issue.minimum) > 1 ? t('passwordTooShort') : tCommon('required');
        case 'too_big':
          return tCommon('tooLong');
        case 'custom':
          return t('passwordMismatch');
        default:
          return tCommon('required');
      }
    },
    [t, tCommon],
  );
}

/**
 * Shows a failed action on the form: a taken login and a wrong current
 * password on their fields, server-side field errors on theirs, the rest as
 * the form's root error.
 */
export function useShowActionError<T extends FieldValues>(
  form: UseFormReturn<T>,
): (error: ActionError) => void {
  const t = useTranslations('users.errors');
  const tErrors = useTranslations('errors');
  return useCallback(
    (error: ActionError) => {
      const names = Object.keys(form.getValues());
      const field = (name: string) => (names.includes(name) ? (name as Path<T>) : null);
      const username = field('username');
      const currentPassword = field('currentPassword');
      if (error.code === 'DUPLICATE_VALUE' && username) {
        form.setError(username, { message: t('usernameTaken') }, { shouldFocus: true });
        return;
      }
      if (error.code === 'CURRENT_PASSWORD_INVALID' && currentPassword) {
        form.setError(currentPassword, { message: tErrors(error.code) }, { shouldFocus: true });
        return;
      }
      const invalid = Object.keys(error.fieldErrors ?? {})
        .map(field)
        .filter((name) => name !== null);
      if (error.code === 'VALIDATION_FAILED' && invalid.length > 0) {
        for (const name of invalid) form.setError(name, { message: tErrors(error.code) });
        return;
      }
      form.setError('root', { message: tErrors(error.code) });
    },
    [form, t, tErrors],
  );
}
