import { type AuditListQuery, auditListQuerySchema } from '@drinks/shared/schemas';

import { hrefWith, pageParam, schemaParam, type SearchParams } from '@/lib/search-params';

// /audit filters live in the URL (?user=&type=&action=&entity=&from=&to=&page=),
// like /purchases. Invalid values are dropped, never an error page.

export const AUDIT_HREF = '/audit';

export interface AuditListFilters {
  /** A user id or "system". */
  user?: string;
  entityType?: string;
  action?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
}

const fields = auditListQuerySchema.shape;

/** URL search params → service query; each invalid value is dropped on its own. */
export function parseListParams(params: SearchParams): AuditListFilters & AuditListQuery {
  const user = schemaParam(fields.user, params.user);
  const entityType = schemaParam(fields.entityType, params.type);
  const action = schemaParam(fields.action, params.action);
  const entityId = schemaParam(fields.entityId, params.entity);
  const from = schemaParam(fields.from, params.from);
  const to = schemaParam(fields.to, params.to);
  const page = pageParam(params.page);
  return {
    ...(user && { user }),
    ...(entityType && { entityType }),
    ...(action && { action }),
    ...(entityId && { entityId }),
    ...(from && { from }),
    ...(to && { to }),
    ...(page && { page }),
  };
}

/** Filters → `/audit?…` (page 1 and empty values left out). */
export function listHref(filters: AuditListFilters): string {
  return hrefWith(AUDIT_HREF, {
    user: filters.user,
    type: filters.entityType,
    action: filters.action,
    entity: filters.entityId,
    from: filters.from,
    to: filters.to,
    page: filters.page,
  });
}
