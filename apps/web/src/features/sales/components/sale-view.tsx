import { formatDate, formatDateTime, type SaleDetail } from '@drinks/shared';
import { Card, CardContent } from '@drinks/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@drinks/ui/components/table';
import { getTranslations } from 'next-intl/server';

import { MoneyText } from '@/components/money-text';
import { QtyText } from '@/components/qty-text';

/** Read-only sale (posted or reversed): it can no longer be edited (database §6.3). */
export async function SaleView({ sale }: { sale: SaleDetail }) {
  const t = await getTranslations('sales');
  const payments = [
    { key: 'paidCash', amount: sale.paidCash },
    { key: 'paidCard', amount: sale.paidCard },
    { key: 'paidCredit', amount: sale.paidCredit },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">{t('form.date')}: </span>
            {formatDate(sale.docDate)}
          </p>
          <p>
            <span className="text-muted-foreground">{t('columns.author')}: </span>
            {sale.createdBy.fullName}
          </p>
          {sale.postedAt && (
            <p>
              <span className="text-muted-foreground">{t('view.postedAt')}: </span>
              {formatDateTime(sale.postedAt)}
              {sale.postedBy && ` · ${sale.postedBy.fullName}`}
            </p>
          )}
          {sale.reversedAt && (
            <p>
              <span className="text-muted-foreground">{t('view.reversedAt')}: </span>
              {formatDateTime(sale.reversedAt)}
              {sale.reverseReason && ` — ${sale.reverseReason}`}
            </p>
          )}
          {sale.note && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">{t('form.note')}: </span>
              {sale.note}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('form.product')}</TableHead>
              <TableHead>{t('form.subWarehouse')}</TableHead>
              <TableHead>{t('form.qty')}</TableHead>
              <TableHead>{t('form.price')}</TableHead>
              <TableHead className="text-right">{t('form.lineTotal')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums">{line.lineNo}</TableCell>
                <TableCell>{line.product.name}</TableCell>
                <TableCell>
                  {line.subWarehouse.warehouseName} / {line.subWarehouse.name}
                </TableCell>
                <TableCell>
                  <QtyText qty={line.qty} unitsPerBlock={line.product.unitsPerBlock} />
                </TableCell>
                <TableCell>
                  <MoneyText amount={line.unitPrice} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText amount={line.lineTotal} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="flex justify-between">
            <span className="font-semibold">{t('form.total')}</span>
            <MoneyText amount={sale.totalAmount} className="font-semibold" />
          </p>
          {payments.map((payment) => (
            <p key={payment.key} className="flex justify-between">
              <span className="text-muted-foreground">{t(`form.${payment.key}`)}</span>
              <MoneyText amount={payment.amount} />
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
