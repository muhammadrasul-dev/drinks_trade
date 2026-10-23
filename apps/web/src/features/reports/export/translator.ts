import { formatDateTime, type Locale, type QtyLabels } from '@drinks/shared';
import { createTranslator } from 'next-intl';

import ru from '../../../../messages/ru.json';
import uz from '../../../../messages/uz.json';

// Exports (T-804) are translated with the same catalogs as the screens, in the
// language the user exported from — a Route Handler has no next-intl request
// locale, so the translator is made for it explicitly.

const CATALOGS: Record<Locale, typeof uz> = { uz, ru };

export function exportTranslator(locale: Locale) {
  return createTranslator({ locale, messages: CATALOGS[locale] });
}

export type ExportTranslator = ReturnType<typeof exportTranslator>;

/** "blok" / "dona" in the export's language. */
export function qtyLabels(t: ExportTranslator): QtyLabels {
  return { block: t('enums.QtyUnit.BLOCK'), piece: t('enums.QtyUnit.PIECE') };
}

/** "Tuzilgan vaqti: 23.10.2026 14:05" (store time zone). */
export function generatedAtLine(t: ExportTranslator, now: Date): string {
  return t('reports.export.generatedAt', { at: formatDateTime(now) });
}

interface ExportProduct {
  name: string;
  sku: string | null;
  archived: boolean;
  category: { name: string } | null;
  brand: { name: string } | null;
}

/** The product's name with the archive mark, as on the screen. */
export function productName(t: ExportTranslator, product: ExportProduct): string {
  return product.archived ? `${product.name} (${t('reports.archivedTag')})` : product.name;
}

/** The PDF product cell: name, then category · brand · SKU (like ReportProductCell). */
export function productLines(t: ExportTranslator, product: ExportProduct): string[] {
  const refs = [product.category?.name, product.brand?.name, product.sku].filter(Boolean);
  return [productName(t, product), refs.join(' · ')];
}
