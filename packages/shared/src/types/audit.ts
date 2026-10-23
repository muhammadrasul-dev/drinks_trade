// Audit log DTOs (T-901). OWNER only (audit.read); secret keys are already
// stripped by the service (redactAuditValue).

export interface AuditActorDto {
  id: string;
  fullName: string;
  username: string;
}

export interface AuditEntryDto {
  /** audit_log.id (BIGINT) as a string. */
  id: string;
  createdAt: Date;
  /** null: a system event (failed login, CLI password reset) — shown as "System". */
  user: AuditActorDto | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  /** meta without `backdated` (ip, reason, requestId, …). */
  meta: Record<string, unknown>;
  /** BR-13: the document date was before the day it was entered. */
  backdated: boolean;
}

export interface AuditPage {
  items: AuditEntryDto[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * Names of the entities the page's rows are about or point at (entity_id
   * and AUDIT_REF_KEYS inside before/after), keyed by id. An id that is
   * missing here no longer exists (e.g. a deleted draft) or has no name.
   */
  refs: Record<string, string>;
}

/** The user filter's choices: every account of the organization. */
export interface AuditUserOption {
  id: string;
  fullName: string;
  username: string;
  isActive: boolean;
}
