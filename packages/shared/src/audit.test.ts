import { describe, expect, it } from 'vitest';

import {
  auditChanges,
  auditListChanges,
  collectAuditRefs,
  isAuditDateTime,
  isAuditRowList,
  isSecretAuditKey,
  jsonEqual,
  redactAuditValue,
} from './audit';
import { auditListQuerySchema } from './schemas/audit';

describe('auditChanges', () => {
  it('keeps only changed keys when both sides exist (UPDATE)', () => {
    expect(
      auditChanges(
        { name: 'Cola', salePrice: 12000, minStock: 10 },
        { name: 'Cola 1L', salePrice: 12000, minStock: 10 },
      ),
    ).toEqual([{ key: 'name', kind: 'changed', before: 'Cola', after: 'Cola 1L' }]);
  });

  it('marks added and removed keys and null changes', () => {
    expect(auditChanges({ note: null, old: 1 }, { note: 'x', fresh: 2 })).toEqual([
      { key: 'note', kind: 'changed', before: null, after: 'x' },
      { key: 'fresh', kind: 'added', after: 2 },
      { key: 'old', kind: 'removed', before: 1 },
    ]);
  });

  it('lists every key for one-sided rows (CREATE / DELETE)', () => {
    expect(auditChanges(null, { name: 'A', barcode: null })).toEqual([
      { key: 'name', kind: 'added', after: 'A' },
      { key: 'barcode', kind: 'added', after: null },
    ]);
    expect(auditChanges({ name: 'A' }, undefined)).toEqual([
      { key: 'name', kind: 'removed', before: 'A' },
    ]);
    expect(auditChanges(null, null)).toEqual([]);
  });

  it('compares nested values structurally, ignoring key order', () => {
    const lines = [{ lineNo: 1, qty: 6, productId: 'p' }];
    expect(
      auditChanges(
        { lines, total: 5 },
        { lines: [{ productId: 'p', qty: 6, lineNo: 1 }], total: 6 },
      ),
    ).toEqual([{ key: 'total', kind: 'changed', before: 5, after: 6 }]);
  });

  it('never returns password-like keys, also nested', () => {
    const changes = auditChanges(
      { passwordHash: 'h1', username: 'a', extra: { token: 't', ok: 1 } },
      { passwordHash: 'h2', username: 'b', extra: { token: 'u', ok: 2 } },
    );
    expect(changes.map((change) => change.key)).toEqual(['username', 'extra']);
    expect(JSON.stringify(changes)).not.toMatch(/h1|h2|"t"|"u"/);
  });

  it('wraps a bare value under one key', () => {
    expect(auditChanges('a', 'b')).toEqual([
      { key: 'value', kind: 'changed', before: 'a', after: 'b' },
    ]);
  });
});

describe('auditListChanges', () => {
  const line = (lineNo: number, qty: number) => ({ lineNo, qty, productId: 'p' });

  it('matches rows by lineNo and names changed fields', () => {
    expect(
      auditListChanges([line(1, 6), line(2, 5)], [line(2, 5), line(1, 12), line(3, 1)]),
    ).toEqual([
      { key: 1, kind: 'changed', before: line(1, 6), after: line(1, 12), changedKeys: ['qty'] },
      { key: 2, kind: 'unchanged', before: line(2, 5), after: line(2, 5), changedKeys: [] },
      { key: 3, kind: 'added', after: line(3, 1), changedKeys: [] },
    ]);
  });

  it('falls back to position without (unique) lineNo, and handles a missing side', () => {
    expect(auditListChanges([{ a: 1 }, { a: 2 }], [{ a: 1 }])).toEqual([
      { key: 1, kind: 'unchanged', before: { a: 1 }, after: { a: 1 }, changedKeys: [] },
      { key: 2, kind: 'removed', before: { a: 2 }, changedKeys: [] },
    ]);
    expect(auditListChanges(undefined, [line(1, 1)])).toEqual([
      { key: 1, kind: 'added', after: line(1, 1), changedKeys: [] },
    ]);
  });

  it('drops secret keys from rows', () => {
    const [row] = auditListChanges([{ lineNo: 1, secret: 's' }], [{ lineNo: 1, secret: 't' }]);
    expect(row).toEqual({
      key: 1,
      kind: 'changed',
      before: { lineNo: 1 },
      after: { lineNo: 1 },
      changedKeys: [],
    });
  });
});

describe('helpers', () => {
  it('detects secret keys', () => {
    for (const key of [
      'password',
      'passwordHash',
      'newPassword',
      'token',
      'sessionToken',
      'secret',
    ]) {
      expect(isSecretAuditKey(key)).toBe(true);
    }
    for (const key of ['username', 'fullName', 'productId', 'sessionsRevoked']) {
      expect(isSecretAuditKey(key)).toBe(false);
    }
  });

  it('redacts deeply and keeps everything else', () => {
    expect(redactAuditValue({ a: [{ password: 'x', b: 1 }], c: null })).toEqual({
      a: [{ b: 1 }],
      c: null,
    });
  });

  it('compares JSON', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual([1], { 0: 1 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(jsonEqual(null, undefined)).toBe(false);
  });

  it('collects referenced ids from nested lines', () => {
    const product = '01a16497-602b-746b-9000-44dd6f2d0c7d';
    const sub = '01a16497-6000-72ab-a17a-ed8b184273f7';
    const refs = collectAuditRefs({
      lines: [{ productId: product, subWarehouseId: sub }],
      categoryId: null,
      brandId: 'not-a-uuid',
    });
    expect([...refs]).toEqual([
      [product, 'product'],
      [sub, 'sub_warehouse'],
    ]);
  });

  it('recognises row lists and ISO date-times', () => {
    expect(isAuditRowList([{ a: 1 }])).toBe(true);
    expect(isAuditRowList([])).toBe(false);
    expect(isAuditRowList([1, 2])).toBe(false);
    expect(isAuditDateTime('2026-10-22T19:20:03.398Z')).toBe(true);
    expect(isAuditDateTime('2026-10-22')).toBe(false);
    expect(isAuditDateTime('T-303 sinov')).toBe(false);
  });
});

describe('auditListQuerySchema', () => {
  it('accepts a user id or "system" and shaped action / entity names', () => {
    expect(
      auditListQuerySchema.safeParse({
        user: 'system',
        action: 'PASSWORD_RESET',
        entityType: 'sub_warehouse',
        entityId: ' P-1 ',
        from: '2026-10-01',
        page: 2,
      }).data,
    ).toEqual({
      user: 'system',
      action: 'PASSWORD_RESET',
      entityType: 'sub_warehouse',
      entityId: 'P-1',
      from: '2026-10-01',
      page: 2,
    });
    for (const bad of [{ user: 'bob' }, { action: 'drop table' }, { entityType: 'Product' }]) {
      expect(auditListQuerySchema.safeParse(bad).success).toBe(false);
    }
  });
});
