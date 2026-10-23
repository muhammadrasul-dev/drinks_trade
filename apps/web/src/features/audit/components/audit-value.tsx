'use client';

import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

import { MoneyText } from '@/components/money-text';

import { auditValueView } from '../value-format';

/** Message lookups by keys only known at run time (field names, enum values). */
export interface LooseTranslator {
  (key: string): string;
  has(key: string): boolean;
}

export function loose(t: unknown): LooseTranslator {
  return t as LooseTranslator;
}

/** Translated label of a before/after/meta key; the raw key when there is none. */
export function useFieldLabel(): (key: string) => string {
  const t = loose(useTranslations('audit.fields'));
  return (key) => (t.has(key) ? t(key) : key);
}

/** First 8 characters of a uuid — enough to tell rows apart, full id in the title. */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

interface AuditValueProps {
  field: string;
  value: unknown;
  entityType: string;
  refs: Readonly<Record<string, string>>;
  className?: string;
}

/** One audit value, formatted by value-format.ts (money, dates, enums, referenced names, …). */
export function AuditValue({ field, value, entityType, refs, className }: AuditValueProps) {
  const t = useTranslations('audit.details');
  const tRoot = loose(useTranslations());
  const view = auditValueView(field, value, entityType, refs);

  switch (view.kind) {
    case 'empty':
      return <span className={cn('text-muted-foreground', className)}>—</span>;
    case 'boolean':
      return <span className={className}>{view.value ? t('yes') : t('no')}</span>;
    case 'money':
      return <MoneyText amount={view.amount} className={className} />;
    case 'ref':
      return view.name === undefined ? (
        <span title={view.id} className={cn('font-mono text-xs', className)}>
          {shortId(view.id)}
        </span>
      ) : (
        <span title={view.id} className={className}>
          {view.name}
        </span>
      );
    case 'enum': {
      const key = `${view.namespace}.${view.value}`;
      return <span className={className}>{tRoot.has(key) ? tRoot(key) : view.value}</span>;
    }
    case 'text':
      return (
        <span className={cn('break-all', view.mono && 'font-mono text-xs', className)}>
          {view.text}
        </span>
      );
  }
}
