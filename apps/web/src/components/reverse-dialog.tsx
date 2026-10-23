'use client';

import { REVERSE_REASON_MAX } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import { Label } from '@drinks/ui/components/label';
import { Undo2Icon } from 'lucide-react';
import { useId, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

interface ReverseDialogProps {
  /** Trigger and confirm button label ("Storno"). */
  label: string;
  title: string;
  description: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  /** Runs the reversal; returns the message to show, or null on success. */
  onReverse: (reason: string) => Promise<string | null>;
}

/**
 * "Storno" on a posted document (BR-3): a confirmation with the required
 * reason. A blocked reversal keeps the dialog open with the message.
 */
export function ReverseDialog({
  label,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  onReverse,
}: ReverseDialogProps) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onConfirm(): Promise<boolean> {
    setError(null);
    const message = await onReverse(reason);
    setError(message);
    return message === null;
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="text-destructive">
          <Undo2Icon />
          {label}
        </Button>
      }
      title={title}
      description={description}
      confirmLabel={label}
      confirmDisabled={reason.trim() === ''}
      destructive
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={reasonId}>{reasonLabel}</Label>
        <Input
          id={reasonId}
          value={reason}
          maxLength={REVERSE_REASON_MAX}
          placeholder={reasonPlaceholder}
          aria-invalid={error !== null}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
