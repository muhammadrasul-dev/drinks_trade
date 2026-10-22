import type { Locale, UserRole } from '@drinks/shared';

/** Per-request identity passed to every service (architecture §5.2). */
export interface ServiceContext {
  user: { id: string; role: UserRole; locale: Locale };
  /** v1 has a single store; later a branch picker sets it. */
  storeId: string;
  organizationId: string;
  /** Correlates logs and audit rows of one request. */
  requestId: string;
}
