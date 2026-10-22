import { Button } from '@drinks/ui/components/button';
import { ShieldXIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

// 403 page for forbidden() from requirePermission/requireSection (lib/session.ts);
// rendered inside the (app) layout, so the menu stays usable.
export default async function Forbidden() {
  const t = await getTranslations('forbidden');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <ShieldXIcon className="size-12 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">403</p>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
