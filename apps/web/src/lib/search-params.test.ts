import { describe, expect, it } from 'vitest';

import { z } from 'zod';

import {
  dateParam,
  firstParam,
  hrefWith,
  pageParam,
  schemaParam,
  searchParamsOf,
  textParam,
  uuidParam,
} from './search-params';

const ID = '0199f3a0-0000-7000-8000-000000000001';

describe('search params', () => {
  it('takes the first of repeated values', () => {
    expect(firstParam(['a', 'b'])).toBe('a');
    expect(firstParam('a')).toBe('a');
    expect(firstParam(undefined)).toBeUndefined();
  });

  it('keeps only real UUIDs and days', () => {
    expect(uuidParam(ID)).toBe(ID);
    expect(uuidParam('abc')).toBeUndefined();
    expect(dateParam(['2026-10-01', 'x'])).toBe('2026-10-01');
    expect(dateParam('2026-02-30')).toBeUndefined();
    expect(dateParam('01.10.2026')).toBeUndefined();
    expect(dateParam('')).toBeUndefined();
  });

  it('schemaParam keeps what the schema accepts, with its output', () => {
    const status = z.enum(['DRAFT', 'POSTED']);
    expect(schemaParam(status, 'POSTED')).toBe('POSTED');
    expect(schemaParam(status, 'posted')).toBeUndefined();
    expect(schemaParam(status, undefined)).toBeUndefined();
    expect(schemaParam(z.string().trim(), ['  x  ', 'y'])).toBe('x');
  });

  it('textParam trims and caps; pageParam keeps pages above 1', () => {
    expect(textParam('  cola  ', 30)).toBe('cola');
    expect(textParam('abcdef', 3)).toBe('abc');
    expect(textParam('   ', 30)).toBeUndefined();
    expect(pageParam('3')).toBe(3);
    for (const bad of ['1', '0', '-2', '2.5', 'x', undefined]) {
      expect(pageParam(bad)).toBeUndefined();
    }
  });

  it('hrefWith keeps the set params in order and leaves the defaults out', () => {
    expect(hrefWith('/sales', {})).toBe('/sales');
    expect(
      hrefWith('/sales', { status: 'POSTED', from: undefined, q: '', archived: false, page: 1 }),
    ).toBe('/sales?status=POSTED');
    expect(hrefWith('/products', { q: 'a b', archived: true, page: 2 })).toBe(
      '/products?q=a+b&archived=1&page=2',
    );
  });

  it('searchParamsOf gives a Route Handler the shape pages get', () => {
    expect(searchParamsOf(new URLSearchParams('from=2026-10-01&low=1&low=0&to='))).toEqual({
      from: '2026-10-01',
      low: ['1', '0'],
      to: '',
    });
    expect(searchParamsOf(new URLSearchParams())).toEqual({});
  });
});
