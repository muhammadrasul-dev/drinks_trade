import { salesReport } from './sales-report.queries';
import { stockReport } from './stock-report.queries';

/** Reports (Bosqich 8, SRS §7): read-only queries; cost columns only for `report.sales.cost`. */
export const reports = { stock: stockReport, sales: salesReport };
