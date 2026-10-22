'use client';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@drinks/ui/components/form';
import { Input } from '@drinks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';

import { routing } from '@/i18n/routing';

// Form fields of the user forms (T-204); they read the form from <Form>'s context.

interface TextFieldProps extends Pick<
  ComponentProps<'input'>,
  'type' | 'autoComplete' | 'autoFocus' | 'maxLength'
> {
  name: string;
  label: ReactNode;
  description?: ReactNode;
}

export function TextField({ name, label, description, ...input }: TextFieldProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              autoCapitalize="none"
              spellCheck={false}
              {...input}
              {...field}
              value={(field.value as string | undefined) ?? ''}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Login: lowercase only, so a hint about the allowed characters. */
export function UsernameField({ name = 'username', label }: { name?: string; label?: ReactNode }) {
  const t = useTranslations('users');
  return (
    <TextField
      name={name}
      label={label ?? t('username')}
      description={t('usernameHint')}
      autoComplete="off"
      maxLength={32}
    />
  );
}

export function PasswordField({
  name,
  label,
  autoComplete = 'new-password',
}: {
  name: string;
  label: ReactNode;
  autoComplete?: 'new-password' | 'current-password';
}) {
  return (
    <TextField
      name={name}
      label={label}
      type="password"
      autoComplete={autoComplete}
      maxLength={128}
    />
  );
}

export function LocaleField() {
  const t = useTranslations();
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name="locale"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('users.locale')}</FormLabel>
          <Select value={field.value as string} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full" onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {routing.locales.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {t(`enums.Locale.${locale}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The form's root error (a failed action that belongs to no field). */
export function RootError() {
  const {
    formState: { errors },
  } = useFormContext();
  if (!errors.root) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {errors.root.message}
    </p>
  );
}
