import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { FileSpreadsheetIcon, FileTextIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { type ReportExport, reportExportHref } from '../export/export-links';

interface ReportExportButtonsProps {
  report: ReportExport;
  /** The page's current filters as search params (the export gets the same report). */
  search: Record<string, string | boolean | undefined>;
}

/** "PDF" and "Excel" download links of a report page (T-804), in the page's language. */
export function ReportExportButtons({ report, search }: ReportExportButtonsProps) {
  const t = useTranslations('reports.export');
  const locale = useLocale() as Locale;
  return (
    <div role="group" aria-label={t('label')} className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={reportExportHref(report, 'pdf', locale, search)} download title={t('pdfTitle')}>
          <FileTextIcon />
          {t('pdf')}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={reportExportHref(report, 'xlsx', locale, search)} download title={t('xlsxTitle')}>
          <FileSpreadsheetIcon />
          {t('xlsx')}
        </a>
      </Button>
    </div>
  );
}
