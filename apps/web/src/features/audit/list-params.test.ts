import { describe, expect, it } from 'vitest';

import { listHref, parseListParams } from './list-params';

const USER = '0192f6b2-7c1a-7d3e-9a4b-1c2d3e4f5a6b';

describe('audit list params', () => {
  it('keeps valid filters and drops invalid ones one by one', () => {
    expect(
      parseListParams({
        user: USER,
        type: 'purchase',
        action: 'POST',
        entity: ' abc ',
        from: '2026-10-01',
        to: '2026-02-30',
        page: '2',
      }),
    ).toEqual({
      user: USER,
      entityType: 'purchase',
      action: 'POST',
      entityId: 'abc',
      from: '2026-10-01',
      page: 2,
    });
    expect(
      parseListParams({ user: 'bob', type: 'Purchase', action: 'post', page: '0', entity: '' }),
    ).toEqual({});
    expect(parseListParams({ user: 'system', page: ['3', '4'] })).toEqual({
      user: 'system',
      page: 3,
    });
  });

  it('round-trips through the URL', () => {
    const filters = {
      user: 'system',
      entityType: 'user',
      action: 'LOGIN_FAILED',
      entityId: 'admin',
      from: '2026-10-01',
      to: '2026-10-23',
    };
    const href = listHref({ ...filters, page: 2 });
    expect(href).toBe(
      '/audit?user=system&type=user&action=LOGIN_FAILED&entity=admin&from=2026-10-01&to=2026-10-23&page=2',
    );
    expect(parseListParams(Object.fromEntries(new URL(href, 'http://x').searchParams))).toEqual({
      ...filters,
      page: 2,
    });
    expect(listHref({ page: 1 })).toBe('/audit');
  });
});
