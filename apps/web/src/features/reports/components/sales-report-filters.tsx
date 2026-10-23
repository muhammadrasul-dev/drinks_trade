'use client';

import { storeToday } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

import { currentMonth, type SalesReportFilters, salesReportHref } from '../sales-params';

/** Period of the sales report (T-802): two store days, plus "today" and "this month". */
export function SalesReportFiltersBar({ filters }: { filters: SalesReportFilters }) {
  const t = useTranslations('salesReport.filters');
  const router = useRouter();

  function go(next: SalesReportFilters) {
    router.replace(salesReportHref(next));
  }

  function apply(patch: Partial<SalesReportFilters>) {
    go({ ...filters, ...patch });
  }

  const today = storeToday();
  const month = currentMonth(today);
  const isToday = filters.from === today && filters.to === today;
  const isMonth = filters.from === month.from && filters.to === month.to;

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
          <span className="text-muted-foreground">{t('from')}</span>
          <Input
            type="date"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(event) => apply({ from: event.target.value || undefined })}
            className="sm:w-40"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
          <span className="text-muted-foreground">{t('to')}</span>
          <Input
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(event) => apply({ to: event.target.value || undefined })}
            className="sm:w-40"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          variant={isToday ? 'secondary' : 'outline'}
          aria-pressed={isToday}
          onClick={() => go({ from: today, to: today })}
        >
          {t('today')}
        </Button>
        <Button
          variant={isMonth ? 'secondary' : 'outline'}
          aria-pressed={isMonth}
          onClick={() => go(month)}
        >
          {t('thisMonth')}
        </Button>
      </div>
    </div>
  );
}
