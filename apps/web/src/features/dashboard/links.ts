import { listHref as purchaseListHref } from '@/features/purchases/list-params';
import { stockReportHref } from '@/features/reports/stock-params';
import { listHref as saleListHref } from '@/features/sales/list-params';
import { listHref as stockCountListHref } from '@/features/stock-counts/list-params';

// Where each home page block leads (T-902): the existing lists, filtered to
// what the block counts.
export const DASHBOARD_LINKS = {
  /** The same products as the low-stock block: active ones only (OQ-39). */
  lowStock: stockReportHref({ lowStock: true, archived: false }),
  openStockCounts: stockCountListHref({ status: 'DRAFT' }),
  draftSales: saleListHref({ status: 'DRAFT' }),
  draftPurchases: purchaseListHref({ status: 'DRAFT' }),
} as const;
