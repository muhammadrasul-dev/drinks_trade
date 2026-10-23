import type { StockCountStatus } from '@drinks/shared';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

const STYLES: Record<StockCountStatus, string> = {
  // An open count blocks its warehouse (BR-8): make it stand out.
  DRAFT: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  POSTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-muted text-muted-foreground',
};

/** Open / posted / cancelled pill for stock count lists and headers. */
export function StockCountStatusBadge({ status }: { status: StockCountStatus }) {
  const t = useTranslations('enums.StockCountStatus');
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STYLES[status],
      )}
    >
      {t(status)}
    </span>
  );
}
