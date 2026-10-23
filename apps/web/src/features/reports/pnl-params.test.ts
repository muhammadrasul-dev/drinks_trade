import { describe, expect, it } from 'vitest';

import {
  currentMonthPeriod,
  parsePnlParams,
  PNL_REPORT_HREF,
  pnlPeriodRange,
  pnlReportHref,
  shiftPnlPeriod,
  switchPnlPeriodKind,
} from './pnl-params';

const TODAY = '2026-10-23';

const roundTrip = (href: string) =>
  parsePnlParams(Object.fromEntries(new URL(href, 'http://x').searchParams), TODAY);

describe('P&L params: parsing', () => {
  it('defaults to the current month (OQ-36), also for invalid values', () => {
    expect(currentMonthPeriod(TODAY)).toEqual({ kind: 'month', month: '2026-10' });
    expect(parsePnlParams({}, TODAY)).toEqual({ kind: 'month', month: '2026-10' });
    expect(
      parsePnlParams(
        { day: '2026-02-30', month: '2026-13', year: '26', from: 'x', to: '1.10.2026' },
        TODAY,
      ),
    ).toEqual({ kind: 'month', month: '2026-10' });
    expect(parsePnlParams({ year: '0999' }, TODAY)).toEqual({ kind: 'month', month: '2026-10' });
  });

  it('reads a day, a month, a year and a range; the first valid kind wins', () => {
    expect(parsePnlParams({ day: '2026-09-05' }, TODAY)).toEqual({
      kind: 'day',
      day: '2026-09-05',
    });
    expect(parsePnlParams({ month: '2026-09' }, TODAY)).toEqual({
      kind: 'month',
      month: '2026-09',
    });
    expect(parsePnlParams({ year: '2025' }, TODAY)).toEqual({ kind: 'year', year: '2025' });
    expect(parsePnlParams({ from: '2026-09-01', to: '2026-09-10' }, TODAY)).toEqual({
      kind: 'range',
      from: '2026-09-01',
      to: '2026-09-10',
    });
    expect(parsePnlParams({ day: '2026-09-05', month: '2026-08', year: '2025' }, TODAY)).toEqual({
      kind: 'day',
      day: '2026-09-05',
    });
    expect(parsePnlParams({ day: 'nope', month: '2026-08', year: '2025' }, TODAY)).toEqual({
      kind: 'month',
      month: '2026-08',
    });
    expect(parsePnlParams({ month: ['2026-07', '2026-08'] }, TODAY)).toEqual({
      kind: 'month',
      month: '2026-07',
    });
  });

  it('keeps one open end of a range and swaps a reversed one', () => {
    expect(parsePnlParams({ from: '2026-09-15' }, TODAY)).toEqual({
      kind: 'range',
      from: '2026-09-15',
    });
    expect(parsePnlParams({ to: '2026-09-15', from: 'nope' }, TODAY)).toEqual({
      kind: 'range',
      to: '2026-09-15',
    });
    expect(parsePnlParams({ from: '2026-10-05', to: '2026-10-01' }, TODAY)).toEqual({
      kind: 'range',
      from: '2026-10-01',
      to: '2026-10-05',
    });
  });
});

