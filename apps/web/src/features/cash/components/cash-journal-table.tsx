'use client';

import {
  CashboxType,
  type CashJournalEntry,
  CashTxType,
  formatDateTime,
  storeDateOf,
} from '@drinks/shared';
import { isReversibleCashTxType } from '@drinks/shared/schemas';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo } from 'react';

import { MoneyText } from '@/components/money-text';
import { Link } from '@/i18n/navigation';
import { PURCHASES_HREF } from '@/features/purchases/list-params';

import { CashReverseButton } from './cash-reverse-button';

const col = dataTableColumnHelper<CashJournalEntry>();

/**
 * Cash journal (T-701, FR-6.1): report date, cashbox, type, signed amount,
 * balance after the entry, what it belongs to, note, author. Manual entries
 * not yet reversed get "Storno" (T-703, OQ-08); reversed ones are struck through.
 */
export function CashJournalTable({ items }: { items: readonly CashJournalEntry[] }) {
  const t = useTranslations('cash');
  const tCashbox = useTranslations('enums.CashboxType');
  const tType = useTranslations('enums.CashTxType');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('id', {
          header: t('columns.id'),
          cell: (info) => (
            <span className="text-xs text-muted-foreground tabular-nums">#{info.getValue()}</span>
          ),
        }),
        col.accessor('txDate', {
          header: t('columns.date'),
          cell: (info) => <DateCell entry={info.row.original} />,
        }),
        col.accessor('cashbox', {
          header: t('columns.cashbox'),
          cell: (info) => tCashbox(info.getValue().type),
        }),
        col.accessor('type', {
          header: t('columns.type'),
          cell: (info) => <span className="whitespace-nowrap">{tType(info.getValue())}</span>,
        }),
        col.accessor('amount', {
          header: t('columns.amount'),
          cell: (info) => <SignedAmount entry={info.row.original} />,
        }),
        col.accessor('balanceAfter', {
          header: t('columns.balanceAfter'),
          cell: (info) => <MoneyText amount={info.getValue()} className="text-muted-foreground" />,
        }),
        col.display({
          id: 'reference',
          header: t('columns.reference'),
          cell: (info) => <ReferenceCell entry={info.row.original} />,
        }),
        col.accessor('note', {
          header: t('columns.note'),
          cell: (info) => {
            const note = info.getValue();
            return note ? (
              <span className="block max-w-64 text-sm break-words whitespace-normal">{note}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          },
        }),
        col.accessor('createdBy', {
          header: t('columns.author'),
          cell: (info) => <span className="whitespace-nowrap">{info.getValue().fullName}</span>,
        }),
        col.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('columns.actions')}</span>,
          cell: ActionsCell,
        }),
      ]),
    [t, tCashbox, tType],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      emptyMessage={t('empty')}
    />
  );
}

/**
 * Module-level on purpose: FlexRender mounts a cell function as a component,
 * and the columns are rebuilt whenever the action's response re-renders the
 * page (new `t`), which would remount an open reversal dialog and drop its
 * error message.
 */
function ActionsCell({ row }: { row: { original: CashJournalEntry } }) {
  const entry = row.original;
  if (!isReversibleCashTxType(entry.type) || entry.reversedById) return null;
  return <CashReverseButton entry={entry} />;
}

/** Report date; a backdated entry also shows when it was booked (its balance_after is of that moment). */
function DateCell({ entry }: { entry: CashJournalEntry }) {
  const t = useTranslations('cash');
  const backdated = storeDateOf(entry.txDate) !== storeDateOf(entry.createdAt);
  return (
    <div className="flex flex-col whitespace-nowrap tabular-nums">
      <span>{formatDateTime(entry.txDate)}</span>
      {backdated && (
        <span className="text-xs text-muted-foreground">
          {t('entered', { date: formatDateTime(entry.createdAt) })}
        </span>
      )}
    </div>
  );
}

function SignedAmount({ entry }: { entry: CashJournalEntry }) {
  const isIn = entry.direction === 'IN';
  return (
    <span
      className={cn(
        'font-medium whitespace-nowrap tabular-nums',
        entry.reversedById && 'line-through opacity-60',
        isIn ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
      )}
    >
      {isIn ? '+' : '−'}
      <MoneyText amount={entry.amount} />
    </span>
  );
}

function ReferenceCell({ entry }: { entry: CashJournalEntry }) {
  const t = useTranslations('cash.reference');
  const tCashbox = useTranslations('enums.CashboxType');
  const tDebt = useTranslations('enums.DebtDirection');
  const parts: ReactNode[] = [];

  if (entry.purchase) {
    parts.push(
      <Link
        key="purchase"
        href={`${PURCHASES_HREF}/${entry.purchase.id}`}
        className="underline-offset-4 hover:underline"
      >
        {t('purchase', { number: entry.purchase.number })}
      </Link>,
    );
  }
  // Sale pages arrive with T-501; until then the number is plain text.
  if (entry.sale) parts.push(<span key="sale">{t('sale', { number: entry.sale.number })}</span>);
  if (entry.debt) {
    parts.push(<span key="debt">{t('debt', { direction: tDebt(entry.debt.direction) })}</span>);
  }
  if (entry.type === CashTxType.TRANSFER_OUT || entry.type === CashTxType.TRANSFER_IN) {
    const other = entry.cashbox.type === CashboxType.CASH ? CashboxType.CARD : CashboxType.CASH;
    parts.push(
      <span key="transfer">
        {t(entry.type === CashTxType.TRANSFER_OUT ? 'transferTo' : 'transferFrom', {
          cashbox: tCashbox(other),
        })}
      </span>,
    );
  }
  if (entry.reversalOfId) {
    parts.push(<span key="reversalOf">{t('reversalOf', { id: entry.reversalOfId })}</span>);
  }
  if (entry.reversedById) {
    parts.push(
      <span
        key="reversedBy"
        className="inline-flex w-fit rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
      >
        {t('reversedBy', { id: entry.reversedById })}
      </span>,
    );
  }

  if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
  return <div className="flex flex-col gap-1 text-sm whitespace-nowrap">{parts}</div>;
}
