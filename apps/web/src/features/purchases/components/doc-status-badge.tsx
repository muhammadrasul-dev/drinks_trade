import type { DocStatus } from '@drinks/shared';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

const STYLES: Record<DocStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  POSTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REVERSED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

/** Draft / posted / reversed pill for document lists and headers. */
export function DocStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('enums.DocStatus');
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
