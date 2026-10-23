import { pnlReport } from './pnl-report.queries';
import { salesReport } from './sales-report.queries';
import { stockReport } from './stock-report.queries';

/**
 * Reports (Bosqich 8, SRS §7): read-only queries; cost columns only for
 * `report.sales.cost`, the P&L only for `report.pnl`.
 */
export const reports = { stock: stockReport, sales: salesReport, pnl: pnlReport };
