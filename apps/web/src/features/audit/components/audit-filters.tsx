'use client';

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditUserOption } from '@drinks/shared';
import { AUDIT_SYSTEM_USER } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { SearchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useRouter } from '@/i18n/navigation';

import { type AuditListFilters, listHref } from '../list-params';
import { loose } from './audit-value';

const ALL = '__all';
const SEARCH_DELAY_MS = 300;

interface AuditFiltersProps {
  filters: AuditListFilters;
  users: readonly AuditUserOption[];
}

/** User, entity type, action, entity id and date range of the audit log (T-901). */
export function AuditFilters({ filters, users }: AuditFiltersProps) {
  const t = useTranslations('audit');
  const tAction = loose(useTranslations('audit.actions'));
  const tEntity = loose(useTranslations('audit.entities'));
  const router = useRouter();
  const [entityId, setEntityId] = useState(filters.entityId ?? '');
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // The entity id also changes from outside (a row's "history" link).
  const [shownEntityId, setShownEntityId] = useState(filters.entityId);
  if (shownEntityId !== filters.entityId) {
    setShownEntityId(filters.entityId);
    setEntityId(filters.entityId ?? '');
  }

  useEffect(() => {
    const value = entityId.trim();
    if (value === (filtersRef.current.entityId ?? '')) return;
    const timer = setTimeout(() => {
      router.replace(listHref({ ...filtersRef.current, entityId: value || undefined, page: 1 }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [entityId, router]);

  function apply(patch: Partial<AuditListFilters>) {
    router.replace(listHref({ ...filters, ...patch, page: 1 }));
  }

  // A filter value from the URL that is not among the known ones still shows.
  const entityTypes = withCurrent(AUDIT_ENTITY_TYPES, filters.entityType);
  const actions = withCurrent(AUDIT_ACTIONS, filters.action);
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'page' && value);

  return (
    <div
      role="search"
      aria-label={t('filters.label')}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <Select
        value={filters.user ?? ALL}
        onValueChange={(next) => apply({ user: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-52" aria-label={t('filters.user')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.allUsers')}</SelectItem>
          <SelectItem value={AUDIT_SYSTEM_USER}>{t('system')}</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.isActive ? user.fullName : t('filters.inactiveUser', { name: user.fullName })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.entityType ?? ALL}
        onValueChange={(next) => apply({ entityType: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('filters.entityType')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.allEntityTypes')}</SelectItem>
          {entityTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {tEntity.has(type) ? tEntity(type) : type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.action ?? ALL}
        onValueChange={(next) => apply({ action: next === ALL ? undefined : next })}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('filters.action')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.allActions')}</SelectItem>
          {actions.map((action) => (
            <SelectItem key={action} value={action}>
              {tAction.has(action) ? tAction(action) : action}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative sm:w-56">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
          placeholder={t('filters.entityId')}
          aria-label={t('filters.entityId')}
          maxLength={64}
          className="pl-8"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('filters.from')}</span>
        <Input
          type="date"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(event) => apply({ from: event.target.value || undefined })}
          className="w-40"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('filters.to')}</span>
        <Input
          type="date"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(event) => apply({ to: event.target.value || undefined })}
          className="w-40"
        />
      </label>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(listHref({}))}>
          <XIcon />
          {t('filters.reset')}
        </Button>
      )}
    </div>
  );
}

function withCurrent(known: readonly string[], current: string | undefined): readonly string[] {
  return current && !known.includes(current) ? [...known, current] : known;
}
