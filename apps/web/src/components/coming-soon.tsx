import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { NavSection } from '@/lib/nav';

/** Placeholder for a menu section whose page is built in a later task (tasks.md). */
export async function ComingSoon({
  section,
  actions,
}: {
  section: NavSection;
  actions?: ReactNode;
}) {
  const t = await getTranslations();
  return (
    <PageHeader
      title={t(`nav.sections.${section}`)}
      description={t('common.comingSoon')}
      actions={actions}
    />
  );
}
