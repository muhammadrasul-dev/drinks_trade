// PDF export (T-804, ADR-010): @react-pdf/renderer on the server, no headless
// browser. The standard PDF fonts have no Cyrillic, so Noto Sans (Latin +
// Cyrillic + ʻ ʼ, OFL) is embedded from packages/server/assets/fonts.
import { fileURLToPath } from 'node:url';

import { formatSom, groupDigits, roundHalfUp } from '@drinks/shared';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  columnsFor,
  isRedNegative,
  type ReportCell,
  type ReportColumn,
  type ReportDocument,
  type ReportRow,
} from './report-document';

const FONT_FAMILY = 'NotoSans';

/**
 * The embedded font files, resolved on first use. Next.js (Turbopack) turns
 * `new URL(…, import.meta.url)` into an emitted asset whose URL object is not
 * Node's own, so the path goes through its `href`.
 */
export function pdfFontFiles(): { regular: string; bold: string } {
  return {
    regular: fileURLToPath(
      new URL('../../../../assets/fonts/NotoSans-Regular.ttf', import.meta.url).href,
    ),
    bold: fileURLToPath(
      new URL('../../../../assets/fonts/NotoSans-Bold.ttf', import.meta.url).href,
    ),
  };
}

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const files = pdfFontFiles();
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: files.regular, fontWeight: 'normal' },
      { src: files.bold, fontWeight: 'bold' },
    ],
  });
  // Product names are not hyphenated: break only at spaces.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const MUTED = '#616161';
const RULE = '#9e9e9e';
const RED = '#c62828';

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 8.5,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 32,
    color: '#212121',
  },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  meta: { color: MUTED, marginBottom: 1 },
  table: { marginTop: 10 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 3,
  },
  header: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    paddingVertical: 3,
    fontWeight: 'bold',
    backgroundColor: '#ededed',
  },
  total: { borderTopWidth: 1, borderTopColor: RULE, borderBottomWidth: 0 },
  cell: { paddingHorizontal: 3 },
  number: { textAlign: 'right' },
  detail: { fontSize: 7, color: MUTED },
  empty: { color: MUTED, paddingVertical: 8, textAlign: 'center' },
  note: { color: MUTED, fontSize: 7.5, marginTop: 10 },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: MUTED,
    fontSize: 7,
  },
});

/** "1 250 000 soʻm"; a negative amount with a real minus sign. */
function money(amount: number, currency: string): string {
  return formatSom(amount, currency).replace(/^-/, '−');
}

/** A cell's text lines: the first is the value, the rest smaller details. */
export function pdfCellText(column: ReportColumn, value: ReportCell, currency: string): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.filter((line) => line !== '');
  switch (column.type) {
    case 'integer':
      return [groupDigits(value as number)];
    case 'money':
      return [money(value as number, currency)];
    case 'price':
      // Like the screen: the per-piece cost in whole som.
      return [money(typeof value === 'string' ? roundHalfUp(value) : (value as number), currency)];
    case 'text':
      return [String(value)];
  }
}

function Cells({
  columns,
  row,
  currency,
}: {
  columns: ReportColumn[];
  row: ReportRow;
  currency: string;
}) {
  return columns.map((column) => {
    const value = row.cells[column.key];
    const [main, ...details] = pdfCellText(column, value, currency);
    return (
      <View key={column.key} style={[styles.cell, { flexGrow: column.width, flexBasis: 0 }]}>
        <Text
          style={[
            column.type === 'text' ? {} : styles.number,
            row.emphasis ? { fontWeight: 'bold' } : {},
            isRedNegative(column, row, value) ? { color: RED } : {},
          ]}
        >
          {main ?? ''}
        </Text>
        {details.map((line, index) => (
          <Text key={index} style={[styles.detail, column.type === 'text' ? {} : styles.number]}>
            {line}
          </Text>
        ))}
      </View>
    );
  });
}

function ReportPdf({ document }: { document: ReportDocument }) {
  const columns = columnsFor(document, 'pdf');
  return (
    <Document title={document.title} creator="drinks_trade" producer="drinks_trade">
      <Page size="A4" orientation={document.orientation ?? 'portrait'} style={styles.page}>
        <Text style={styles.title}>{document.title}</Text>
        {document.meta.map((line, index) => (
          <Text key={index} style={styles.meta}>
            {line}
          </Text>
        ))}
        <View style={styles.table}>
          {/* Repeated at the top of every page the table runs onto. */}
          <View style={styles.header} fixed>
            {columns.map((column) => (
              <View
                key={column.key}
                style={[styles.cell, { flexGrow: column.width, flexBasis: 0 }]}
              >
                <Text style={column.type === 'text' ? {} : styles.number}>{column.header}</Text>
              </View>
            ))}
          </View>
          {document.rows.length === 0 && <Text style={styles.empty}>{document.emptyMessage}</Text>}
          {document.rows.map((row, index) => (
            <View
              key={index}
              wrap={false}
              style={[styles.row, row.emphasis === 'total' ? styles.total : {}]}
            >
              <Cells columns={columns} row={row} currency={document.currency} />
            </View>
          ))}
          {document.totals && (
            <View wrap={false} style={[styles.row, styles.total]}>
              <Cells
                columns={columns}
                row={{ ...document.totals, emphasis: 'total' }}
                currency={document.currency}
              />
            </View>
          )}
        </View>
        {document.note && <Text style={styles.note}>{document.note}</Text>}
        <View style={styles.footer} fixed>
          <Text>{document.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(document: ReportDocument): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportPdf document={document} />);
}
