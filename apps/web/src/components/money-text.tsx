import { formatSom } from '@drinks/shared';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface MoneyTextProps {
  /** Whole som (number in DTOs, bigint straight from the DB is accepted too). */
  amount: number | bigint;
  className?: string;
}

/** "1 250 000 soʻm" in the current language; works in Server and Client Components. */
export function MoneyText({ amount, className }: MoneyTextProps) {
  const t = useTranslations('common');
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {formatSom(amount, t('som'))}
    </span>
  );
}
