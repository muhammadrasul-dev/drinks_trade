import { products } from '@drinks/server';
import { ErrorCode, isDomainError } from '@drinks/shared';

import { getCurrentSession, getServiceContext } from '@/lib/session';

// Product image (T-303): files live outside public/ (StorageAdapter,
// architecture §9), so they are served only to signed-in users. The URL
// carries ?v=<version> and a new image gets a new version, so the response
// can be cached for good.
export async function GET(_request: Request, { params }: RouteContext<'/api/products/[id]/image'>) {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const image = await products.readImage(await getServiceContext(session), { id });
    return new Response(new Blob([image.data as Uint8Array<ArrayBuffer>]), {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return new Response(null, { status: error.code === ErrorCode.FORBIDDEN ? 403 : 404 });
  }
}
