import { describe, expect, it } from 'vitest';

import { formatSom, paymentSum, roundHalfUp } from './money';

const NBSP = '\u00a0';

describe('formatSom', () => {
  it('groups thousands with a no-break space and appends soʻm', () => {
    expect(formatSom(1_250_000)).toBe(`1${NBSP}250${NBSP}000${NBSP}soʻm`);
    expect(formatSom(1000)).toBe(`1${NBSP}000${NBSP}soʻm`);
    expect(formatSom(999)).toBe(`999${NBSP}soʻm`);
    expect(formatSom(0)).toBe(`0${NBSP}soʻm`);
  });

  it('formats negative amounts and bigint from the DB', () => {
    expect(formatSom(-50_000)).toBe(`-50${NBSP}000${NBSP}soʻm`);
    expect(formatSom(12_345_678_901_234_567_890n)).toBe(
      `12${NBSP}345${NBSP}678${NBSP}901${NBSP}234${NBSP}567${NBSP}890${NBSP}soʻm`,
    );
    expect(formatSom(-1_000n)).toBe(`-1${NBSP}000${NBSP}soʻm`);
  });

  it('uses the unit the UI passes (ru)', () => {
    expect(formatSom(7000, 'сум')).toBe(`7${NBSP}000${NBSP}сум`);
  });

  it('rejects fractions, NaN and unsafe numbers', () => {
    expect(() => formatSom(1.5)).toThrow(RangeError);
    expect(() => formatSom(Number.NaN)).toThrow(RangeError);
    expect(() => formatSom(2 ** 53)).toThrow(RangeError);
  });
});

describe('roundHalfUp', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfUp('2.5')).toBe(3);
    expect(roundHalfUp('-2.5')).toBe(-3);
    expect(roundHalfUp('0.5000')).toBe(1);
  });

  it('rounds below half toward zero and above half away from it', () => {
    expect(roundHalfUp('2.4999')).toBe(2);
    expect(roundHalfUp('-2.4999')).toBe(-2);
    expect(roundHalfUp('2.5001')).toBe(3);
    expect(roundHalfUp('81666.6669')).toBe(81_667);
  });

  it('keeps integers as they are', () => {
    expect(roundHalfUp('7')).toBe(7);
    expect(roundHalfUp('0')).toBe(0);
    expect(roundHalfUp('-0')).toBe(0);
    expect(roundHalfUp('120000.0000')).toBe(120_000);
  });

  it('rejects non-decimal strings and unsafe results', () => {
    expect(() => roundHalfUp('')).toThrow(RangeError);
    expect(() => roundHalfUp('1e5')).toThrow(RangeError);
    expect(() => roundHalfUp('1,5')).toThrow(RangeError);
    expect(() => roundHalfUp('.5')).toThrow(RangeError);
    expect(() => roundHalfUp('9007199254740992')).toThrow(RangeError);
  });
});

describe('paymentSum', () => {
  it('adds cash, card and credit', () => {
    expect(paymentSum({ paidCash: 100, paidCard: 50, paidCredit: 25 })).toBe(175);
  });

  it('counts a part not entered yet as 0', () => {
    expect(paymentSum({ paidCash: 100, paidCard: undefined })).toBe(100);
    expect(paymentSum({})).toBe(0);
  });
});
