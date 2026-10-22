'use client';

import { Button } from '@drinks/ui/components/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@drinks/ui/components/sheet';
import { MenuIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { NavGroup } from '@/lib/nav';

import { SidebarNav } from './sidebar-nav';

/** Below md the sidebar is hidden; this header button opens it as a sheet. */
export function MobileNav({ groups, title }: { groups: NavGroup[]; title: string }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('open')}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-0 overflow-y-auto bg-sidebar p-0">
        <SheetTitle className="border-b px-5 py-4 text-base">{title}</SheetTitle>
        <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
