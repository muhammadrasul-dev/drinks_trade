import { reports, renderReportPdf, renderReportXlsx, type ReportDocument } from '@drinks/server';
import { DomainError, ErrorCode, type SalesReport, UserRole } from '@drinks/shared';
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCurrentSession } from '@/lib/session';

import { GET } from './route';

vi.mock('@drinks/server', () => ({
  reports: { stock: vi.fn(), sales: vi.fn(), pnl: vi.fn() },
  warehouses: { options: vi.fn(async () => []) },
  categories: { list: vi.fn(async () => []) },
  brands: { list: vi.fn(async () => []) },
  renderReportPdf: vi.fn(async () => Buffer.from('%PDF-1.3')),
  renderReportXlsx: vi.fn(async () => Buffer.from('PK')),
}));

vi.mock('@/lib/session', () => ({
  getCurrentSession: vi.fn(),
  getServiceContext: vi.fn(async (session: { user: unknown }) => ({ user: session.user })),
}));

const session = (role: UserRole) => ({
  user: { id: 'u1', username: 'ali', fullName: 'Ali', role, locale: 'uz' as const },
  organizationId: 'o1',
  storeId: 's1',
  expiresAt: new Date('2026-11-21'),
});

/** What the service returns to STAFF: no cost / profit keys (rule 6). */
const STAFF_SALES: SalesReport = { items: [], totals: { products: 0, sales: 0, revenue: 0 } };

function request(path: string): [NextRequest, { params: Promise<{ report: string }> }] {
  const url = new URL(path, 'http://localhost');
  const report = url.pathname.split('/')[3]!;
  return [{ nextUrl: url } as NextRequest, { params: Promise.resolve({ report }) }];
}

const lastDocument = (render: typeof renderReportPdf): ReportDocument =>
  vi.mocked(render).mock.calls.at(-1)![0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue(session(UserRole.STAFF));
  vi.mocked(reports.sales).mockResolvedValue(STAFF_SALES);
});

describe('GET /api/reports/[report]/export (T-804)', () => {
  it('401 without a session, before any service call', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const response = await GET(...request('/api/reports/sales/export?format=pdf'));
    expect(response.status).toBe(401);
    expect(reports.sales).not.toHaveBeenCalled();
  });

  it('404 for an unknown report, 400 for a missing or unknown format', async () => {
    expect((await GET(...request('/api/reports/cash/export?format=pdf'))).status).toBe(404);
    expect((await GET(...request('/api/reports/sales/export'))).status).toBe(400);
    expect((await GET(...request('/api/reports/sales/export?format=csv'))).status).toBe(400);
  });

  it('STAFF: the P&L is 403 without reading it, like the page', async () => {
    const response = await GET(...request('/api/reports/pnl/export?format=xlsx'));
    expect(response.status).toBe(403);
    expect(reports.pnl).not.toHaveBeenCalled();
    expect(renderReportXlsx).not.toHaveBeenCalled();
  });

  it('STAFF sales export: the page filters reach the service, no cost columns, a download', async () => {
    const response = await GET(
      ...request('/api/reports/sales/export?format=xlsx&from=2026-10-23&to=2026-10-01'),
    );
    expect(response.status).toBe(200);
    // Parsed like the page: a reversed range is swapped.
    expect(reports.sales).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-10-01',
      to: '2026-10-23',
    });
    const document = lastDocument(renderReportXlsx);
    expect(document.columns.map((column) => column.key)).not.toContain('cost');
    expect(document.columns.map((column) => column.key)).not.toContain('grossProfit');
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="sales_2026-10-01_2026-10-23.xlsx"; filename*=UTF-8''savdo_2026-10-01_2026-10-23.xlsx`,
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('PK');
  });

  it("the page's language from ?locale, else the user's own", async () => {
    await GET(...request('/api/reports/sales/export?format=pdf&locale=ru'));
    expect(lastDocument(renderReportPdf).title).toBe('Отчёт по продажам');
    await GET(...request('/api/reports/sales/export?format=pdf&locale=en'));
    expect(lastDocument(renderReportPdf).title).toBe('Savdo hisoboti');
  });

  it('OWNER P&L of a month: the month as the period and the file name', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session(UserRole.OWNER));
    vi.mocked(reports.pnl).mockResolvedValue({
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      travelExpense: 0,
      stockShortage: 0,
      stockSurplus: 0,
      netProfit: 0,
      counts: { sales: 0, travelExpenses: 0, stockCounts: 0 },
    });
    const response = await GET(...request('/api/reports/pnl/export?format=pdf&month=2026-09'));
    expect(response.status).toBe(200);
    expect(reports.pnl).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('filename="pnl_2026-09.pdf"');
  });

  it('a service refusal maps to 403 / 400', async () => {
    vi.mocked(reports.sales).mockRejectedValueOnce(new DomainError(ErrorCode.FORBIDDEN));
    expect((await GET(...request('/api/reports/sales/export?format=pdf'))).status).toBe(403);
    vi.mocked(reports.sales).mockRejectedValueOnce(new DomainError(ErrorCode.VALIDATION_FAILED));
    expect((await GET(...request('/api/reports/sales/export?format=pdf'))).status).toBe(400);
  });
});
