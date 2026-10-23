import { type AuthSession, stockCounts } from '@drinks/server';

import { OpenStockCountBanner } from '@/features/stock-counts/components/open-stock-count-banner';
import { getServiceContext } from '@/lib/session';

/**
 * Open stock-count warning on every (app) page, both roles (BR-8,
 * architecture §6): "Warehouse X is being counted (I-000007)" + link. The
 * list is read on the server with the layout; the client part keeps it fresh
 * across client navigations (see OpenStockCountBanner).
 */
export async function StockCountBanner({ session }: { session: AuthSession }) {
  const counts = await stockCounts.openCounts(await getServiceContext(session));
  return <OpenStockCountBanner initial={counts} />;
}
