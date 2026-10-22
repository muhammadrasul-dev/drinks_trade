// Error codes are the contract between server and UI: the server throws a code,
// the UI translates it (messages/*.json → errors.<CODE>). Source of truth:
// .claude/docs/business-logic.md §10.

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  DOCUMENT_CHANGED: 'DOCUMENT_CHANGED',
  DOCUMENT_NOT_DRAFT: 'DOCUMENT_NOT_DRAFT',
  DOCUMENT_NOT_POSTED: 'DOCUMENT_NOT_POSTED',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PURCHASE_REVERSAL_INSUFFICIENT_STOCK: 'PURCHASE_REVERSAL_INSUFFICIENT_STOCK',
  WAREHOUSE_IN_STOCK_COUNT: 'WAREHOUSE_IN_STOCK_COUNT',
  STOCK_COUNT_ALREADY_OPEN: 'STOCK_COUNT_ALREADY_OPEN',
  PAYMENT_SPLIT_MISMATCH: 'PAYMENT_SPLIT_MISMATCH',
  CASHBOX_INSUFFICIENT: 'CASHBOX_INSUFFICIENT',
  DEBT_HAS_REPAYMENTS: 'DEBT_HAS_REPAYMENTS',
  DEBT_CANCELLED: 'DEBT_CANCELLED',
  DEBT_OVERPAYMENT: 'DEBT_OVERPAYMENT',
  NOTE_REQUIRED: 'NOTE_REQUIRED',
  ENTITY_NOT_EMPTY: 'ENTITY_NOT_EMPTY',
  ENTITY_ARCHIVED: 'ENTITY_ARCHIVED',
  DUPLICATE_VALUE: 'DUPLICATE_VALUE',
  DOC_DATE_IN_FUTURE: 'DOC_DATE_IN_FUTURE',
  UNITS_PER_BLOCK_CHANGED: 'UNITS_PER_BLOCK_CHANGED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_INACTIVE: 'USER_INACTIVE',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  CURRENT_PASSWORD_INVALID: 'CURRENT_PASSWORD_INVALID',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Values interpolated into the translated message (product name, available qty…). */
export type ErrorParams = Record<string, unknown>;

/** Per-field messages, used with VALIDATION_FAILED. */
export type FieldErrors = Record<string, string[]>;

/** The only error type services throw for expected business failures. */
export class DomainError extends Error {
  override readonly name = 'DomainError';
  readonly code: ErrorCode;
  readonly params?: ErrorParams;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, params?: ErrorParams, fieldErrors?: FieldErrors) {
    super(code);
    this.code = code;
    if (params !== undefined) this.params = params;
    if (fieldErrors !== undefined) this.fieldErrors = fieldErrors;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export interface ActionError {
  code: ErrorCode;
  params?: ErrorParams;
  fieldErrors?: FieldErrors;
}

/** What every Server Action returns (architecture §4.2). */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };
