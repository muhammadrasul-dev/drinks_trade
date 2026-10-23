import { describe, expect, it } from 'vitest';

import { storeDayAt, storeDayRange } from './dates';

describe('storeDayAt', () => {
  it('reads the day in the store zone (UTC+5)', () => {
    expect(storeDayAt('2026-10-23').toISOString()).toBe('2026-10-22T19:00:00.000Z');
    expect(storeDayAt('2026-10-23', '12:00:00').toISOString()).toBe('2026-10-23T07:00:00.000Z');
  });
});

describe('storeDayRange', () => {
  it('covers whole store days, the end day included', () => {
    expect(storeDayRange('2026-10-01', '2026-10-23')).toEqual({
      gte: new Date('2026-09-30T19:00:00.000Z'),
      lt: new Date('2026-10-23T19:00:00.000Z'),
    });
  });

  it('leaves an end open when it is missing', () => {
    expect(storeDayRange('2026-10-01')).toEqual({ gte: new Date('2026-09-30T19:00:00.000Z') });
    expect(storeDayRange(undefined, '2026-10-23')).toEqual({
      lt: new Date('2026-10-23T19:00:00.000Z'),
    });
    expect(storeDayRange()).toBeUndefined();
  });
});
