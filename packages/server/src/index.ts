// Backend entry point. 'server-only' makes any client-bundle import fail at build time.
import 'server-only';

export type { ServiceContext } from './core/context';
export * from './core/locks';
export { COST_SCALE, decimalToString, moneyToBigInt, moneyToNumber } from './core/money';
export { DOC_NUMBER_PREFIX, formatDocNumber, nextDocNumber } from './core/numbering';
export { assertCan } from './core/rbac';
export { type TransactionOptions, type Tx, withTransaction } from './core/tx';
export * from './modules';
