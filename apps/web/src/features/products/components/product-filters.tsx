'use client';

import type { CatalogItem } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
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

import { Link, useRouter } from '@/i18n/navigation';

import { listHref, type ProductListFilters } from '../list-params';

const ALL = '__all';
const SEARCH_DELAY_MS = 300;

interface ProductFiltersProps {
  filters: ProductListFilters;
  /** Active and archived ones: old products may still point to an archived item. */
  categories: readonly CatalogItem[];
  brands: readonly CatalogItem[];
}

/** Search box, category / brand selects and the active / archive switch (T-303). */
export function ProductFilters({ filters, categories, brands }: ProductFiltersProps) {
  const t = useTranslations('products');
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? '');
  // The latest filters for the debounced search, without re-arming the timer on every render.
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

  function apply(patch: Partial<ProductListFilters>) {
    router.replace(listHref({ ...filters, ...patch, page: 1 }));
  }

  const archiveToggle = [
    { archived: false, label: t('filters.active') },
    { archived: true, label: t('filters.archive') },
  ];

  return (
    <div role="search" aria-label={t('filters.label')} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t('filters.search')}
            aria-label={t('filters.search')}
            maxLength={100}
            className="pl-8"
          />
        </div>
        <RefSelect
          value={filters.categoryId}
          items={categories}
          allLabel={t('filters.allCategories')}
          onChange={(categoryId) => apply({ categoryId })}
        />
        <RefSelect
          value={filters.brandId}
          items={brands}
          allLabel={t('filters.allBrands')}
          onChange={(brandId) => apply({ brandId })}
        />
      </div>
      <nav aria-label={t('filters.label')} className="flex gap-2">
        {archiveToggle.map(({ archived, label }) => {
          const current = Boolean(filters.archived) === archived;
          return (
            <Button key={label} asChild size="sm" variant={current ? 'secondary' : 'ghost'}>
              <Link
                href={listHref({ ...filters, archived, page: 1 })}
                aria-current={current ? 'page' : undefined}
              >
                {label}
              </Link>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}

function RefSelect({
  value,
  items,
  allLabel,
  onChange,
}: {
  value: string | undefined;
  items: readonly CatalogItem[];
  allLabel: string;
  onChange: (id: string | undefined) => void;
}) {
  const t = useTranslations('products');
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    >
      <SelectTrigger className="sm:w-52" aria-label={allLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.archived ? t('form.archivedOption', { name: item.name }) : item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
