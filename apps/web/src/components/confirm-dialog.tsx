'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@drinks/ui/components/alert-dialog';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactElement, type ReactNode, useState, useTransition } from 'react';

interface ConfirmDialogProps {
  /** The button that opens the dialog (rendered as the trigger via asChild). */
  trigger: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  /** Extra body between the description and the buttons (e.g. a reason field). */
  children?: ReactNode;
  /** Defaults to `common.confirm`. */
  confirmLabel?: ReactNode;
  /** Disables the confirm button (e.g. a required field is empty). */
  confirmDisabled?: boolean;
  /** Red confirm button for irreversible actions (post, reverse, delete). */
  destructive?: boolean;
  /**
   * Runs while the dialog stays open with both buttons disabled; return `false`
   * to keep it open (e.g. the action returned an error that is shown elsewhere).
   */
  onConfirm: () => Promise<boolean | void> | boolean | void;
}

/** "Are you sure?" step before posting, reversing or deleting a document. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  children,
  confirmLabel,
  confirmDisabled = false,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until onConfirm settles.
    event.preventDefault();
    startTransition(async () => {
      if ((await onConfirm()) !== false) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={isPending || confirmDisabled}
            onClick={handleConfirm}
          >
            {confirmLabel ?? t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
