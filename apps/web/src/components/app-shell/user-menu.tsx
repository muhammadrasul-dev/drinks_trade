'use client';

import type { UserRole } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@drinks/ui/components/dropdown-menu';
import { CircleUserIcon, LogOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { logoutAction } from '@/features/auth/actions';

interface UserMenuProps {
  fullName: string;
  username: string;
  role: UserRole;
}

export function UserMenu({ fullName, username, role }: UserMenuProps) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('userMenu.label')}>
          <CircleUserIcon />
          <span className="hidden max-w-40 truncate sm:inline">{fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{fullName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {username} · {t(`enums.UserRole.${role}`)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onSelect={() => startTransition(() => logoutAction())}
        >
          <LogOutIcon />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
