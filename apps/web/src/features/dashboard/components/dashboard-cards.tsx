import type { DashboardLowStock, OpenStockCount } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@drinks/ui/components/card';
import { cn } from '@drinks/ui/lib/utils';
import {
  ClipboardListIcon,
  FileClockIcon,
  type LucideIcon,
  PackageOpenIcon,
  ShoppingCartIcon,
  TruckIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { QtyText } from '@/components/qty-text';
import { PRODUCTS_HREF } from '@/features/products/list-params';
import { stockCountHref } from '@/features/stock-counts/list-params';
import { Link } from '@/i18n/navigation';

import { DASHBOARD_LINKS } from '../links';

// Home page blocks (T-902). Counts and quantities only — the service sends
// no amounts (CLAUDE.md rule 6).

function BlockCard({
  icon: Icon,
  title,
  description,
  count,
  footer,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Shown top-right; highlighted when above 0. */
  count?: number;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {count !== undefined && (
          <CardAction>
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-lg font-semibold tabular-nums',
                count > 0 ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground',
              )}
            >
              {count}
            </span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
      {footer && <CardFooter className="px-4">{footer}</CardFooter>}
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** FR-1.3: products below their minimum, the most depleted first. */
export function LowStockCard({
  lowStock,
  className,
}: {
  lowStock: DashboardLowStock;
  className?: string;
}) {
  const t = useTranslations('home.lowStock');
  const hidden = lowStock.total - lowStock.items.length;
  return (
    <BlockCard
      icon={PackageOpenIcon}
      title={t('title')}
      description={t('description')}
      count={lowStock.total}
      className={className}
      footer={
        lowStock.total > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href={DASHBOARD_LINKS.lowStock}>{t('all', { count: lowStock.total })}</Link>
          </Button>
        )
      }
    >
      {lowStock.items.length === 0 ? (
        <Empty>{t('empty')}</Empty>
      ) : (
        <>
          <ul className="divide-y text-sm">
            {lowStock.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
              >
                <Link
                  href={`${PRODUCTS_HREF}/${item.id}`}
                  className="min-w-0 font-medium break-words hover:underline"
                >
                  {item.name}
                </Link>
                <span className="flex items-baseline gap-1.5 text-xs">
                  <QtyText
                    qty={item.stockQty}
                    unitsPerBlock={item.unitsPerBlock}
                    className={cn('text-sm font-medium', item.stockQty === 0 && 'text-destructive')}
                  />
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {t('min')} <QtyText qty={item.minStock} unitsPerBlock={item.unitsPerBlock} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="pt-2 text-sm text-muted-foreground">{t('more', { count: hidden })}</p>
          )}
        </>
      )}
    </BlockCard>
  );
}

/** BR-8: open counts block their warehouse; each number opens the count. */
export function OpenStockCountsCard({ counts }: { counts: OpenStockCount[] }) {
  const t = useTranslations('home.stockCounts');
  return (
    <BlockCard
      icon={ClipboardListIcon}
      title={t('title')}
      count={counts.length}
      footer={
        counts.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href={DASHBOARD_LINKS.openStockCounts}>{t('all')}</Link>
          </Button>
        )
      }
    >
      {counts.length === 0 ? (
        <Empty>{t('empty')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {counts.map((count) => (
            <li key={count.id} className="flex flex-wrap items-baseline gap-x-2">
              <Link
                href={stockCountHref(count.id)}
                className="font-medium tabular-nums underline-offset-4 hover:underline"
              >
                {count.number}
              </Link>
              <span className="text-muted-foreground">
                {t('warehouse', { warehouse: count.warehouseName })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </BlockCard>
  );
}

/** Saved but not posted sales and purchases of the store. */
export function DraftsCard({ sales, purchases }: { sales?: number; purchases?: number }) {
  const t = useTranslations('home.drafts');
  const rows = [
    { key: 'sales', count: sales, href: DASHBOARD_LINKS.draftSales, Icon: ShoppingCartIcon },
    {
      key: 'purchases',
      count: purchases,
      href: DASHBOARD_LINKS.draftPurchases,
      Icon: TruckIcon,
    },
  ] as const;
  const shown = rows.filter((row) => row.count !== undefined);
  const none = shown.every((row) => row.count === 0);
  return (
    <BlockCard icon={FileClockIcon} title={t('title')}>
      <ul className="flex flex-col gap-1">
        {shown.map(({ key, count, href, Icon }) => (
          <li key={key}>
            <Link
              href={href}
              className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {t(key)}
              </span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  count === 0 && 'font-normal text-muted-foreground',
                )}
              >
                {count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {none && <p className="pt-2 text-sm text-muted-foreground">{t('empty')}</p>}
    </BlockCard>
  );
}
