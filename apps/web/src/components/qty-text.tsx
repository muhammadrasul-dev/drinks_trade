import { formatQty } from '@drinks/shared';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface QtyTextProps {
  /** Pieces (BR-1); negative for stock-count deltas. */
  qty: number;
  unitsPerBlock: number;
  className?: string;
}

/** "3 blok 2 dona" / "3 блок 2 шт." in the current language (business-logic §1.4). */
export function QtyText({ qty, unitsPerBlock, className }: QtyTextProps) {
  const t = useTranslations('enums.QtyUnit');
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {formatQty(qty, unitsPerBlock, { block: t('BLOCK'), piece: t('PIECE') })}
    </span>
  );
}
