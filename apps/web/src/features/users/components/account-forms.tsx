'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ActionResult } from '@drinks/shared';
import {
  type OwnPasswordFormInput,
  ownPasswordFormSchema,
  type OwnProfileInput,
  ownProfileInputSchema,
  type OwnUsernameInput,
  ownUsernameInputSchema,
} from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Form } from '@drinks/ui/components/form';
import { toast } from '@drinks/ui/components/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useTransition } from 'react';
import { type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';

import { changeOwnPassword, changeOwnUsername, updateOwnProfile } from '../actions';
import { useShowActionError, useUserFormErrorMap } from '../form-errors';
import { PasswordField, RootError, TextField, UsernameField } from './fields';

// "My account" forms for the OWNER (T-204). Login and password changes need the
// current password; other sessions are signed out, this one stays (OQ-22).

interface AccountFormProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  submit: (values: T) => Promise<ActionResult<unknown>>;
  successMessage: string;
  /** Values after a successful save (e.g. cleared password fields). */
  resetTo: (values: T) => T;
  children: ReactNode;
}

function AccountForm<T extends FieldValues>({
  form,
  submit,
  successMessage,
  resetTo,
  children,
}: AccountFormProps<T>) {
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const showError = useShowActionError(form);

  function onSubmit(values: T) {
    startTransition(async () => {
      const result = await submit(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      toast.success(successMessage);
      form.reset(resetTo(values));
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {children}
        <RootError />
        <div>
          <Button type="submit" disabled={isPending}>
            {tCommon('save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function OwnProfileForm({ fullName }: { fullName: string }) {
  const t = useTranslations('users');
  const tAccount = useTranslations('account');
  const errorMap = useUserFormErrorMap();
  const form = useForm<OwnProfileInput>({
    resolver: zodResolver(ownProfileInputSchema, { error: errorMap }),
    defaultValues: { fullName },
  });
  return (
    <AccountForm
      form={form}
      submit={updateOwnProfile}
      successMessage={tAccount('profileSaved')}
      resetTo={(values) => ({ fullName: values.fullName.trim() })}
    >
      <TextField name="fullName" label={t('fullName')} maxLength={100} autoComplete="name" />
    </AccountForm>
  );
}

export function OwnUsernameForm({ username }: { username: string }) {
  const t = useTranslations('account');
  const errorMap = useUserFormErrorMap();
  const form = useForm<OwnUsernameInput>({
    resolver: zodResolver(ownUsernameInputSchema, { error: errorMap }),
    defaultValues: { username, currentPassword: '' },
  });
  return (
    <AccountForm
      form={form}
      submit={changeOwnUsername}
      successMessage={t('usernameChanged')}
      resetTo={(values) => ({
        username: values.username.trim().toLowerCase(),
        currentPassword: '',
      })}
    >
      <UsernameField label={t('newUsername')} />
      <PasswordField
        name="currentPassword"
        label={t('currentPassword')}
        autoComplete="current-password"
      />
    </AccountForm>
  );
}

const EMPTY_PASSWORDS: OwnPasswordFormInput = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export function OwnPasswordForm() {
  const t = useTranslations('account');
  const tUsers = useTranslations('users');
  const errorMap = useUserFormErrorMap();
  const form = useForm<OwnPasswordFormInput>({
    resolver: zodResolver(ownPasswordFormSchema, { error: errorMap }),
    defaultValues: EMPTY_PASSWORDS,
  });
  return (
    <AccountForm
      form={form}
      submit={({ confirmPassword: _confirm, ...input }) => changeOwnPassword(input)}
      successMessage={t('passwordChanged')}
      resetTo={() => EMPTY_PASSWORDS}
    >
      <PasswordField
        name="currentPassword"
        label={t('currentPassword')}
        autoComplete="current-password"
      />
      <PasswordField name="newPassword" label={tUsers('newPassword')} />
      <PasswordField name="confirmPassword" label={tUsers('confirmPassword')} />
    </AccountForm>
  );
}
