'use client';

import { DebtDirection, DebtSource, DebtStatus } from '@drinks/shared';
import { DEBT_SEARCH_MAX } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { SearchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { useRouter } from '@/i18n/navigation';

import { type DebtListFilters, debtsHref, hasFilters } from '../list-params';

const ALL = '__all';

/** Note search, direction, status, source and debt-date range of the debts list (T-704). */
export function DebtFilters({ filters }: { filters: DebtListFilters }) {
  const t = useTranslations('debts.filters');
  const tDirection = useTranslations('enums.DebtDirection');
  const tStatus = useTranslations('enums.DebtStatus');
  const tSource = useTranslations('enums.DebtSource');
  const router = useRouter();
  const [search, setSearch] = useState(filters.search ?? '');

  function apply(patch: Partial<DebtListFilters>) {
    router.replace(debtsHref({ ...filters, ...patch, page: 1 }));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    apply({ search: search.trim() || undefined });
  }

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <form onSubmit={submitSearch} className="relative sm:w-56">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          maxLength={DEBT_SEARCH_MAX}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={() => {
            if ((filters.search ?? '') !== search.trim())
              apply({ search: search.trim() || undefined });
          }}
          placeholder={t('search')}
          aria-label={t('search')}
          className="pl-8"
        />
      </form>
      <Select
        value={filters.direction ?? ALL}
        onValueChange={(next) =>
          apply({ direction: next === ALL ? undefined : (next as DebtDirection) })
        }
      >
        <SelectTrigger className="sm:w-44" aria-label={t('direction')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allDirections')}</SelectItem>
          {Object.values(DebtDirection).map((value) => (
            <SelectItem key={value} value={value}>
              {tDirection(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.status ?? ALL}
        onValueChange={(next) => apply({ status: next === ALL ? undefined : (next as DebtStatus) })}
      >
        <SelectTrigger className="sm:w-40" aria-label={t('status')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allStatuses')}</SelectItem>
          {Object.values(DebtStatus).map((value) => (
            <SelectItem key={value} value={value}>
              {tStatus(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.source ?? ALL}
        onValueChange={(next) => apply({ source: next === ALL ? undefined : (next as DebtSource) })}
      >
        <SelectTrigger className="sm:w-36" aria-label={t('source')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allSources')}</SelectItem>
          {Object.values(DebtSource).map((value) => (
            <SelectItem key={value} value={value}>
              {tSource(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      {hasFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch('');
            router.replace(debtsHref({}));
          }}
        >
          <XIcon />
          {t('reset')}
        </Button>
      )}
    </div>
  );
}
