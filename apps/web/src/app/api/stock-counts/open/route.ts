import { stockCounts } from '@drinks/server';
import { ErrorCode, isDomainError } from '@drinks/shared';

import { getCurrentSession, getServiceContext } from '@/lib/session';

// Open (DRAFT) stock counts of the store for the (app) banner (T-603). The
// banner's first list comes with the layout; Next.js keeps the layout across
// client navigations, so the banner re-reads this on each navigation (and when
// the tab becomes visible again) to show counts opened or closed elsewhere.
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  try {
    const counts = await stockCounts.openCounts(await getServiceContext(session));
    return Response.json(counts, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return new Response(null, { status: error.code === ErrorCode.FORBIDDEN ? 403 : 400 });
  }
}
