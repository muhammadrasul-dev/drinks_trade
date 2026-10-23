import type { PnlReport } from '@drinks/shared';
import { Card, CardContent } from '@drinks/ui/components/card';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

import { MoneyText } from '@/components/money-text';

type Sign = '+' | '−' | '';

interface Line {
  key: 'revenue' | 'cogs' | 'grossProfit' | 'travelExpense' | 'stockShortage' | 'stockSurplus';
  sign: Sign;
  hint?: string;
  /** A subtotal: bold, with a rule above. */
  total?: boolean;
}

/**
 * The BR-11 statement (business-logic §8): revenue − COGS = gross profit,
 * − travel, − shortage, + surplus = net profit. Expenses carry their sign;
 * a negative profit is red.
 */
export function PnlStatement({ report }: { report: PnlReport }) {
  const t = useTranslations('pnlReport');
  const lines: Line[] = [
    { key: 'revenue', sign: '', hint: t('hints.sales', { count: report.counts.sales }) },
    { key: 'cogs', sign: '−' },
    { key: 'grossProfit', sign: '', total: true },
    {
      key: 'travelExpense',
      sign: '−',
      hint: t('hints.travelExpenses', { count: report.counts.travelExpenses }),
    },
    {
      key: 'stockShortage',
      sign: '−',
      hint: t('hints.stockCounts', { count: report.counts.stockCounts }),
    },
    { key: 'stockSurplus', sign: '+' },
  ];

  return (
    <Card className="max-w-2xl gap-0 py-0">
      <CardContent className="px-0">
        <dl aria-label={t('lines.label')} className="divide-y text-sm">
          {lines.map(({ key, sign, hint, total }) => (
            <Row
              key={key}
              label={t(`lines.${key}`)}
              hint={hint}
              sign={sign}
              amount={report[key]}
              className={cn(total && 'border-t-2 font-semibold')}
            />
          ))}
          <Row
            label={t('lines.netProfit')}
            sign=""
            amount={report.netProfit}
            className="border-t-2 bg-muted/50 text-base font-semibold"
            amountClassName="text-lg"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  hint,
  sign,
  amount,
  className,
  amountClassName,
}: {
  label: string;
  hint?: string;
  sign: Sign;
  amount: number;
  className?: string;
  amountClassName?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 px-4 py-3', className)}>
      <dt className="flex min-w-0 flex-col">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </dt>
      <dd
        className={cn(
          'shrink-0 text-right tabular-nums',
          amount < 0 && 'text-destructive',
          amountClassName,
        )}
      >
        {sign && amount !== 0 && <span>{sign} </span>}
        <MoneyText amount={amount} />
      </dd>
    </div>
  );
}
