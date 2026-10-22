// Audit trail (BR-12, ADR-013): every writing service calls audit.log(tx, …)
// inside its own transaction, so the change and its audit row commit or roll
// back together. audit_log is append-only (DB trigger).
import type { Prisma } from '@drinks/db';

import type { ServiceContext } from '../../core/context';
import type { Tx } from '../../core/tx';

/** Store-level default; matches store.timezone and APP_TIMEZONE (architecture §8.2). */
export const DEFAULT_TIME_ZONE = 'Asia/Tashkent';

/** Who acted. `user: null` for system events without a session (e.g. LOGIN_FAILED). */
export type AuditActor = Pick<ServiceContext, 'requestId'> & {
  user: Pick<ServiceContext['user'], 'id'> | null;
  storeId: string | null;
};

export interface AuditEntry {
  /** CREATE | UPDATE | DELETE | POST | REVERSE | CANCEL | ARCHIVE | LOGIN | LOGIN_FAILED | … */
  action: string;
  /** Table-style name: "sale", "product", … */
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** BR-13: the document date is before today (see isBackdated). */
  backdated?: boolean;
  /** Extra context merged into meta (ip, reason, …). */
  meta?: Record<string, unknown>;
}

/**
 * Plain-JSON copy for the Json columns: bigint → string (database.md §6.7),
 * Decimal/Date via their toJSON. Never pass password hashes or session tokens.
 */
export function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

function calendarDate(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, so the strings compare chronologically.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** BR-13 / business-logic §4.1: docDate falls on a day before today in the store's zone. */
export function isBackdated(
  docDate: Date,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  return calendarDate(docDate, timeZone) < calendarDate(now, timeZone);
}

async function log(tx: Tx, actor: AuditActor, entry: AuditEntry): Promise<void> {
  const meta: Record<string, unknown> = { ...entry.meta, requestId: actor.requestId };
  if (entry.backdated) meta.backdated = true;

  await tx.auditLog.create({
    data: {
      storeId: actor.storeId,
      userId: actor.user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before !== undefined && { before: toAuditJson(entry.before) }),
      ...(entry.after !== undefined && { after: toAuditJson(entry.after) }),
      meta: toAuditJson(meta),
    },
  });
}

export const audit = { log };
