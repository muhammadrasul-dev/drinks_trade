import type { Locale } from '@drinks/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MobileNav } from '@/components/app-shell/mobile-nav';
import { SidebarNav } from '@/components/app-shell/sidebar-nav';
import { StockCountBanner } from '@/components/app-shell/stock-count-banner';
import { UserMenu } from '@/components/app-shell/user-menu';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';
import { navForRole } from '@/lib/nav';
import { requireSession } from '@/lib/session';

// Protected shell (architecture §6): role-based sidebar, header with language
// switcher and user menu, the open stock-count banner (T-603). Every page below
// still checks its own permission (requireSection / requirePermission).
export default async function AppLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSession(locale as Locale);
  const { user } = session;
  const groups = navForRole(user.role);
  const t = await getTranslations('meta');

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r bg-sidebar text-sidebar-foreground md:flex">
        <Link href="/" className="border-b px-5 py-4 font-semibold">
          {t('title')}
        </Link>
        <SidebarNav groups={groups} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4">
          <MobileNav groups={groups} title={t('title')} />
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <UserMenu fullName={user.fullName} username={user.username} role={user.role} />
          </div>
        </header>
        <StockCountBanner session={session} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
