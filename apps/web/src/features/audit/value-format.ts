// How /audit shows a single before/after/meta value (T-901). Pure, so the
// rules are unit-tested; audit-value.tsx turns the result into markup.
import {
  AUDIT_REF_KEYS,
  formatDate,
  formatDateTime,
  isAuditDateTime,
  isUuid,
} from '@drinks/shared';

/** Whole-som amounts in purchase / sale / cash / debt rows (money is a `number` in audit JSON). */
const MONEY_KEYS = new Set([
  'salePrice',
  'totalAmount',
  'paidCash',
  'paidCard',
  'paidCredit',
  'inputPrice',
  'lineTotal',
  'amount',
  'balanceAfter',
]);

/** Dates whose time of day carries no meaning. */
const DATE_ONLY_KEYS = new Set(['expiryDate', 'debtDate']);

/** Message namespace of keys whose value is an enum member, per entity type where it differs. */
function enumOf(key: string, entityType: string): string | undefined {
  switch (key) {
    case 'role':
      return 'enums.UserRole';
    case 'locale':
      return 'enums.Locale';
    case 'inputUnit':
      return 'enums.QtyUnit';
    case 'status':
      if (entityType === 'stock_count') return 'enums.StockCountStatus';
      if (entityType === 'debt') return 'enums.DebtStatus';
      return 'enums.DocStatus';
    case 'direction':
      return entityType === 'debt' ? 'enums.DebtDirection' : 'enums.CashDirection';
    case 'type':
      return entityType === 'cash_transaction' ? 'enums.CashTxType' : undefined;
    case 'source':
      if (entityType === 'debt') return 'enums.DebtSource';
      // PASSWORD_RESET meta: who set the password (owner / self / cli).
      return entityType === 'user' ? 'audit.sources' : undefined;
    default:
      return undefined;
  }
}

export type AuditValueView =
  | { kind: 'empty' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'ref'; id: string; name?: string }
  | { kind: 'money'; amount: number }
  | { kind: 'enum'; namespace: string; value: string }
  | { kind: 'text'; text: string; mono?: boolean };

/**
 * One value → what to show. `refs` are the names the audit service resolved
 * (AuditPage.refs). Objects and lists of objects that reach here are shown
 * as compact JSON (lists of document lines get their own table upstream).
 */
export function auditValueView(
  key: string,
  value: unknown,
  entityType: string,
  refs: Readonly<Record<string, string>>,
): AuditValueView {
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (Object.hasOwn(AUDIT_REF_KEYS, key) && isUuid(value)) {
    const name = refs[value];
    return { kind: 'ref', id: value, ...(name !== undefined && { name }) };
  }
  if (MONEY_KEYS.has(key)) {
    const amount = typeof value === 'string' ? Number(value) : value;
    if (typeof amount === 'number' && Number.isSafeInteger(amount))
      return { kind: 'money', amount };
  }
  if (isAuditDateTime(value)) {
    const date = new Date(value);
    return {
      kind: 'text',
      text: DATE_ONLY_KEYS.has(key) ? formatDate(date) : formatDateTime(date),
    };
  }
  const namespace = typeof value === 'string' ? enumOf(key, entityType) : undefined;
  if (namespace && typeof value === 'string') return { kind: 'enum', namespace, value };
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object' || item === null)) {
    return { kind: 'text', text: value.map(String).join(', ') };
  }
  if (typeof value === 'object') return { kind: 'text', text: JSON.stringify(value), mono: true };
  return { kind: 'text', text: String(value), ...(isUuid(value) && { mono: true }) };
}
