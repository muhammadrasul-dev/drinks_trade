'use client';

import { formatDateTime, type UserAccount } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { toast } from '@drinks/ui/components/sonner';
import { cn } from '@drinks/ui/lib/utils';
import { KeyRoundIcon, PencilIcon, UserCheckIcon, UserCogIcon, UserXIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Link } from '@/i18n/navigation';

import { activateUser, deactivateUser } from '../actions';
import { EditUserDialog, SetPasswordDialog } from './user-dialogs';

const col = dataTableColumnHelper<UserAccount>();

interface UsersTableProps {
  users: readonly UserAccount[];
  /** The signed-in OWNER: their row links to "My account" instead of row actions. */
  currentUserId: string;
}

/** Accounts list for the OWNER (T-204). */
export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const t = useTranslations();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('fullName', {
          header: t('users.fullName'),
          cell: (info) => (
            <span className={cn(!info.row.original.isActive && 'text-muted-foreground')}>
              {info.getValue()}
              {info.row.original.id === currentUserId && (
                <span className="text-muted-foreground"> ({t('users.you')})</span>
              )}
            </span>
          ),
        }),
        col.accessor('username', {
          header: t('users.username'),
          cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
        }),
        col.accessor('role', {
          header: t('users.role'),
          cell: (info) => t(`enums.UserRole.${info.getValue()}`),
        }),
        col.accessor('locale', {
          header: t('users.locale'),
          cell: (info) => t(`enums.Locale.${info.getValue()}`),
        }),
        col.accessor('isActive', {
          header: t('users.status'),
          cell: (info) => (
            <span
              className={cn(
                'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                info.getValue()
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {t(info.getValue() ? 'users.active' : 'users.inactive')}
            </span>
          ),
        }),
        col.accessor('lastLoginAt', {
          header: t('users.lastLogin'),
          cell: (info) => {
            const value = info.getValue();
            return value ? (
              <span className="tabular-nums">{formatDateTime(value)}</span>
            ) : (
              <span className="text-muted-foreground">{t('users.never')}</span>
            );
          },
        }),
        col.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('users.actions')}</span>,
          cell: (info) =>
            info.row.original.role === 'STAFF' ? (
              <RowActions user={info.row.original} />
            ) : (
              <div className="flex justify-end">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/account">
                    <UserCogIcon />
                    {t('account.title')}
                  </Link>
                </Button>
              </div>
            ),
        }),
      ]),
    [t, currentUserId],
  );

  return (
    <DataTable
      columns={columns}
      data={users}
      getRowId={(row) => row.id}
      emptyMessage={t('users.empty')}
    />
  );
}

function RowActions({ user }: { user: UserAccount }) {
  const t = useTranslations('users');
  const tErrors = useTranslations('errors');

  async function run(change: typeof deactivateUser, done: string): Promise<boolean> {
    const result = await change({ id: user.id });
    if (!result.ok) {
      toast.error(tErrors(result.error.code));
      return false;
    }
    toast.success(done);
    return true;
  }

  return (
    <div className="flex justify-end gap-1">
      <EditUserDialog
        user={user}
        trigger={
          <Button variant="ghost" size="icon" aria-label={t('edit')} title={t('edit')}>
            <PencilIcon />
          </Button>
        }
      />
      <SetPasswordDialog
        user={user}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('setPassword')}
            title={t('setPassword')}
          >
            <KeyRoundIcon />
          </Button>
        }
      />
      {user.isActive ? (
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('deactivate')}
              title={t('deactivate')}
            >
              <UserXIcon />
            </Button>
          }
          title={t('deactivateTitle', { name: user.fullName })}
          description={t('deactivateDescription')}
          confirmLabel={t('deactivate')}
          destructive
          onConfirm={() => run(deactivateUser, t('deactivated'))}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={t('activate')} title={t('activate')}>
              <UserCheckIcon />
            </Button>
          }
          title={t('activateTitle', { name: user.fullName })}
          description={t('activateDescription')}
          confirmLabel={t('activate')}
          onConfirm={() => run(activateUser, t('activated'))}
        />
      )}
    </div>
  );
}
