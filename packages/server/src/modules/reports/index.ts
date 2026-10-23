import { pnlReport } from './pnl-report.queries';
import { salesReport } from './sales-report.queries';
import { stockReport } from './stock-report.queries';

/**
 * Reports (Bosqich 8, SRS §7): read-only queries; cost columns only for
 * `report.sales.cost`, the P&L only for `report.pnl`.
 */
export const reports = { stock: stockReport, sales: salesReport, pnl: pnlReport };

// PDF / Excel of a report (T-804): render a translated ReportDocument built
// from one of the DTOs above.
export * from './export';
