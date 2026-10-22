import { describe, expect, it } from 'vitest';

import { formatDateTime } from './dates';

describe('formatDateTime', () => {
  it('formats DD.MM.YYYY HH:mm in the store time zone (UTC+5)', () => {
    expect(formatDateTime(new Date('2026-10-22T19:05:00Z'))).toBe('23.10.2026 00:05');
    expect(formatDateTime(new Date('2026-01-05T09:30:00Z'))).toBe('05.01.2026 14:30');
  });

  it('accepts another zone', () => {
    expect(formatDateTime(new Date('2026-10-22T19:05:00Z'), 'UTC')).toBe('22.10.2026 19:05');
  });
});
