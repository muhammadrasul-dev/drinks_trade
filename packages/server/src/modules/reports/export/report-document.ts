// Report export (T-804, ADR-010, architecture §4.3): one format-neutral,
// already translated table that both builders (PDF, Excel) render. The caller
// builds it from a reports.* DTO, which the service has already cut down to the
// user's role — a column the DTO lacks (STAFF cost, profit) cannot be exported
// (CLAUDE.md rule 6).

/**
 * - `text` — as is; an array is a main line plus smaller detail lines.
 * - `integer` — a whole count (pieces, documents), grouped digits.
 * - `money` — whole som (number).
 * - `price` — som with a fraction, as a decimal string (average cost, `CostString`);
 *   the PDF rounds it to whole som like the screen, Excel keeps the value.
 */
export type ReportColumnType = 'text' | 'integer' | 'money' | 'price';

export interface ReportColumn {
  key: string;
  header: string;
  type: ReportColumnType;
  /** Excel: column width in characters; PDF: the column's share of the row. */
  width: number;
  /** Rendered only in this format (default: both). */
  only?: 'pdf' | 'xlsx';
  /** A negative value is red (profit columns). */
  negativeRed?: boolean;
  /** Excel: the totals cell is `SUM()` of the column, the given total its cached result. */
  sum?: boolean;
}

/** A text cell may be several lines; numbers go to `integer` / `money` columns, decimals to `price`. */
export type ReportCell = string | readonly string[] | number | null | undefined;

export interface ReportRow {
  cells: Readonly<Record<string, ReportCell>>;
  /** subtotal — bold; total — bold with a rule above. */
  emphasis?: 'subtotal' | 'total';
  /** A negative money value in this row is red, whatever the column says (P&L profits). */
  negativeRed?: boolean;
}

export interface ReportDocument {
  title: string;
  /** Lines under the title: period, filters, when it was made. */
  meta: readonly string[];
  columns: readonly ReportColumn[];
  rows: readonly ReportRow[];
  /** The totals row after the rows (bold, rule above). */
  totals?: ReportRow;
  /** Shown instead of rows when there are none. */
  emptyMessage: string;
  /** A remark after the table. */
  note?: string;
  /** The money unit after amounts: "soʻm" / "сум". */
  currency: string;
  /** Excel sheet name (cut to 31 characters, `[]:*?/\` replaced). */
  sheetName: string;
  /** PDF page orientation (default portrait). */
  orientation?: 'portrait' | 'landscape';
}

/** The columns one format renders. */
export function columnsFor(
  document: Pick<ReportDocument, 'columns'>,
  format: 'pdf' | 'xlsx',
): ReportColumn[] {
  return document.columns.filter((column) => !column.only || column.only === format);
}

/** Red for a negative money value of this column in this row. */
export function isRedNegative(column: ReportColumn, row: ReportRow, value: ReportCell): boolean {
  return typeof value === 'number' && value < 0 && Boolean(column.negativeRed || row.negativeRed);
}
