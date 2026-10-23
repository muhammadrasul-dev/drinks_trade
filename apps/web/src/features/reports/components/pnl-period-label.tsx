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

/** A root translator: `useTranslations()` in components, `exportTranslator()` in exports. */
type Translator = ReturnType<typeof useTranslations<never>>;

/** "Oktabr 2026", "2026-yil", "01.10.2026 — 23.10.2026" … in the translator's language. */
export function pnlPeriodLabel(t: Translator, period: PnlPeriod): string {
  switch (period.kind) {
    case 'day':
      return formatStoreDay(period.day);
    case 'month': {
      const [year, month] = period.month.split('-');
      return t('pnlReport.period.month', { month: MONTH_KEYS[Number(month) - 1]!, year: year! });
    }
    case 'year':
      return t('pnlReport.period.year', { year: period.year });
    case 'range': {
      const from = period.from && formatStoreDay(period.from);
      const to = period.to && formatStoreDay(period.to);
      if (from && to) return t('pnlReport.period.range', { from, to });
      if (from) return t('pnlReport.period.fromOnly', { from });
      if (to) return t('pnlReport.period.toOnly', { to });
      return t('pnlReport.period.all');
    }
  }
}

/** The period's store days: one day, or a range such as 01.10.2026 — 31.10.2026. */
export function pnlPeriodDays(period: PnlPeriod): PnlPeriod {
  const { from, to } = pnlPeriodRange(period);
  return from && from === to ? { kind: 'day', day: from } : { kind: 'range', from, to };
}

/** pnlPeriodLabel in the current language; works in Server and Client Components. */
export function usePnlPeriodLabel(): (period: PnlPeriod) => string {
  const t = useTranslations();
  return (period) => pnlPeriodLabel(t, period);
}

/** The period as store days: "01.10.2026 — 31.10.2026", one day, or the open range. */
export function PnlPeriodDescription({ period }: { period: PnlPeriod }) {
  return usePnlPeriodLabel()(pnlPeriodDays(period));
}
