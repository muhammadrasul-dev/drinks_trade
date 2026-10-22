'use client';

import type { ProductOption } from '@drinks/shared';
import { Input } from '@drinks/ui/components/input';
import { cn } from '@drinks/ui/lib/utils';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';

const MAX_MATCHES = 20;

interface ProductPickerProps {
  options: readonly ProductOption[];
  value: string;
  onSelect: (id: string) => void;
  /** Shown for a selected product that is no longer among the options (archived). */
  fallbackName?: string;
  placeholder: string;
  emptyText: string;
  invalid?: boolean;
  ariaLabel: string;
}

function codesOf(option: ProductOption): string {
  return [option.sku, option.barcode].filter(Boolean).join(' · ');
}

/**
 * Searchable product field for document lines (architecture §6): type part of
 * a name, SKU or barcode; Enter picks an exact SKU / barcode match (a scanner
 * types the code and Enter) or the highlighted row.
 */
export function ProductPicker({
  options,
  value,
  onSelect,
  fallbackName,
  placeholder,
  emptyText,
  invalid,
  ariaLabel,
}: ProductPickerProps) {
  const listId = useId();
  const selected = options.find((option) => option.id === value);
  // null: not typing — the input shows the selected product's name.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const needle = query.trim().toLowerCase();
    if (needle === '') return options.slice(0, MAX_MATCHES);
    return options
      .filter(
        (option) =>
          option.name.toLowerCase().includes(needle) ||
          option.sku?.toLowerCase().includes(needle) ||
          option.barcode?.toLowerCase().includes(needle),
      )
      .slice(0, MAX_MATCHES);
  }, [options, query]);

  function pick(option: ProductOption | undefined) {
    if (option) onSelect(option.id);
    setQuery(null);
    setActive(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (query === null) {
        setQuery('');
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => Math.max(0, Math.min(matches.length - 1, current + step)));
    } else if (event.key === 'Enter') {
      // Never submit the form from here.
      event.preventDefault();
      if (query === null) return;
      const code = query.trim().toLowerCase();
      const exact = options.find(
        (option) => option.barcode?.toLowerCase() === code || option.sku?.toLowerCase() === code,
      );
      pick(exact ?? matches[active]);
    } else if (event.key === 'Escape' && query !== null) {
      event.preventDefault();
      setQuery(null);
    }
  }

  const open = query !== null;
  const text = query ?? selected?.name ?? fallbackName ?? '';

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setQuery(null)}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={index === active}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer flex-col rounded-sm px-2 py-1.5 text-sm',
                  index === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span>{option.name}</span>
                {codesOf(option) && (
                  <span className="text-xs text-muted-foreground">{codesOf(option)}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
