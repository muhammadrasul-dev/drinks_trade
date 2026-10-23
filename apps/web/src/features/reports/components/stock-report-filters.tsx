'use client';

import type { CatalogItem, WarehouseOption } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { TriangleAlertIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

import { hasStockReportFilters, type StockReportFilters, stockReportHref } from '../stock-params';

const ALL = '__all';
const ARCHIVED = { all: ALL, active: 'active', archived: 'archived' } as const;

interface StockReportFiltersProps {
  filters: StockReportFilters;
  warehouses: readonly WarehouseOption[];
  /** Active and archived ones: an archived category may still hold stocked products. */
  categories: readonly CatalogItem[];
  brands: readonly CatalogItem[];
}

/** Warehouse → sub-warehouse, category, brand, low stock and archive filters (T-801). */
export function StockReportFiltersBar({
  filters,
  warehouses,
  categories,
  brands,
}: StockReportFiltersProps) {
  const t = useTranslations('stockReport.filters');
  const tProducts = useTranslations('products');
  const router = useRouter();

  function apply(patch: Partial<StockReportFilters>) {
    router.replace(stockReportHref({ ...filters, ...patch }));
  }

  const warehouse = warehouses.find((w) => w.id === filters.warehouseId);
  const archivedValue =
    filters.archived === undefined
      ? ARCHIVED.all
      : filters.archived
        ? ARCHIVED.archived
        : ARCHIVED.active;

  const refLabel = (item: CatalogItem) =>
    item.archived ? tProducts('form.archivedOption', { name: item.name }) : item.name;

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <Select
        value={filters.warehouseId ?? ALL}
        onValueChange={(next) =>
          apply({ warehouseId: next === ALL ? undefined : next, subWarehouseId: undefined })
        }
      >
        <SelectTrigger className="sm:w-48" aria-label={t('warehouse')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allWarehouses')}</SelectItem>
          {warehouses.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.subWarehouseId ?? ALL}
        disabled={!warehouse}
        onValueChange={(next) => apply({ subWarehouseId: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('subWarehouse')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('allSubWarehouses')}</SelectItem>
          {warehouse?.subWarehouses.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.categoryId ?? ALL}
        onValueChange={(next) => apply({ categoryId: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('category')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{tProducts('filters.allCategories')}</SelectItem>
          {categories.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {refLabel(item)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.brandId ?? ALL}
        onValueChange={(next) => apply({ brandId: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('brand')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{tProducts('filters.allBrands')}</SelectItem>
          {brands.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {refLabel(item)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={archivedValue}
        onValueChange={(next) =>
          apply({ archived: next === ARCHIVED.all ? undefined : next === ARCHIVED.archived })
        }
      >
        <SelectTrigger className="sm:w-48" aria-label={t('archived')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ARCHIVED.all}>{t('archivedAll')}</SelectItem>
          <SelectItem value={ARCHIVED.active}>{t('archivedActive')}</SelectItem>
          <SelectItem value={ARCHIVED.archived}>{t('archivedOnly')}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant={filters.lowStock ? 'secondary' : 'outline'}
        aria-pressed={Boolean(filters.lowStock)}
        onClick={() => apply({ lowStock: filters.lowStock ? undefined : true })}
      >
        <TriangleAlertIcon />
        {t('lowStock')}
      </Button>
      {hasStockReportFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(stockReportHref({}))}>
          <XIcon />
          {t('reset')}
        </Button>
      )}
    </div>
  );
}
