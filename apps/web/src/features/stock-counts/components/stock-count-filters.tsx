'use client';

import { StockCountStatus, type WarehouseOption } from '@drinks/shared';
import { Input } from '@drinks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { SearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useRouter } from '@/i18n/navigation';

import { listHref, type StockCountListFilters } from '../list-params';

const ALL = '__all';
const SEARCH_DELAY_MS = 300;

/** Number search, status and warehouse of the stock count list (T-601). */
export function StockCountFilters({
  filters,
  warehouses,
}: {
  filters: StockCountListFilters;
  warehouses: readonly WarehouseOption[];
}) {
  const t = useTranslations('stockCounts.filters');
  const tStatus = useTranslations('enums.StockCountStatus');
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? '');
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    const value = q.trim();
    if (value === (filtersRef.current.q ?? '')) return;
    const timer = setTimeout(() => {
      router.replace(listHref({ ...filtersRef.current, q: value, page: 1 }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [q, router]);

  function apply(patch: Partial<StockCountListFilters>) {
    router.replace(listHref({ ...filters, ...patch, page: 1 }));
  }

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <div className="relative sm:w-48">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('number')}
          aria-label={t('number')}
          maxLength={30}
          className="pl-8"
        />
      </div>
      <Select
        value={filters.status ?? ALL}
        onValueChange={(next) =>
          apply({ status: next === ALL ? undefined : (next as StockCountStatus) })
        }
      >
        <SelectTrigger className="sm:w-44" aria-label={t('status')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allStatuses')}</SelectItem>
          {Object.values(StockCountStatus).map((status) => (
            <SelectItem key={status} value={status}>
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.warehouseId ?? ALL}
        onValueChange={(next) => apply({ warehouseId: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-52" aria-label={t('warehouse')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allWarehouses')}</SelectItem>
          {warehouses.map((warehouse) => (
            <SelectItem key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
