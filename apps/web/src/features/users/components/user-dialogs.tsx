'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ActionResult, Locale, UserAccount } from '@drinks/shared';
import {
  type UserCreateFormInput,
  userCreateFormSchema,
  type UserSetPasswordFormInput,
  userSetPasswordFormSchema,
  type UserUpdateInput,
  userUpdateInputSchema,
} from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@drinks/ui/components/dialog';
import { Form } from '@drinks/ui/components/form';
import { toast } from '@drinks/ui/components/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactElement, type ReactNode, useState, useTransition } from 'react';
import { type FieldValues, useForm, type UseFormReturn, useWatch } from 'react-hook-form';

import { createUser, setUserPassword, updateUser } from '../actions';
import { useShowActionError, useUserFormErrorMap } from '../form-errors';
import { LocaleField, PasswordField, RootError, TextField, UsernameField } from './fields';

interface FormDialogProps<T extends FieldValues> {
  trigger: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  form: UseFormReturn<T>;
  /** Values the form starts from each time the dialog opens. */
  initialValues: T;
  submit: (values: T) => Promise<ActionResult<unknown>>;
  successMessage: string;
  children: ReactNode;
}

/** Dialog + form shell: resets on open, stays open while saving and on errors. */
function FormDialog<T extends FieldValues>({
  trigger,
  title,
  description,
  form,
  initialValues,
  submit,
  successMessage,
  children,
}: FormDialogProps<T>) {
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const showError = useShowActionError(form);

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) form.reset(initialValues);
    setOpen(next);
  }

  function onSubmit(values: T) {
    startTransition(async () => {
      const result = await submit(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {children}
            <RootError />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** OWNER adds a STAFF account (T-204). */
export function CreateUserDialog({ trigger }: { trigger: ReactElement }) {
  const t = useTranslations('users');
  const locale = useLocale() as Locale;
  const errorMap = useUserFormErrorMap();
  const initialValues: UserCreateFormInput = {
    fullName: '',
    username: '',
    password: '',
    confirmPassword: '',
    locale,
  };
  const form = useForm<UserCreateFormInput>({
    resolver: zodResolver(userCreateFormSchema, { error: errorMap }),
    defaultValues: initialValues,
  });

  return (
    <FormDialog
      trigger={trigger}
      title={t('createTitle')}
      form={form}
      initialValues={initialValues}
      submit={({ confirmPassword: _confirm, ...input }) => createUser(input)}
      successMessage={t('created')}
    >
      <TextField name="fullName" label={t('fullName')} autoFocus maxLength={100} />
      <UsernameField />
      <PasswordField name="password" label={t('password')} />
      <PasswordField name="confirmPassword" label={t('confirmPassword')} />
      <LocaleField />
    </FormDialog>
  );
}

/** OWNER edits a STAFF account's name, login and language. */
export function EditUserDialog({ user, trigger }: { user: UserAccount; trigger: ReactElement }) {
  const t = useTranslations('users');
  const errorMap = useUserFormErrorMap();
  const initialValues: UserUpdateInput = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    locale: user.locale,
  };
  const form = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateInputSchema, { error: errorMap }),
    defaultValues: initialValues,
  });

  return (
    <FormDialog
      trigger={trigger}
      title={t('editTitle')}
      form={form}
      initialValues={initialValues}
      submit={updateUser}
      successMessage={t('updated')}
    >
      <TextField name="fullName" label={t('fullName')} autoFocus maxLength={100} />
      <UsernameField />
      <UsernameChangeNote form={form} username={user.username} />
      <LocaleField />
    </FormDialog>
  );
}

/** Warns that a new login signs the user out, once the login is edited. */
function UsernameChangeNote({
  form,
  username,
}: {
  form: UseFormReturn<UserUpdateInput>;
  username: string;
}) {
  const t = useTranslations('users');
  const value = useWatch({ control: form.control, name: 'username' });
  if (value.trim().toLowerCase() === username) return null;
  return (
    <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
      {t('usernameChangeWarning')}
    </p>
  );
}

/** OWNER sets a new password for a STAFF account; it is signed out everywhere. */
export function SetPasswordDialog({ user, trigger }: { user: UserAccount; trigger: ReactElement }) {
  const t = useTranslations('users');
  const errorMap = useUserFormErrorMap();
  const initialValues: UserSetPasswordFormInput = {
    id: user.id,
    password: '',
    confirmPassword: '',
  };
  const form = useForm<UserSetPasswordFormInput>({
    resolver: zodResolver(userSetPasswordFormSchema, { error: errorMap }),
    defaultValues: initialValues,
  });

  return (
    <FormDialog
      trigger={trigger}
      title={t('setPasswordTitle', { name: user.fullName })}
      description={t('setPasswordDescription')}
      form={form}
      initialValues={initialValues}
      submit={({ confirmPassword: _confirm, ...input }) => setUserPassword(input)}
      successMessage={t('passwordSet')}
    >
      <PasswordField name="password" label={t('newPassword')} />
      <PasswordField name="confirmPassword" label={t('confirmPassword')} />
    </FormDialog>
  );
}
