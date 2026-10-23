import type { DebtTotals as DebtTotalsDto } from '@drinks/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@drinks/ui/components/card';
import { ArrowDownLeftIcon, ArrowUpRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MoneyText } from '@/components/money-text';

/** Open balance of each direction (BR-10: Σ amount − repaid of OPEN debts), side by side. */
export function DebtTotals({ totals }: { totals: DebtTotalsDto }) {
  const t = useTranslations('debts.totals');
  const tDirection = useTranslations('enums.DebtDirection');
  const cards = [
    { direction: 'RECEIVABLE', amount: totals.receivable, Icon: ArrowDownLeftIcon },
    { direction: 'PAYABLE', amount: totals.payable, Icon: ArrowUpRightIcon },
  ] as const;
  return (
    <section aria-label={t('label')} className="grid gap-4 sm:grid-cols-2">
      {cards.map(({ direction, amount, Icon }) => (
        <Card key={direction} className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Icon className="size-4" aria-hidden />
              {tDirection(direction)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-4">
            <MoneyText amount={amount} className="text-2xl font-semibold" />
            <p className="text-xs text-muted-foreground">{t('hint')}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
