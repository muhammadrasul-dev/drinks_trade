// Flow (d), T-1001: the language switcher (architecture §7). uz → ru keeps
// the page, survives navigation, reloads and a bare "/", is saved to the
// user (the next sign-in lands in Russian) and switches back to uz the same way.
// A user of its own, so the saved language never affects the other flows.
import { expect, type Page, test } from '@playwright/test';

import { BASE_URL, LOCALE_USER } from '../env';
import { docTitle, login } from '../support/app';
import { type Locale, msgIn } from '../support/i18n';

function switcher(page: Page, locale: Locale) {
  return page.getByRole('group', { name: msgIn(locale, 'localeSwitcher.label') });
}

async function switchTo(page: Page, from: Locale, to: Locale): Promise<void> {
  const button = switcher(page, from).getByRole('button', {
    name: msgIn(from, `localeSwitcher.${to}`),
  });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
}

async function expectProductsPage(page: Page, locale: Locale): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/${locale}/products$`));
  await expect(docTitle(page)).toHaveText(msgIn(locale, 'products.title'));
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('language: uz ↔ ru persists across navigation and sign-in', async ({ page, browser }) => {
  await login(page, LOCALE_USER);
  await page.goto('/uz/products');
  await expectProductsPage(page, 'uz');

  // Same page, now in Russian.
  await switchTo(page, 'uz', 'ru');
  await expectProductsPage(page, 'ru');
  await expect(
    switcher(page, 'ru').getByRole('button', { name: msgIn('ru', 'localeSwitcher.ru') }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Menu links stay in Russian.
  const nav = page.getByRole('navigation', { name: msgIn('ru', 'nav.label') });
  await nav.getByRole('link', { name: msgIn('ru', 'nav.sections.sales'), exact: true }).click();
  await expect(page).toHaveURL(/\/ru\/sales$/);
  await expect(docTitle(page)).toHaveText(msgIn('ru', 'sales.title'));
  await page.reload();
  await expect(docTitle(page)).toHaveText(msgIn('ru', 'sales.title'));

  // A bare "/" goes to the chosen language.
  await page.goto('/');
  await expect(page).toHaveURL(/\/ru$/);
  await expect(docTitle(page)).toHaveText(msgIn('ru', 'nav.sections.dashboard'));

  // Saved to the account: a fresh browser signing in lands in Russian.
  const context = await browser.newContext({ baseURL: BASE_URL });
  try {
    const fresh = await context.newPage();
    await login(fresh, LOCALE_USER);
    await expect(fresh).toHaveURL(/\/ru$/);
    await expect(docTitle(fresh)).toHaveText(msgIn('ru', 'nav.sections.dashboard'));
  } finally {
    await context.close();
  }

  // And back to Uzbek.
  await page.goto('/ru/products');
  await switchTo(page, 'ru', 'uz');
  await expectProductsPage(page, 'uz');
  await page.goto('/');
  await expect(page).toHaveURL(/\/uz$/);
  await expect(docTitle(page)).toHaveText(msgIn('uz', 'nav.sections.dashboard'));
});
