import { describe, expect, it } from 'vitest';

import { auditValueView } from './value-format';

const ID = '0192f6b2-7c1a-7d3e-9a4b-1c2d3e4f5a6b';

describe('auditValueView', () => {
  it('shows empties, booleans and money', () => {
    expect(auditValueView('note', null, 'purchase', {})).toEqual({ kind: 'empty' });
    expect(auditValueView('note', '', 'purchase', {})).toEqual({ kind: 'empty' });
    expect(auditValueView('isActive', false, 'user', {})).toEqual({
      kind: 'boolean',
      value: false,
    });
    expect(auditValueView('totalAmount', 125000, 'purchase', {})).toEqual({
      kind: 'money',
      amount: 125000,
    });
    expect(auditValueView('salePrice', '9000', 'product', {})).toEqual({
      kind: 'money',
      amount: 9000,
    });
  });

  it('resolves referenced ids and keeps unknown ones as ids', () => {
    expect(auditValueView('productId', ID, 'purchase', { [ID]: 'Cola' })).toEqual({
      kind: 'ref',
      id: ID,
      name: 'Cola',
    });
    expect(auditValueView('productId', ID, 'purchase', {})).toEqual({ kind: 'ref', id: ID });
  });

  it('formats dates in the store zone', () => {
    expect(auditValueView('docDate', '2026-10-21T07:00:00.000Z', 'purchase', {})).toEqual({
      kind: 'text',
      text: '21.10.2026 12:00',
    });
    expect(auditValueView('expiryDate', '2026-12-31T19:00:00.000Z', 'product', {})).toEqual({
      kind: 'text',
      text: '01.01.2027',
    });
  });

  it('maps enum values per entity type', () => {
    expect(auditValueView('status', 'POSTED', 'purchase', {})).toEqual({
      kind: 'enum',
      namespace: 'enums.DocStatus',
      value: 'POSTED',
    });
    expect(auditValueView('status', 'OPEN', 'debt', {})).toMatchObject({
      namespace: 'enums.DebtStatus',
    });
    expect(auditValueView('source', 'cli', 'user', {})).toMatchObject({
      namespace: 'audit.sources',
    });
    expect(auditValueView('type', 'X', 'product', {})).toEqual({ kind: 'text', text: 'X' });
  });

  it('falls back to text and compact JSON', () => {
    expect(auditValueView('tags', ['a', 1], 'product', {})).toEqual({ kind: 'text', text: 'a, 1' });
    expect(auditValueView('extra', { a: 1 }, 'product', {})).toEqual({
      kind: 'text',
      text: '{"a":1}',
      mono: true,
    });
    expect(auditValueView('entity', ID, 'product', {})).toEqual({
      kind: 'text',
      text: ID,
      mono: true,
    });
  });
});
