// Audit log reading (T-901, BR-12, architecture §5.4). Pure helpers shared by
// the audit query service and the /audit page: the known action and entity
// names, secret-key redaction and the before/after diff.

/** entity_type values written by the services (audit.log callers). Others still show, untranslated. */
export const AUDIT_ENTITY_TYPES = [
  'user',
  'category',
  'brand',
  'product',
  'warehouse',
  'sub_warehouse',
  'purchase',
  'sale',
  'stock_count',
  'cash_transaction',
  'debt',
  'debt_repayment',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** action values written by the services. Others still show, untranslated. */
export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'ARCHIVE',
  'RESTORE',
  'POST',
  'REVERSE',
  'CANCEL',
  'LOGIN',
  'LOGIN_FAILED',
  'PASSWORD_RESET',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_ACTIVATE',
  'USER_DEACTIVATE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Keys inside before/after that point at another entity (`productId` in a
 * purchase line, …). The audit service resolves them to names, the page shows
 * the name instead of the bare id.
 */
export const AUDIT_REF_KEYS = {
  productId: 'product',
  categoryId: 'category',
  brandId: 'brand',
  warehouseId: 'warehouse',
  subWarehouseId: 'sub_warehouse',
  purchaseId: 'purchase',
  saleId: 'sale',
  stockCountId: 'stock_count',
  cashboxId: 'cashbox',
  userId: 'user',
  createdById: 'user',
} as const satisfies Record<string, string>;
export type AuditRefType = (typeof AUDIT_REF_KEYS)[keyof typeof AUDIT_REF_KEYS];

const SECRET_KEY = /pass(word)?|hash|token|secret/i;

/**
 * Keys never shown, even if a writer put them in by mistake (database.md §6.7:
 * no password hashes or session tokens in the audit log).
 */
export function isSecretAuditKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep copy without secret keys (see isSecretAuditKey). */
export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSecretAuditKey(key))
        .map(([key, item]) => [key, redactAuditValue(item)]),
    );
  }
  return value;
}

/** Structural equality of JSON values (key order ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => jsonEqual(item, b[i]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => jsonEqual(a[key], b[key]));
  }
  return false;
}

export type AuditChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface AuditChange {
  key: string;
  kind: AuditChangeKind;
  /** undefined when the key is absent on that side. */
  before?: unknown;
  after?: unknown;
}

function kindOf(hasBefore: boolean, hasAfter: boolean, before: unknown, after: unknown) {
  if (!hasBefore) return 'added';
  if (!hasAfter) return 'removed';
  return jsonEqual(before, after) ? 'unchanged' : 'changed';
}

/** A non-object side (a bare value) is shown under this key. */
export const AUDIT_VALUE_KEY = 'value';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  return isPlainObject(value) ? value : { [AUDIT_VALUE_KEY]: value };
}

/**
 * Field-level diff of an audit row. With both sides present (UPDATE, ARCHIVE,
 * …) only changed keys are returned; with one side (CREATE / DELETE) every
 * key. Secret keys are dropped. Order: `after`'s keys, then removed ones.
 */
export function auditChanges(before: unknown, after: unknown): AuditChange[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])];
  const changes = keys
    .filter((key) => !isSecretAuditKey(key))
    .map((key): AuditChange => {
      const hasBefore = b !== undefined && Object.hasOwn(b, key);
      const hasAfter = a !== undefined && Object.hasOwn(a, key);
      return {
        key,
        kind: kindOf(hasBefore, hasAfter, b?.[key], a?.[key]),
        ...(hasBefore && { before: redactAuditValue(b[key]) }),
        ...(hasAfter && { after: redactAuditValue(a[key]) }),
      };
    });
  return b && a ? changes.filter((change) => change.kind !== 'unchanged') : changes;
}

export interface AuditListItemChange {
  /** `lineNo` when every item has one, else the 1-based position. */
  key: number;
  kind: AuditChangeKind;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Fields that differ (empty unless kind is `changed`). */
  changedKeys: string[];
}

function lineKeyed(items: readonly unknown[]): Map<number, Record<string, unknown>> | undefined {
  const map = new Map<number, Record<string, unknown>>();
  for (const item of items) {
    if (!isPlainObject(item) || typeof item.lineNo !== 'number' || map.has(item.lineNo)) {
      return undefined;
    }
    map.set(item.lineNo, item);
  }
  return map;
}

function positionKeyed(items: readonly unknown[]): Map<number, Record<string, unknown>> {
  return new Map(items.map((item, i) => [i + 1, asRecord(item) ?? {}]));
}

/** True for a non-empty array of objects — rendered as a small table (document lines). */
export function isAuditRowList(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

/**
 * Row-level diff of two lists (document lines): matched by `lineNo` when all
 * items carry a unique one, else by position. Every row is returned so the
 * table stays complete; `kind` marks what happened to it.
 */
export function auditListChanges(
  before: readonly unknown[] | undefined,
  after: readonly unknown[] | undefined,
): AuditListItemChange[] {
  const b = before ?? [];
  const a = after ?? [];
  const bLines = lineKeyed(b);
  const aLines = lineKeyed(a);
  const byLine = bLines !== undefined && aLines !== undefined;
  const bMap = byLine ? bLines : positionKeyed(b);
  const aMap = byLine ? aLines : positionKeyed(a);
  const keys = [...new Set([...aMap.keys(), ...bMap.keys()])].sort((x, y) => x - y);
  return keys.map((key) => {
    const oldRow = bMap.get(key);
    const newRow = aMap.get(key);
    const fields = auditChanges(oldRow, newRow);
    const kind = kindOf(oldRow !== undefined, newRow !== undefined, oldRow, newRow);
    return {
      key,
      kind,
      ...(oldRow && { before: redactAuditValue(oldRow) as Record<string, unknown> }),
      ...(newRow && { after: redactAuditValue(newRow) as Record<string, unknown> }),
      changedKeys: kind === 'changed' ? fields.map((field) => field.key) : [],
    };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Every (type, id) that before/after point at through AUDIT_REF_KEYS, nested
 * lists included — the audit service looks their names up in one go.
 */
export function collectAuditRefs(
  value: unknown,
  into: Map<string, string> = new Map(),
): Map<string, string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAuditRefs(item, into);
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const type = (AUDIT_REF_KEYS as Record<string, AuditRefType>)[key];
      if (type && isUuid(item)) into.set(item, type);
      else collectAuditRefs(item, into);
    }
  }
  return into;
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** A Date serialized by JSON (`toISOString`), e.g. `archivedAt`, `docDate`. */
export function isAuditDateTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}
