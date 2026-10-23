'use client';

import { type DebtListItem, DebtStatus, formatDate, formatDateTime } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { cn } from '@drinks/ui/lib/utils';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { MoneyText } from '@/components/money-text';
import { PURCHASES_HREF } from '@/features/purchases/list-params';
import { Link } from '@/i18n/navigation';

import { DebtRepayDialog } from './debt-repay-dialog';

const col = dataTableColumnHelper<DebtListItem>();

const STATUS_CLASS: Record<DebtStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  CLOSED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-muted text-muted-foreground',
};

/**
 * Debts (T-704, FR-7.1): direction, note, amount, repaid, remaining, status,
 * source document; an OPEN debt has a repay button, a row with repayments
 * expands to their history.
 */
export function DebtTable({ items, today }: { items: readonly DebtListItem[]; today: string }) {
  const t = useTranslations('debts');
  const tDirection = useTranslations('enums.DebtDirection');
  const tStatus = useTranslations('enums.DebtStatus');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const columns = useMemo(() => {
    const toggle = (id: string) =>
      setOpen((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    return col.columns([
      col.display({
        id: 'expand',
        header: () => <span className="sr-only">{t('showRepayments')}</span>,
        cell: (info) => {
          const { id, repayments } = info.row.original;
          if (repayments.length === 0) return null;
          const expanded = open.has(id);
          return (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-expanded={expanded}
              aria-label={expanded ? t('hideRepayments') : t('showRepayments')}
              onClick={() => toggle(id)}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
          );
        },
      }),
      col.accessor('debtDate', {
        header: t('columns.date'),
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">{formatDate(info.getValue())}</span>
        ),
      }),
      col.accessor('direction', {
        header: t('columns.direction'),
        cell: (info) => <span className="whitespace-nowrap">{tDirection(info.getValue())}</span>,
      }),
      col.accessor('note', {
        header: t('columns.note'),
        cell: (info) => (
          <span className="block max-w-64 min-w-32 text-sm break-words whitespace-normal">
            {info.getValue()}
          </span>
        ),
      }),
      col.accessor('amount', {
        header: t('columns.amount'),
        cell: (info) => <MoneyText amount={info.getValue()} />,
      }),
      col.accessor('repaidAmount', {
        header: t('columns.repaid'),
        cell: (info) => <MoneyText amount={info.getValue()} className="text-muted-foreground" />,
      }),
      col.accessor('remaining', {
        header: t('columns.remaining'),
        cell: (info) => {
          const { status } = info.row.original;
          return status === DebtStatus.CANCELLED ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <MoneyText amount={info.getValue()} className="font-semibold" />
          );
        },
      }),
      col.accessor('status', {
        header: t('columns.status'),
        cell: (info) => (
          <span
            className={cn(
              'inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
              STATUS_CLASS[info.getValue()],
            )}
          >
            {tStatus(info.getValue())}
          </span>
        ),
      }),
      col.display({
        id: 'source',
        header: t('columns.source'),
        cell: (info) => <SourceCell debt={info.row.original} />,
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">{t('columns.actions')}</span>,
        cell: (info) => {
          const debt = info.row.original;
          if (debt.status !== DebtStatus.OPEN) return null;
          return (
            <DebtRepayDialog
              debt={debt}
              today={today}
              trigger={
                <Button variant="outline" size="sm">
                  {t('repay.button')}
                </Button>
              }
            />
          );
        },
      }),
    ]);
  }, [t, tDirection, tStatus, open, today]);

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      emptyMessage={t('empty')}
      renderSubRow={(row) => (open.has(row.id) ? <Repayments debt={row} /> : null)}
    />
  );
}

function SourceCell({ debt }: { debt: DebtListItem }) {
  const t = useTranslations('debts.source');
  if (debt.purchase) {
    return (
      <Link
        href={`${PURCHASES_HREF}/${debt.purchase.id}`}
        className="whitespace-nowrap underline-offset-4 hover:underline"
      >
        {t('purchase', { number: debt.purchase.number })}
      </Link>
    );
  }
  // Sale pages arrive with T-501; until then the number is plain text.
  if (debt.sale) {
    return <span className="whitespace-nowrap">{t('sale', { number: debt.sale.number })}</span>;
  }
  return <span className="text-muted-foreground">{t('manual')}</span>;
}

/** Repayment history of one debt, oldest first. */
function Repayments({ debt }: { debt: DebtListItem }) {
  const t = useTranslations('debts.repayments');
  const tCashbox = useTranslations('enums.CashboxType');
  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-sm font-medium">{t('title')}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {debt.repayments.map((repayment) => (
          <li key={repayment.id} className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="tabular-nums">{formatDateTime(repayment.repaidAt)}</span>
            <MoneyText amount={repayment.amount} className="font-medium" />
            <span className="text-muted-foreground">{tCashbox(repayment.cashbox)}</span>
            {repayment.note && <span className="break-words">{repayment.note}</span>}
            <span className="text-muted-foreground">{repayment.createdBy.fullName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
