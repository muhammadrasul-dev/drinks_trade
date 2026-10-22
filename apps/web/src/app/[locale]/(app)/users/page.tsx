import { users } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { UserPlusIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CreateUserDialog } from '@/features/users/components/user-dialogs';
import { UsersTable } from '@/features/users/components/users-table';
import { getServiceContext, requireSection } from '@/lib/session';

// Accounts (T-204): OWNER only — the section guard and users.list both check `user.manage`.
export default async function UsersPage({ params }: PageProps<'/[locale]/users'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'users');
  const list = await users.list(await getServiceContext(session));
  const t = await getTranslations('users');

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <CreateUserDialog
            trigger={
              <Button>
                <UserPlusIcon />
                {t('add')}
              </Button>
            }
          />
        }
      />
      <UsersTable users={list} currentUserId={session.user.id} />
    </>
  );
}
