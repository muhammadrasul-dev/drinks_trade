'use client';

import { CashboxType } from '@drinks/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { Input } from '@drinks/ui/components/input';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';

import { toNumber } from '@/lib/number-input';

// Amount and cashbox inputs of the debt (T-704) and cash (T-702) dialogs.

type AmountInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
};

/** Whole som, digits only. */
export function AmountInput({ value, onChange, ...field }: AmountInputProps) {
  return (
    <Input
      {...field}
      inputMode="numeric"
      autoComplete="off"
      value={value ?? ''}
      onChange={(event) => onChange(toNumber(event))}
      className="tabular-nums"
    />
  );
}

/** The cashbox the money goes out of / into (FR-6.2, FR-7.2). */
export function CashboxSelect({
  value,
  onChange,
  ...trigger
}: {
  value: CashboxType;
  onChange: (value: CashboxType) => void;
} & Omit<ComponentProps<typeof SelectTrigger>, 'onChange'>) {
  const tCashbox = useTranslations('enums.CashboxType');
  return (
    <Select value={value} onValueChange={(next) => onChange(next as CashboxType)}>
      <SelectTrigger {...trigger} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(CashboxType).map((type) => (
          <SelectItem key={type} value={type}>
            {tCashbox(type)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
