'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginInputSchema } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@drinks/ui/components/form';
import { Input } from '@drinks/ui/components/input';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { loginAction } from '../actions';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const tErrors = useTranslations('errors');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema, {
      error: (issue) => (issue.code === 'too_big' ? t('tooLong') : t('required')),
    }),
    defaultValues: { username: '', password: '' },
  });

  function onSubmit(values: LoginInput) {
    setFormError(null);
    startTransition(async () => {
      // On success the action redirects; it only returns on failure.
      const result = await loginAction(values);
      if (!result.ok) {
        setFormError(tErrors(result.error.code));
        form.resetField('password');
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('username')}</FormLabel>
              <FormControl>
                <Input autoComplete="username" autoCapitalize="none" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('password')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError && (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {t('submit')}
        </Button>
      </form>
    </Form>
  );
}
