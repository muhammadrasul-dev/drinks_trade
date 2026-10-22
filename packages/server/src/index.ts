// Backend entry point. 'server-only' makes any client-bundle import fail at build time.
import 'server-only';

export type { ServiceContext } from './core/context';
export { assertCan } from './core/rbac';
