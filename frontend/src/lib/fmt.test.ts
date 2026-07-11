import { describe, expect, it } from 'vitest';
import { localDateValue, monthValue } from './fmt';

describe('monthValue', () => {
  it('uses the LOCAL month, not the UTC month, just after local midnight on the 1st', () => {
    // 1 Aug 2026, 00:30 local time. In any timezone ahead of UTC (e.g. IST, +05:30)
    // toISOString() would still say July.
    const justAfterMidnight = new Date(2026, 7, 1, 0, 30, 0);

    expect(monthValue(justAfterMidnight)).toBe('2026-08');
  });

  it('zero-pads single-digit months', () => {
    const d = new Date(2026, 0, 15, 12, 0, 0); // 15 Jan 2026, noon local

    expect(monthValue(d)).toBe('2026-01');
  });

  it('matches the local calendar month at the end of the month too', () => {
    // 31 Jul 2026, 23:30 local: in any timezone behind UTC (e.g. US) toISOString()
    // would say August.
    const justBeforeMidnight = new Date(2026, 6, 31, 23, 30, 0);

    expect(monthValue(justBeforeMidnight)).toBe('2026-07');
  });
});

describe('localDateValue', () => {
  it('uses the LOCAL day, not the UTC day, just after local midnight (reviewer repro)', () => {
    // Date constructed from local components: 15 Mar 2026, 00:30 local time. In any
    // timezone ahead of UTC (e.g. IST, +05:30) toISOString() would still say 14 Mar.
    const justAfterMidnight = new Date(2026, 2, 15, 0, 30, 0);

    expect(localDateValue(justAfterMidnight)).toBe('2026-03-15');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 12, 0, 0); // 5 Jan 2026, noon local

    expect(localDateValue(d)).toBe('2026-01-05');
  });

  it('matches the local calendar day at the end of the day too', () => {
    // 23:30 local: in any timezone behind UTC (e.g. US) toISOString() would say the NEXT day.
    const justBeforeMidnight = new Date(2026, 6, 11, 23, 30, 0);

    expect(localDateValue(justBeforeMidnight)).toBe('2026-07-11');
  });
});
