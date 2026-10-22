// Liveness probe. A DB check is added once packages/db exists (T-101).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
