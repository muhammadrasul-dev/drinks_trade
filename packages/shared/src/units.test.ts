import { describe, expect, it } from 'vitest';

import { formatQty, splitPieces, toPieces } from './units';

const NBSP = '\u00a0';

describe('toPieces (BR-1)', () => {
  it('BR-1: 3 blocks + 2 pieces with 6 per block → 20 pieces', () => {
    expect(toPieces(3, 2, 6)).toBe(20);
  });

  it('handles zero and loose pieces beyond a block', () => {
    expect(toPieces(0, 0, 6)).toBe(0);
    expect(toPieces(0, 5, 6)).toBe(5);
    expect(toPieces(2, 0, 12)).toBe(24);
    expect(toPieces(1, 7, 6)).toBe(13);
  });

  it('rejects negative, fractional and unsafe input', () => {
    expect(() => toPieces(-1, 0, 6)).toThrow(RangeError);
    expect(() => toPieces(0, -1, 6)).toThrow(RangeError);
    expect(() => toPieces(1.5, 0, 6)).toThrow(RangeError);
    expect(() => toPieces(1, 0, 0)).toThrow(RangeError);
    expect(() => toPieces(Number.MAX_SAFE_INTEGER, 0, 2)).toThrow(RangeError);
  });
});

describe('splitPieces (BR-1)', () => {
  it('BR-1: 20 pieces, block = 6 → 3 blocks 2 pieces', () => {
    expect(splitPieces(20, 6)).toEqual({ blocks: 3, pieces: 2 });
  });

  it('splits exact blocks, zero and less than a block', () => {
    expect(splitPieces(18, 6)).toEqual({ blocks: 3, pieces: 0 });
    expect(splitPieces(0, 6)).toEqual({ blocks: 0, pieces: 0 });
    expect(splitPieces(5, 6)).toEqual({ blocks: 0, pieces: 5 });
    expect(splitPieces(7, 1)).toEqual({ blocks: 7, pieces: 0 });
  });

  it('is the inverse of toPieces', () => {
    for (const qty of [0, 1, 5, 6, 7, 23, 24, 1000]) {
      const { blocks, pieces } = splitPieces(qty, 12);
      expect(toPieces(blocks, pieces, 12)).toBe(qty);
    }
  });

  it('rejects negative qty and a non-positive block size', () => {
    expect(() => splitPieces(-1, 6)).toThrow(RangeError);
    expect(() => splitPieces(1.5, 6)).toThrow(RangeError);
    expect(() => splitPieces(5, 0)).toThrow(RangeError);
    expect(() => splitPieces(5, 1.5)).toThrow(RangeError);
  });
});

describe('formatQty (BR-1)', () => {
  it('BR-1: SRS example — 20 pieces, block = 6 → "3 blok 2 dona"', () => {
    expect(formatQty(20, 6)).toBe('3 blok 2 dona');
  });

  it('omits the empty part and shows zero as pieces', () => {
    expect(formatQty(18, 6)).toBe('3 blok');
    expect(formatQty(2, 6)).toBe('2 dona');
    expect(formatQty(0, 6)).toBe('0 dona');
  });

  it('keeps the sign of a negative qty (stock count delta)', () => {
    expect(formatQty(-20, 6)).toBe('-3 blok 2 dona');
    expect(formatQty(-2, 6)).toBe('-2 dona');
  });

  it('groups thousands with a no-break space', () => {
    expect(formatQty(12_000, 1)).toBe(`12${NBSP}000 blok`);
    expect(formatQty(12_005, 12_000)).toBe('1 blok 5 dona');
  });

  it('uses the labels the UI passes (ru)', () => {
    expect(formatQty(20, 6, { block: 'блок', piece: 'шт.' })).toBe('3 блок 2 шт.');
  });

  it('rejects fractional qty and a bad block size', () => {
    expect(() => formatQty(1.5, 6)).toThrow(RangeError);
    expect(() => formatQty(5, 0)).toThrow(RangeError);
  });
});
