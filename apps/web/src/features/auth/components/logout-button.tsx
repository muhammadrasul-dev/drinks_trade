import { Button } from '@drinks/ui/components/button';
import { getTranslations } from 'next-intl/server';

import { logoutAction } from '../actions';

/** Plain form post: works without client JS. */
export async function LogoutButton() {
  const t = await getTranslations('auth');
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline">
        {t('logout')}
      </Button>
    </form>
  );
}
