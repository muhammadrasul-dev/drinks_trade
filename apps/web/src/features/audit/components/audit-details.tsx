'use client';

import {
  type AuditChange,
  auditChanges,
  type AuditEntryDto,
  auditListChanges,
  type AuditListItemChange,
  isAuditRowList,
  isSecretAuditKey,
} from '@drinks/shared';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

import { listHref } from '../list-params';
import { AuditValue, useFieldLabel } from './audit-value';

/** Pages that open one entity of a type, by id. */
const ENTITY_HREF: Partial<Record<string, string>> = {
  product: '/products',
  purchase: '/purchases',
};

interface AuditDetailsProps {
  entry: AuditEntryDto;
  refs: Readonly<Record<string, string>>;
}

/** Expanded audit row (BR-12): field-level old → new values, document lines and meta. */
export function AuditDetails({ entry, refs }: AuditDetailsProps) {
  const t = useTranslations('audit.details');
  const changes = auditChanges(entry.before, entry.after);
  const meta = Object.entries(entry.meta).filter(([key]) => !isSecretAuditKey(key));
  const twoSided = entry.before != null && entry.after != null;
  const scalar = changes.filter((change) => !isLineList(change));
  const lists = changes.filter(isLineList);
  const openHref = ENTITY_HREF[entry.entityType];

  return (
    <div className="flex flex-col gap-4 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <span className="text-muted-foreground">{t('entityId')}: </span>
          <span className="font-mono text-xs break-all">{entry.entityId}</span>
        </span>
        <Link
          href={listHref({ entityType: entry.entityType, entityId: entry.entityId })}
          className="underline-offset-4 hover:underline"
        >
          {t('history')}
        </Link>
        {openHref && entry.action !== 'DELETE' && (
          <Link
            href={`${openHref}/${entry.entityId}`}
            className="underline-offset-4 hover:underline"
          >
            {t('open')}
          </Link>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">{t('changes')}</h3>
        {changes.length === 0 ? (
          <p className="text-muted-foreground">{t('noChanges')}</p>
        ) : (
          <>
            {scalar.length > 0 && (
              <ChangeTable
                changes={scalar}
                twoSided={twoSided}
                entityType={entry.entityType}
                refs={refs}
              />
            )}
            {lists.map((change) => (
              <LineTable
                key={change.key}
                field={change.key}
                rows={auditListChanges(asList(change.before), asList(change.after))}
                marked={twoSided}
                entityType={entry.entityType}
                refs={refs}
              />
            ))}
          </>
        )}
      </section>

      {meta.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">{t('meta')}</h3>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {meta.map(([key, value]) => (
              <MetaRow
                key={key}
                field={key}
                value={value}
                entityType={entry.entityType}
                refs={refs}
              />
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function isLineList(change: AuditChange): boolean {
  return isAuditRowList(change.before) || isAuditRowList(change.after);
}

function asList(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

interface ValueContext {
  entityType: string;
  refs: Readonly<Record<string, string>>;
}

function MetaRow({
  field,
  value,
  entityType,
  refs,
}: ValueContext & { field: string; value: unknown }) {
  const label = useFieldLabel();
  return (
    <>
      <dt className="text-muted-foreground">{label(field)}</dt>
      <dd className="min-w-0">
        <AuditValue field={field} value={value} entityType={entityType} refs={refs} />
      </dd>
    </>
  );
}

function ChangeTable({
  changes,
  twoSided,
  entityType,
  refs,
}: ValueContext & { changes: AuditChange[]; twoSided: boolean }) {
  const t = useTranslations('audit.details');
  const label = useFieldLabel();
  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">{t('field')}</th>
            {twoSided ? (
              <>
                <th className="px-3 py-2 font-medium">{t('before')}</th>
                <th className="px-3 py-2 font-medium">{t('after')}</th>
              </>
            ) : (
              <th className="px-3 py-2 font-medium">{t('value')}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.key} className="border-b last:border-0">
              <td className="px-3 py-1.5 align-top text-muted-foreground">{label(change.key)}</td>
              {twoSided ? (
                <>
                  <td className="px-3 py-1.5 align-top">
                    <AuditValue
                      field={change.key}
                      value={change.before}
                      entityType={entityType}
                      refs={refs}
                      className="text-red-700 dark:text-red-400"
                    />
                  </td>
                  <td className="px-3 py-1.5 align-top">
                    <AuditValue
                      field={change.key}
                      value={change.after}
                      entityType={entityType}
                      refs={refs}
                      className="text-emerald-700 dark:text-emerald-400"
                    />
                  </td>
                </>
              ) : (
                <td className="px-3 py-1.5 align-top">
                  <AuditValue
                    field={change.key}
                    value={change.after ?? change.before}
                    entityType={entityType}
                    refs={refs}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ROW_STYLES: Record<AuditListItemChange['kind'], string> = {
  added: 'bg-emerald-50 dark:bg-emerald-950/40',
  removed: 'bg-red-50 line-through decoration-red-400/60 dark:bg-red-950/40',
  changed: '',
  unchanged: '',
};

/**
 * Document lines (purchase / sale / stock count) as one table. `marked`
 * (an UPDATE-like row) highlights added / removed / changed lines; a CREATE or
 * DELETE just lists them.
 */
function LineTable({
  field,
  rows,
  marked,
  entityType,
  refs,
}: ValueContext & { field: string; rows: AuditListItemChange[]; marked: boolean }) {
  const t = useTranslations('audit.details');
  const label = useFieldLabel();
  const columns = [
    ...new Set(rows.flatMap((row) => Object.keys({ ...row.before, ...row.after }))),
  ].filter((key) => key !== 'lineNo' && !isSecretAuditKey(key));
  const kindLabel = {
    added: t('lineAdded'),
    removed: t('lineRemoved'),
    changed: t('lineChanged'),
    unchanged: '',
  } as const;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label(field)}</span>
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">{t('line')}</th>
              {columns.map((key) => (
                <th key={key} className="px-3 py-2 font-medium whitespace-nowrap">
                  {label(key)}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn('border-b last:border-0', marked && ROW_STYLES[row.kind])}
              >
                <td className="px-3 py-1.5 align-top tabular-nums">{row.key}</td>
                {columns.map((key) => {
                  const changed = row.changedKeys.includes(key);
                  const current = row.after ?? row.before;
                  return (
                    <td key={key} className="px-3 py-1.5 align-top">
                      {changed ? (
                        <span className="flex flex-col">
                          <AuditValue
                            field={key}
                            value={row.before?.[key]}
                            entityType={entityType}
                            refs={refs}
                            className="text-red-700 line-through dark:text-red-400"
                          />
                          <AuditValue
                            field={key}
                            value={row.after?.[key]}
                            entityType={entityType}
                            refs={refs}
                            className="text-emerald-700 dark:text-emerald-400"
                          />
                        </span>
                      ) : (
                        <AuditValue
                          field={key}
                          value={current?.[key]}
                          entityType={entityType}
                          refs={refs}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 align-top text-xs whitespace-nowrap text-muted-foreground">
                  {marked && kindLabel[row.kind]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
