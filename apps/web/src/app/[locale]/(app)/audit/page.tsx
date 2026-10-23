import { auditLog } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuditFilters } from '@/features/audit/components/audit-filters';
import { AuditTable } from '@/features/audit/components/audit-table';
import { listHref, parseListParams } from '@/features/audit/list-params';
import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

// Audit log (T-901, BR-12, BR-13): OWNER only — requireSection sends STAFF to
// 403 and the service refuses them again (audit.read). Read-only.
export default async function AuditPage({ params, searchParams }: PageProps<'/[locale]/audit'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'audit');
  const filters = parseListParams(await searchParams);
  const ctx = await getServiceContext(session);
  const [page, users] = await Promise.all([auditLog.list(ctx, filters), auditLog.userOptions(ctx)]);
  const t = await getTranslations('audit');

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <AuditFilters filters={filters} users={users} />
      <AuditTable items={page.items} refs={page.refs} />
      {page.total > page.pageSize && (
        <nav
          aria-label={t('pagination.label')}
          className="flex items-center justify-end gap-2 text-sm"
        >
          <span className="text-muted-foreground tabular-nums">
            {t('pagination.range', { from, to, total: page.total })}
          </span>
          <PageLink
            href={listHref({ ...filters, page: page.page - 1 })}
            enabled={page.page > 1}
            label={t('pagination.prev')}
          />
          <PageLink
            href={listHref({ ...filters, page: page.page + 1 })}
            enabled={to < page.total}
            label={t('pagination.next')}
          />
        </nav>
      )}
    </>
  );
}

function PageLink({ href, enabled, label }: { href: string; enabled: boolean; label: string }) {
  if (!enabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
