'use client';

import { CashboxType, CashDirection, CashTxType } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

import { type CashJournalFilters, hasFilters, journalHref } from '../list-params';

const ALL = '__all';

/** Date range, cashbox, type and direction of the cash journal (T-701). */
export function CashFilters({ filters }: { filters: CashJournalFilters }) {
  const t = useTranslations('cash.filters');
  const tCashbox = useTranslations('enums.CashboxType');
  const tType = useTranslations('enums.CashTxType');
  const tDirection = useTranslations('enums.CashDirection');
  const router = useRouter();

  function apply(patch: Partial<CashJournalFilters>) {
    router.replace(journalHref({ ...filters, ...patch, page: 1 }));
  }

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('from')}</span>
        <Input
          type="date"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(event) => apply({ from: event.target.value || undefined })}
          className="w-40"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('to')}</span>
        <Input
          type="date"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(event) => apply({ to: event.target.value || undefined })}
          className="w-40"
        />
      </label>
      <Select
        value={filters.cashbox ?? ALL}
        onValueChange={(next) =>
          apply({ cashbox: next === ALL ? undefined : (next as CashboxType) })
        }
      >
        <SelectTrigger className="sm:w-36" aria-label={t('cashbox')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allCashboxes')}</SelectItem>
          {Object.values(CashboxType).map((value) => (
            <SelectItem key={value} value={value}>
              {tCashbox(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.type ?? ALL}
        onValueChange={(next) => apply({ type: next === ALL ? undefined : (next as CashTxType) })}
      >
        <SelectTrigger className="sm:w-56" aria-label={t('type')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allTypes')}</SelectItem>
          {Object.values(CashTxType).map((value) => (
            <SelectItem key={value} value={value}>
              {tType(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.direction ?? ALL}
        onValueChange={(next) =>
          apply({ direction: next === ALL ? undefined : (next as CashDirection) })
        }
      >
        <SelectTrigger className="sm:w-36" aria-label={t('direction')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allDirections')}</SelectItem>
          {Object.values(CashDirection).map((value) => (
            <SelectItem key={value} value={value}>
              {tDirection(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(journalHref({}))}>
          <XIcon />
          {t('reset')}
        </Button>
      )}
    </div>
  );
}
