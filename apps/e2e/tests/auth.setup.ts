// Runs once before the flows (project `setup`): the seeded OWNER signs in
// and adds the STAFF accounts through the Users page; the signed-in states
// are saved for the flows that do not test login themselves.
import { expect, test as setup } from '@playwright/test';

import { LOCALE_USER, OWNER, STAFF, STORAGE_STATE } from '../env';
import { login } from '../support/app';
import { msg } from '../support/i18n';

setup('owner signs in and adds the staff accounts', async ({ page }) => {
  await login(page, OWNER);
  await page.context().storageState({ path: STORAGE_STATE.owner });

  await page.goto('/uz/users');
  for (const user of [STAFF, LOCALE_USER]) {
    await page.getByRole('button', { name: msg('users.add'), exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(msg('users.fullName'), { exact: true }).fill(user.fullName);
    await dialog.getByLabel(msg('users.username'), { exact: true }).fill(user.username);
    await dialog.getByLabel(msg('users.password'), { exact: true }).fill(user.password);
    await dialog.getByLabel(msg('users.confirmPassword'), { exact: true }).fill(user.password);
    await dialog.getByRole('button', { name: msg('common.save'), exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: user.username })).toBeVisible();
  }
});

setup('staff signs in', async ({ page }) => {
  await login(page, STAFF);
  await page.context().storageState({ path: STORAGE_STATE.staff });
});
