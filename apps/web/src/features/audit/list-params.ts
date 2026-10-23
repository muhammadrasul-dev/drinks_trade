import { type AuditListQuery, auditListQuerySchema } from '@drinks/shared/schemas';
import type { z } from 'zod';

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

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const fields = auditListQuerySchema.shape;

function valid<T extends z.ZodType>(schema: T, value: string | undefined): z.output<T> | undefined {
  if (!value) return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** URL search params → service query; each invalid value is dropped on its own. */
export function parseListParams(params: SearchParams): AuditListFilters & AuditListQuery {
  const user = valid(fields.user, first(params.user));
  const entityType = valid(fields.entityType, first(params.type));
  const action = valid(fields.action, first(params.action));
  const entityId = valid(fields.entityId, first(params.entity));
  const from = valid(fields.from, first(params.from));
  const to = valid(fields.to, first(params.to));
  const page = Number(first(params.page));
  return {
    ...(user && { user }),
    ...(entityType && { entityType }),
    ...(action && { action }),
    ...(entityId && { entityId }),
    ...(from && { from }),
    ...(to && { to }),
    ...(Number.isSafeInteger(page) && page > 1 && { page }),
  };
}

/** Filters → `/audit?…` (page 1 and empty values left out). */
export function listHref(filters: AuditListFilters): string {
  const params = new URLSearchParams();
  if (filters.user) params.set('user', filters.user);
  if (filters.entityType) params.set('type', filters.entityType);
  if (filters.action) params.set('action', filters.action);
  if (filters.entityId) params.set('entity', filters.entityId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${AUDIT_HREF}?${query}` : AUDIT_HREF;
}
