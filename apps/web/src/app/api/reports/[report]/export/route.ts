import { renderReportPdf, renderReportXlsx } from '@drinks/server';
import { ErrorCode, isDomainError } from '@drinks/shared';
import { hasLocale } from 'next-intl';
import type { NextRequest } from 'next/server';

import {
  contentDisposition,
  EXPORT_CONTENT_TYPES,
  isExportFormat,
  isReportExport,
} from '@/features/reports/export/export-links';
import { buildReportExport, EXPORT_SECTIONS } from '@/features/reports/export/report-exports';
import { exportTranslator } from '@/features/reports/export/translator';
import { routing } from '@/i18n/routing';
import { canOpenSection } from '@/lib/nav';
import { searchParamsOf } from '@/lib/search-params';
import { getCurrentSession, getServiceContext } from '@/lib/session';

// PDF / Excel of a report page (T-804, ADR-010, ADR-012, architecture §4.3):
// the same filters and the same permission as the page. The data comes from
// the reports.* service, which leaves out cost and profit for STAFF and
// refuses them the P&L, so an export can never hold more than the screen.
export async function GET(
  request: NextRequest,
  { params }: RouteContext<'/api/reports/[report]/export'>,
) {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });

  const { report } = await params;
  if (!isReportExport(report)) return new Response(null, { status: 404 });
  const search = request.nextUrl.searchParams;
  const format = search.get('format');
  if (!isExportFormat(format)) return new Response(null, { status: 400 });
  // The page's own guard (requireSection): a hidden section is a 403 here too.
  if (!canOpenSection(session.user.role, EXPORT_SECTIONS[report])) {
    return new Response(null, { status: 403 });
  }

  // The language of the page the user exported from; else the user's own (OQ-41).
  const requested = search.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : session.user.locale;
  const t = exportTranslator(locale);

  try {
    const ctx = await getServiceContext(session);
    const { document, period } = await buildReportExport(
      report,
      ctx,
      searchParamsOf(search),
      t,
      new Date(),
    );
    const body =
      format === 'pdf' ? await renderReportPdf(document) : await renderReportXlsx(document);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPES[format],
        'Content-Disposition': contentDisposition(
          report,
          t(`reports.export.fileName.${report}`),
          period,
          format,
        ),
        // Confidential figures (OWNER): never kept by a shared cache.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return new Response(null, { status: error.code === ErrorCode.FORBIDDEN ? 403 : 400 });
  }
}
