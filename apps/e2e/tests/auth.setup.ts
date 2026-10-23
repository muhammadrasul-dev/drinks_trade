// Runs once before the flows (project `setup`): the seeded OWNER signs in
// and adds the STAFF accounts through the Users page; the signed-in states
// are saved for the flows that do not test login themselves.
import { test as setup } from '@playwright/test';

import { LOCALE_USER, OWNER, STAFF, STORAGE_STATE } from '../env';
import { createStaffUser, login } from '../support/app';

setup('owner signs in and adds the staff accounts', async ({ page }) => {
  await login(page, OWNER);
  await page.context().storageState({ path: STORAGE_STATE.owner });

  for (const user of [STAFF, LOCALE_USER]) await createStaffUser(page, user);
});

setup('staff signs in', async ({ page }) => {
  await login(page, STAFF);
  await page.context().storageState({ path: STORAGE_STATE.staff });
});
