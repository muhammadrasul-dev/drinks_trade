import { type CashboxBalance, formatDateTime } from '@drinks/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@drinks/ui/components/card';
import { BanknoteIcon, CreditCardIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MoneyText } from '@/components/money-text';

const ICONS = { CASH: BanknoteIcon, CARD: CreditCardIcon } as const;

/** Current balance of each cashbox (FR-6.1), side by side. */
export function CashBalances({ balances }: { balances: readonly CashboxBalance[] }) {
  const t = useTranslations('cash.balances');
  const tCashbox = useTranslations('enums.CashboxType');
  return (
    <section aria-label={t('label')} className="grid gap-4 sm:grid-cols-2">
      {balances.map((box) => {
        const Icon = ICONS[box.type];
        return (
          <Card key={box.id} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="size-4" aria-hidden />
                {tCashbox(box.type)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 px-4">
              <MoneyText amount={box.balance} className="text-2xl font-semibold" />
              <CardDescription className="text-xs">
                {t('updatedAt', { date: formatDateTime(box.updatedAt) })}
              </CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
