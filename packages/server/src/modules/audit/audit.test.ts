import { describe, expect, it, vi } from 'vitest';

import type { Tx } from '../../core/tx';

import { audit, isBackdated, toAuditJson } from './audit.service';

describe('isBackdated (BR-13)', () => {
  const now = new Date('2026-10-22T10:00:00Z'); // 15:00 in Tashkent

  it('is false for today and true for an earlier day', () => {
    expect(isBackdated(new Date('2026-10-22T01:00:00Z'), now)).toBe(false);
    expect(isBackdated(new Date('2026-10-20T10:00:00Z'), now)).toBe(true);
  });

  it('compares calendar days in the store time zone, not UTC', () => {
    // 2026-10-21 19:30 UTC is already 2026-10-22 00:30 in Tashkent → today.
    expect(isBackdated(new Date('2026-10-21T19:30:00Z'), now)).toBe(false);
    // 2026-10-21 18:30 UTC is 2026-10-21 23:30 in Tashkent → yesterday.
    expect(isBackdated(new Date('2026-10-21T18:30:00Z'), now)).toBe(true);
  });
});

describe('toAuditJson', () => {
  it('turns bigint into string and keeps the rest JSON', () => {
    expect(
      toAuditJson({ total: 120_000n, lines: [{ qty: 6 }], at: new Date('2026-10-22T00:00:00Z') }),
    ).toEqual({ total: '120000', lines: [{ qty: 6 }], at: '2026-10-22T00:00:00.000Z' });
  });
});

describe('audit.log', () => {
  const actor = { user: { id: 'user-1' }, storeId: 'store-1', requestId: 'req-1' };

  function fakeTx() {
    const create = vi.fn().mockResolvedValue({});
    return { tx: { auditLog: { create } } as unknown as Tx, create };
  }

  it('writes actor, entity and meta.requestId', async () => {
    const { tx, create } = fakeTx();
    await audit.log(tx, actor, {
      action: 'CREATE',
      entityType: 'sale',
      entityId: 'sale-1',
      after: { totalAmount: 5n },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        userId: 'user-1',
        action: 'CREATE',
        entityType: 'sale',
        entityId: 'sale-1',
        after: { totalAmount: '5' },
        meta: { requestId: 'req-1' },
      },
    });
  });

  it('sets meta.backdated only when flagged', async () => {
    const { tx, create } = fakeTx();
    await audit.log(tx, actor, {
      action: 'POST',
      entityType: 'sale',
      entityId: 'sale-1',
      backdated: true,
    });
    expect(create.mock.calls[0]?.[0].data.meta).toEqual({ requestId: 'req-1', backdated: true });
  });

  it('allows system events without a user', async () => {
    const { tx, create } = fakeTx();
    await audit.log(
      tx,
      { user: null, storeId: null, requestId: 'req-2' },
      { action: 'LOGIN_FAILED', entityType: 'user', entityId: 'owner', meta: { ip: '127.0.0.1' } },
    );
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      userId: null,
      storeId: null,
      meta: { ip: '127.0.0.1', requestId: 'req-2' },
    });
  });
});
