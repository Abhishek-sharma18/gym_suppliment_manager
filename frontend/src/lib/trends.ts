/**
 * Pure helpers for the Reports "Trends" chart — kept dependency-free of React/MUI so they
 * can be unit tested the same way as fmt.ts, and reused by both the chart's axis
 * formatter and the growth stat tile.
 */

export interface GrowthStat {
  /** Percentage change latest vs previous, or null when previous is 0 (division by zero). */
  pct: number | null;
  /** Signed absolute ₹ change, latest − previous. */
  delta: number;
}

/** latest vs previous month comparison; previous === 0 has no defined percentage ("new"). */
export function monthGrowth(latest: number, previous: number): GrowthStat {
  const delta = latest - previous;
  if (previous === 0) return { pct: null, delta };
  return { pct: (delta / previous) * 100, delta };
}

const shortMonthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short' });

/**
 * "YYYY-MM" -> short month label, e.g. "Aug". Includes the 2-digit year ("Jan '26") on
 * January ticks or when forceYear is set (the chart's very first tick, so the reader
 * always sees which year the series starts in).
 */
export function trendMonthLabel(monthKey: string, forceYear = false): string {
  const [yearStr, monStr] = monthKey.split('-');
  const date = new Date(Number(yearStr), Number(monStr) - 1, 1);
  const month = shortMonthFmt.format(date);
  const isJanuary = monStr === '01';
  return isJanuary || forceYear ? `${month} '${yearStr.slice(2)}` : month;
}
