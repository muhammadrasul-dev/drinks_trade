import { formatDateTime, type StockCountDetail } from '@drinks/shared';
import { Card, CardContent } from '@drinks/ui/components/card';
import { useTranslations } from 'next-intl';

import { MoneyText } from '@/components/money-text';
import { QtyText } from '@/components/qty-text';

/**
 * A posted or cancelled count, read-only: its counted rows (system qty is the
 * posting snapshot, none for a cancelled one) and who closed it. A posted one
 * shows OWNER the row amounts at the average it was adjusted at.
 */
export function StockCountView({ count }: { count: StockCountDetail }) {
  const t = useTranslations('stockCounts');
  const closed =
    count.status === 'CANCELLED'
      ? { label: t('view.cancelledAt'), at: count.cancelledAt, by: count.cancelledBy }
      : { label: t('view.postedAt'), at: count.postedAt, by: count.postedBy };
  // The server leaves amount keys out for STAFF (rule 6); a cancelled count has no difference.
  const showAmounts = count.status === 'POSTED' && count.shortageAmount !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {closed.at && (
            <div>
              <div className="text-muted-foreground">{closed.label}</div>
              <div className="tabular-nums">
                {formatDateTime(closed.at)}
                {closed.by && ` · ${closed.by.fullName}`}
              </div>
            </div>
          )}
          {count.note && (
            <div>
              <div className="text-muted-foreground">{t('form.note')}</div>
              <div>{count.note}</div>
            </div>
          )}
          {count.shortageAmount != null && (
            <div>
              <div className="text-muted-foreground">{t('form.shortage')}</div>
              <MoneyText amount={count.shortageAmount} />
            </div>
          )}
          {count.surplusAmount != null && (
            <div>
              <div className="text-muted-foreground">{t('form.surplus')}</div>
              <MoneyText amount={count.surplusAmount} />
            </div>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="count-lines" className="flex flex-col gap-2">
        <h2 id="count-lines" className="text-lg font-semibold">
          {t('view.lines', { count: count.countedCount })}
        </h2>
        {count.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('view.noLines')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('form.subWarehouse')}</th>
                  <th className="px-3 py-2 font-medium">{t('form.product')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('form.system')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('form.counted')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('form.diff')}</th>
                  {showAmounts && (
                    <th className="px-3 py-2 text-right font-medium">{t('form.diffAmount')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {count.rows.map((row) => (
                  <tr key={`${row.subWarehouse.id}:${row.product.id}`} className="border-t">
                    <td className="px-3 py-2">{row.subWarehouse.name}</td>
                    <td className="px-3 py-2">{row.product.name}</td>
                    <td className="px-3 py-2 text-right">
                      {row.systemQty === null ? (
                        '—'
                      ) : (
                        <QtyText qty={row.systemQty} unitsPerBlock={row.product.unitsPerBlock} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.countedQty !== null && (
                        <QtyText qty={row.countedQty} unitsPerBlock={row.product.unitsPerBlock} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.diffQty === null ? (
                        '—'
                      ) : (
                        <QtyText qty={row.diffQty} unitsPerBlock={row.product.unitsPerBlock} />
                      )}
                    </td>
                    {showAmounts && (
                      <td className="px-3 py-2 text-right">
                        {row.diffAmount == null ? '—' : <MoneyText amount={row.diffAmount} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
