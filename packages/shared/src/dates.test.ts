import { describe, expect, it } from 'vitest';

import {
  addMonths,
  addStoreDays,
  formatDate,
  formatDateTime,
  formatStoreDay,
  lastDayOfMonth,
  storeDateOf,
  storeToday,
} from './dates';

describe('formatDateTime', () => {
  it('formats DD.MM.YYYY HH:mm in the store time zone (UTC+5)', () => {
    expect(formatDateTime(new Date('2026-10-22T19:05:00Z'))).toBe('23.10.2026 00:05');
    expect(formatDateTime(new Date('2026-01-05T09:30:00Z'))).toBe('05.01.2026 14:30');
  });

  it('accepts another zone', () => {
    expect(formatDateTime(new Date('2026-10-22T19:05:00Z'), 'UTC')).toBe('22.10.2026 19:05');
  });
});

describe('store days', () => {
  it('takes the calendar day in the store zone, not UTC', () => {
    expect(storeDateOf(new Date('2026-10-22T19:05:00Z'))).toBe('2026-10-23');
    expect(storeDateOf(new Date('2026-10-22T18:59:00Z'))).toBe('2026-10-22');
    expect(storeToday(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
    expect(formatDate(new Date('2026-01-05T09:30:00Z'))).toBe('05.01.2026');
    expect(formatStoreDay('2026-10-23')).toBe('23.10.2026');
  });

  it('adds days and months across month, year and leap-year ends', () => {
    expect(addStoreDays('2026-10-23', 0)).toBe('2026-10-23');
    expect(addStoreDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addStoreDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addStoreDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });
});
