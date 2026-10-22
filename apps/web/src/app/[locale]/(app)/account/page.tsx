import { can, type Locale } from '@drinks/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@drinks/ui/components/card';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import {
  OwnPasswordForm,
  OwnProfileForm,
  OwnUsernameForm,
} from '@/features/users/components/account-forms';
import { requireSession } from '@/lib/session';

// "My account" (T-204): open to every signed-in user from the user menu. Only
// the OWNER changes their own name, login and password here; STAFF see their
// account and ask the OWNER for changes (architecture §11).
export default async function AccountPage({ params }: PageProps<'/[locale]/account'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { user } = await requireSession(locale as Locale);
  const t = await getTranslations();
  const canEdit = can(user.role, 'user.manage');

  return (
    <>
      <PageHeader title={t('account.title')} />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('account.profile')}</CardTitle>
            {!canEdit && <CardDescription>{t('account.staffNote')}</CardDescription>}
          </CardHeader>
          <CardContent>
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {!canEdit && (
                <>
                  <dt className="text-muted-foreground">{t('users.fullName')}</dt>
                  <dd>{user.fullName}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('users.username')}</dt>
              <dd className="font-mono">{user.username}</dd>
              <dt className="text-muted-foreground">{t('users.role')}</dt>
              <dd>{t(`enums.UserRole.${user.role}`)}</dd>
            </dl>
            {canEdit && <OwnProfileForm fullName={user.fullName} />}
          </CardContent>
        </Card>
        {canEdit && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('account.changeUsername')}</CardTitle>
                <CardDescription>{t('account.otherSessionsNote')}</CardDescription>
              </CardHeader>
              <CardContent>
                <OwnUsernameForm username={user.username} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('account.changePassword')}</CardTitle>
                <CardDescription>{t('account.otherSessionsNote')}</CardDescription>
              </CardHeader>
              <CardContent>
                <OwnPasswordForm />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
