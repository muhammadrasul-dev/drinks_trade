'use client';

import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { isNavActive, NAV_SECTIONS, type NavGroup } from '@/lib/nav';

interface SidebarNavProps {
  /** Already filtered for the user's role on the server (navForRole). */
  groups: NavGroup[];
  /** Called after a link is clicked (closes the mobile sheet). */
  onNavigate?: () => void;
}

export function SidebarNav({ groups, onNavigate }: SidebarNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-4 p-3">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {group.key !== 'main' && (
            <p className="px-2 text-xs font-medium text-muted-foreground">
              {t(`groups.${group.key}`)}
            </p>
          )}
          {group.items.map(({ section, href }) => {
            const Icon = NAV_SECTIONS[section].icon;
            const active = isNavActive(href, pathname);
            return (
              <Link
                key={section}
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(`sections.${section}`)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
