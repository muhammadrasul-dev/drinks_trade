'use client';

import { storeToday } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

import {
  PNL_PERIOD_KINDS,
  type PnlPeriod,
  pnlReportHref,
  shiftPnlPeriod,
  switchPnlPeriodKind,
} from '../pnl-params';
import { usePnlPeriodLabel } from './pnl-period-label';

/**
 * Period of the P&L (T-803, business-logic §8): day / month / year / range.
 * Day, month and year step with ‹ ›; a day and a range are picked with date
 * inputs. Everything goes to the URL.
 */
export function PnlPeriodFilter({ period }: { period: PnlPeriod }) {
  const t = useTranslations('pnlReport.period');
  const label = usePnlPeriodLabel();
  const router = useRouter();
  const today = storeToday();

  function go(next: PnlPeriod) {
    router.replace(pnlReportHref(next, today));
  }

  const previous = shiftPnlPeriod(period, -1, today);
  const next = shiftPnlPeriod(period, 1, today);

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <div
        role="group"
        aria-label={t('label')}
        className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 sm:inline-grid"
      >
        {PNL_PERIOD_KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={period.kind === kind ? 'outline' : 'ghost'}
            aria-pressed={period.kind === kind}
            onClick={() => go(switchPnlPeriodKind(period, kind, today))}
            className="px-3"
          >
            {t(`kinds.${kind}`)}
          </Button>
        ))}
      </div>

      {period.kind === 'range' ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <label className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
            <span className="text-muted-foreground">{t('from')}</span>
            <Input
              type="date"
              value={period.from ?? ''}
              max={period.to ?? today}
              onChange={(event) => go({ ...period, from: event.target.value || undefined })}
              className="sm:w-40"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
            <span className="text-muted-foreground">{t('to')}</span>
            <Input
              type="date"
              value={period.to ?? ''}
              min={period.from}
              max={today}
              onChange={(event) => go({ ...period, to: event.target.value || undefined })}
              className="sm:w-40"
            />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('previous')}
            disabled={!previous}
            onClick={() => previous && go(previous)}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          {period.kind === 'day' ? (
            <Input
              type="date"
              aria-label={t('day')}
              value={period.day}
              max={today}
              onChange={(event) =>
                event.target.value && go({ kind: 'day', day: event.target.value })
              }
              className="flex-1 sm:w-40 sm:flex-none"
            />
          ) : (
            <output
              aria-live="polite"
              className="flex h-9 flex-1 items-center justify-center px-2 text-sm font-medium tabular-nums sm:min-w-36 sm:flex-none"
            >
              {label(period)}
            </output>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={t('next')}
            disabled={!next}
            onClick={() => next && go(next)}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
