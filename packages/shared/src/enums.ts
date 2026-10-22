// Prisma-independent enums, browser-safe. Must stay identical to the Prisma
// enums in .claude/docs/database.md §4 (checked by a unit test in T-101).
// Shape mirrors Prisma's generated enums: a const object plus a union type.

export const UserRole = {
  OWNER: 'OWNER',
  STAFF: 'STAFF',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Locale = {
  uz: 'uz',
  ru: 'ru',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];

export const DocStatus = {
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
} as const;
export type DocStatus = (typeof DocStatus)[keyof typeof DocStatus];

export const StockCountStatus = {
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;
export type StockCountStatus = (typeof StockCountStatus)[keyof typeof StockCountStatus];

export const QtyUnit = {
  PIECE: 'PIECE',
  BLOCK: 'BLOCK',
} as const;
export type QtyUnit = (typeof QtyUnit)[keyof typeof QtyUnit];

export const MovementType = {
  PURCHASE: 'PURCHASE',
  PURCHASE_REVERSAL: 'PURCHASE_REVERSAL',
  SALE: 'SALE',
  SALE_REVERSAL: 'SALE_REVERSAL',
  COUNT_ADJUSTMENT: 'COUNT_ADJUSTMENT',
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

export const CashboxType = {
  CASH: 'CASH',
  CARD: 'CARD',
} as const;
export type CashboxType = (typeof CashboxType)[keyof typeof CashboxType];

export const CashDirection = {
  IN: 'IN',
  OUT: 'OUT',
} as const;
export type CashDirection = (typeof CashDirection)[keyof typeof CashDirection];

export const CashTxType = {
  SALE_RECEIPT: 'SALE_RECEIPT',
  SALE_REFUND: 'SALE_REFUND',
  PURCHASE_PAYMENT: 'PURCHASE_PAYMENT',
  PURCHASE_REFUND: 'PURCHASE_REFUND',
  DEBT_TAKEN: 'DEBT_TAKEN',
  DEBT_GIVEN: 'DEBT_GIVEN',
  DEBT_REPAID_BY_ME: 'DEBT_REPAID_BY_ME',
  DEBT_REPAID_TO_ME: 'DEBT_REPAID_TO_ME',
  TRAVEL_EXPENSE: 'TRAVEL_EXPENSE',
  OTHER_EXPENSE: 'OTHER_EXPENSE',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  MANUAL_REVERSAL: 'MANUAL_REVERSAL',
} as const;
export type CashTxType = (typeof CashTxType)[keyof typeof CashTxType];

export const DebtDirection = {
  RECEIVABLE: 'RECEIVABLE',
  PAYABLE: 'PAYABLE',
} as const;
export type DebtDirection = (typeof DebtDirection)[keyof typeof DebtDirection];

export const DebtSource = {
  MANUAL: 'MANUAL',
  SALE: 'SALE',
  PURCHASE: 'PURCHASE',
} as const;
export type DebtSource = (typeof DebtSource)[keyof typeof DebtSource];

export const DebtStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type DebtStatus = (typeof DebtStatus)[keyof typeof DebtStatus];

export const DocType = {
  SALE: 'SALE',
  PURCHASE: 'PURCHASE',
  STOCK_COUNT: 'STOCK_COUNT',
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];