describe('P&L params: period → store days', () => {
  it('a day, a whole calendar month (leap years too) and a whole year', () => {
    expect(pnlPeriodRange({ kind: 'day', day: TODAY })).toEqual({ from: TODAY, to: TODAY });
    expect(pnlPeriodRange({ kind: 'month', month: '2026-10' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(pnlPeriodRange({ kind: 'month', month: '2026-02' }).to).toBe('2026-02-28');
    expect(pnlPeriodRange({ kind: 'month', month: '2028-02' }).to).toBe('2028-02-29');
    expect(pnlPeriodRange({ kind: 'month', month: '2026-04' }).to).toBe('2026-04-30');
    expect(pnlPeriodRange({ kind: 'year', year: '2026' })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(pnlPeriodRange({ kind: 'range', to: '2026-09-30' })).toEqual({ to: '2026-09-30' });
    expect(pnlPeriodRange({ kind: 'range' })).toEqual({});
  });
});

describe('P&L params: href', () => {
  it('round-trips every kind; the current month is the bare href', () => {
    const periods = [
      { kind: 'day', day: '2026-09-05' },
      { kind: 'month', month: '2026-09' },
      { kind: 'year', year: '2026' },
      { kind: 'range', from: '2026-09-01', to: '2026-09-10' },
      { kind: 'range', from: '2026-09-01' },
    ] as const;
    for (const period of periods) expect(roundTrip(pnlReportHref(period, TODAY))).toEqual(period);

    expect(pnlReportHref({ kind: 'day', day: '2026-09-05' }, TODAY)).toBe(
      `${PNL_REPORT_HREF}?day=2026-09-05`,
    );
    expect(pnlReportHref({ kind: 'month', month: '2026-10' }, TODAY)).toBe(PNL_REPORT_HREF);
    expect(pnlReportHref({ kind: 'month', month: '2026-09' }, TODAY)).toBe(
      `${PNL_REPORT_HREF}?month=2026-09`,
    );
    expect(pnlReportHref({ kind: 'year', year: '2026' }, TODAY)).toBe(
      `${PNL_REPORT_HREF}?year=2026`,
    );
    expect(pnlReportHref({ kind: 'range', to: '2026-09-30' }, TODAY)).toBe(
      `${PNL_REPORT_HREF}?to=2026-09-30`,
    );
    // An empty range is the default period.
    expect(pnlReportHref({ kind: 'range' }, TODAY)).toBe(PNL_REPORT_HREF);
  });
});

describe('P&L params: previous / next', () => {
  it('steps across month and year ends, not into the future', () => {
    expect(shiftPnlPeriod({ kind: 'day', day: '2026-03-01' }, -1, TODAY)).toEqual({
      kind: 'day',
      day: '2026-02-28',
    });
    expect(shiftPnlPeriod({ kind: 'day', day: '2026-10-22' }, 1, TODAY)).toEqual({
      kind: 'day',
      day: TODAY,
    });
    expect(shiftPnlPeriod({ kind: 'day', day: TODAY }, 1, TODAY)).toBeUndefined();
    expect(shiftPnlPeriod({ kind: 'month', month: '2026-01' }, -1, TODAY)).toEqual({
      kind: 'month',
      month: '2025-12',
    });
    expect(shiftPnlPeriod({ kind: 'month', month: '2025-12' }, 1, TODAY)).toEqual({
      kind: 'month',
      month: '2026-01',
    });
    expect(shiftPnlPeriod({ kind: 'month', month: '2026-10' }, 1, TODAY)).toBeUndefined();
    expect(shiftPnlPeriod({ kind: 'year', year: '2025' }, 1, TODAY)).toEqual({
      kind: 'year',
      year: '2026',
    });
    expect(shiftPnlPeriod({ kind: 'year', year: '2026' }, 1, TODAY)).toBeUndefined();
    expect(shiftPnlPeriod({ kind: 'year', year: '1000' }, -1, TODAY)).toBeUndefined();
    expect(shiftPnlPeriod({ kind: 'range', from: '2026-09-01' }, -1, TODAY)).toBeUndefined();
  });
});

describe('P&L params: switching the kind', () => {
  it('stays on today when the period contains it', () => {
    const month = currentMonthPeriod(TODAY);
    expect(switchPnlPeriodKind(month, 'day', TODAY)).toEqual({ kind: 'day', day: TODAY });
    expect(switchPnlPeriodKind(month, 'year', TODAY)).toEqual({ kind: 'year', year: '2026' });
    expect(switchPnlPeriodKind(month, 'month', TODAY)).toBe(month);
    // A range is cut at today.
    expect(switchPnlPeriodKind(month, 'range', TODAY)).toEqual({
      kind: 'range',
      from: '2026-10-01',
      to: TODAY,
    });
  });

  it('otherwise goes to the start of the current period', () => {
    const september = { kind: 'month', month: '2026-09' } as const;
    expect(switchPnlPeriodKind(september, 'day', TODAY)).toEqual({
      kind: 'day',
      day: '2026-09-01',
    });
    expect(switchPnlPeriodKind(september, 'range', TODAY)).toEqual({
      kind: 'range',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(switchPnlPeriodKind({ kind: 'year', year: '2025' }, 'month', TODAY)).toEqual({
      kind: 'month',
      month: '2025-01',
    });
    expect(
      switchPnlPeriodKind({ kind: 'range', from: '2026-08-10', to: '2026-09-02' }, 'month', TODAY),
    ).toEqual({ kind: 'month', month: '2026-08' });
    expect(switchPnlPeriodKind({ kind: 'range', to: '2026-09-02' }, 'day', TODAY)).toEqual({
      kind: 'day',
      day: '2026-09-02',
    });
    expect(switchPnlPeriodKind({ kind: 'range', from: '2026-09-02' }, 'day', TODAY)).toEqual({
      kind: 'day',
      day: TODAY,
    });
  });
});
