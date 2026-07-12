import { describe, expect, it } from 'vitest';
import { monthGrowth, trendMonthLabel } from './trends';

describe('monthGrowth', () => {
  it('computes a positive percentage and delta when revenue grew', () => {
    expect(monthGrowth(1200, 1000)).toEqual({ pct: 20, delta: 200 });
  });

  it('computes a negative percentage and delta when revenue fell', () => {
    expect(monthGrowth(800, 1000)).toEqual({ pct: -20, delta: -200 });
  });

  it('returns pct: null (not Infinity) when the previous month was zero', () => {
    expect(monthGrowth(500, 0)).toEqual({ pct: null, delta: 500 });
  });

  it('returns pct: null and delta 0 when both months are zero', () => {
    expect(monthGrowth(0, 0)).toEqual({ pct: null, delta: 0 });
  });
});

describe('trendMonthLabel', () => {
  it('renders a plain short month name for a non-January, non-first tick', () => {
    expect(trendMonthLabel('2025-08')).toBe('Aug');
  });

  it('includes the 2-digit year on a January tick even without forceYear', () => {
    expect(trendMonthLabel('2026-01')).toBe("Jan '26");
  });

  it('includes the 2-digit year when forceYear is set, even off-January', () => {
    expect(trendMonthLabel('2025-08', true)).toBe("Aug '25");
  });

  it('zero-pads single-digit months correctly ("2025-03" -> Mar)', () => {
    expect(trendMonthLabel('2025-03')).toBe('Mar');
  });
});
