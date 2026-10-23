'use client';

import type { OpenStockCount } from '@drinks/shared';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { Link, usePathname } from '@/i18n/navigation';

import { bannerCounts, OPEN_STOCK_COUNTS_URL, parseOpenCounts } from '../banner';
import { stockCountHref } from '../list-params';

/**
 * The amber strip under the header (BR-8, T-603): which warehouses are being
 * counted, each with a link to its count. `initial` is read on the server with
 * the (app) layout and replaces the list whenever the layout renders again
 * (stock-count writes revalidate it). The layout is kept across client
 * navigations, so the list is re-read from the server on each navigation and
 * when the tab becomes visible again — no timer polling.
 */
export function OpenStockCountBanner({ initial }: { initial: OpenStockCount[] }) {
  const t = useTranslations('stockCounts.banner');
  const pathname = usePathname();
  const [state, setState] = useState({ initial, counts: initial });
  let counts = state.counts;
  if (state.initial !== initial) {
    // New server render: it wins over anything fetched before.
    setState({ initial, counts: initial });
    counts = initial;
  }

  const lastPath = useRef(pathname);
  useEffect(() => {
    const controller = new AbortController();
    const reload = () => {
      fetch(OPEN_STOCK_COUNTS_URL, { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
          const fresh = parseOpenCounts(body);
          if (fresh) setState((current) => ({ ...current, counts: fresh }));
        })
        // Offline, aborted or signed out: keep what is shown; the next page load corrects it.
        .catch(() => {});
    };
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      reload();
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      controller.abort();
    };
  }, [pathname]);

  const visible = bannerCounts(counts, pathname);
  if (visible.length === 0) return null;

  const values = (count: OpenStockCount) => ({
    warehouse: count.warehouseName,
    number: count.number,
    link: (chunks: ReactNode) => (
      <Link
        href={stockCountHref(count.id)}
        className="font-medium whitespace-nowrap tabular-nums underline underline-offset-2 hover:no-underline"
      >
        {chunks}
      </Link>
    ),
  });

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-6 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {visible.length === 1 ? (
        <p className="min-w-0">{t.rich('single', values(visible[0]!))}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <p>{t('multiple')}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {visible.map((count) => (
              <li key={count.id}>{t.rich('item', values(count))}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
