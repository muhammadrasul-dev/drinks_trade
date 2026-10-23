import { formatStoreDay } from '@drinks/shared';
import { useTranslations } from 'next-intl';

import { type PnlPeriod, pnlPeriodRange } from '../pnl-params';

const MONTH_KEYS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/**
 * "Oktabr 2026", "2026-yil", "01.10.2026 — 23.10.2026" … in the current
 * language; works in Server and Client Components.
 */
export function usePnlPeriodLabel(): (period: PnlPeriod) => string {
  const t = useTranslations('pnlReport.period');
  return (period) => {
    switch (period.kind) {
      case 'day':
        return formatStoreDay(period.day);
      case 'month': {
        const [year, month] = period.month.split('-');
        return t('month', { month: MONTH_KEYS[Number(month) - 1]!, year: year! });
      }
      case 'year':
        return t('year', { year: period.year });
      case 'range': {
        const from = period.from && formatStoreDay(period.from);
        const to = period.to && formatStoreDay(period.to);
        if (from && to) return t('range', { from, to });
        if (from) return t('fromOnly', { from });
        if (to) return t('toOnly', { to });
        return t('all');
      }
    }
  };
}

/** The period as store days: "01.10.2026 — 31.10.2026", one day, or the open range. */
export function PnlPeriodDescription({ period }: { period: PnlPeriod }) {
  const label = usePnlPeriodLabel();
  const { from, to } = pnlPeriodRange(period);
  return label(from && from === to ? { kind: 'day', day: from } : { kind: 'range', from, to });
}
