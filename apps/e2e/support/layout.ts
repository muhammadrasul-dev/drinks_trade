// Layout guard (T-1002 finding): a form must fit the page at the widths the
// app is used at. Nothing may stick out of its card or scroll the page
// horizontally - 1280 px desktop was the one that broke (sale "Summa" column and
// the delete button past the card edge).
import { expect, type Page } from '@playwright/test';

/** Desktop widths with the sidebar, the tablet breakpoint and a phone. */
export const WIDTHS = [1440, 1280, 1024, 768, 390];

/** Page-level horizontal scroll, plus controls whose right edge is past their card's. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      problems.push(`page scrolls: ${root.scrollWidth} > ${root.clientWidth}`);
    }
    for (const card of document.querySelectorAll('[data-slot="card"]')) {
      const right = card.getBoundingClientRect().right;
      for (const el of card.querySelectorAll('input, button, select, [role="combobox"]')) {
        const box = el.getBoundingClientRect();
        // Hidden or sr-only elements are 0-1 px boxes.
        if (box.width > 1 && box.right > right + 0.5) {
          const label = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
          problems.push(`${label} ends at ${box.right} > card edge ${right}`);
        }
      }
    }
    return problems;
  });
}

/**
 * Opens `url` at every width in WIDTHS, waits for `ready` and expects no
 * overflow; the viewport is restored to `restore` afterwards.
 */
export async function expectFits(
  page: Page,
  url: string,
  ready: () => Promise<void>,
  restore = page.viewportSize(),
): Promise<void> {
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      await ready();
      expect(await overflow(page), `${url} at ${width}px`).toEqual([]);
    }
  } finally {
    if (restore) await page.setViewportSize(restore);
  }
}
