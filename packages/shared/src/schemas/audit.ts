import { z } from 'zod';

// Audit log filters (T-901). URL search params on /audit; the service
// re-validates. Action and entity type are free strings (unknown values are
// still filterable), but shaped like the ones the services write.

export const AUDIT_PAGE_SIZE = 50;
/** `user` filter value for rows written without a user (failed logins, CLI). */
export const AUDIT_SYSTEM_USER = 'system';

export const auditListQuerySchema = z.object({
  /** A user id or AUDIT_SYSTEM_USER. */
  user: z.union([z.uuid(), z.literal(AUDIT_SYSTEM_USER)]).optional(),
  entityType: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional(),
  action: z
    .string()
    .regex(/^[A-Z_]{1,40}$/)
    .optional(),
  /** Exact entity id (uuid or bigint id). */
  entityId: z.string().trim().min(1).max(64).optional(),
  /** Inclusive `YYYY-MM-DD` range of created_at in the store zone. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** 1-based; AUDIT_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type AuditListQuery = z.input<typeof auditListQuerySchema>;
