'use client';

import { useQuery } from '@tanstack/react-query';
import { expenseOut } from '@gym/shared';
import { getJson } from './api';

export interface ExpenseRangeFilter {
  category?: string;
  from?: string;
  to?: string;
}

export interface ExpenseRangeTotal {
  /** Sum of every fetched expense's amount, rounded to 2dp like the backend's money figures. */
  sum: number;
  /** How many expenses the sum actually covers. */
  fetched: number;
  /** The server's total match count for the filter — sum is complete iff fetched >= total. */
  total: number;
}

interface ExpenseListResponse {
  data: unknown[];
  total: number;
}

const PAGE_LIMIT = 100; // shared listQuery's max limit
const MAX_PAGES = 10;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Visible-range total for the Expenses page: there is no aggregate endpoint, so this
 * loop-fetches the filtered list (limit 100, up to 10 pages) and sums amounts client-side.
 * Returns fetched vs the server's total so callers can render an explicit "first N of M"
 * caveat instead of a silently-wrong figure when >1000 expenses match. Query key starts
 * with 'expenses' so the page's create/update/delete invalidation refreshes it too.
 */
export function useExpenseRangeTotal(filter: ExpenseRangeFilter) {
  return useQuery<ExpenseRangeTotal>({
    queryKey: ['expenses', 'range-total', filter],
    queryFn: async () => {
      let sum = 0;
      let fetched = 0;
      let total = 0;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const search = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
        if (filter.category) search.set('category', filter.category);
        if (filter.from) search.set('from', filter.from);
        if (filter.to) search.set('to', filter.to);

        const res = await getJson<ExpenseListResponse>(`/expenses?${search.toString()}`);
        const rows = res.data.map((row) => expenseOut.parse(row));
        total = res.total;
        fetched += rows.length;
        for (const row of rows) sum += row.amount;
        if (fetched >= total || rows.length === 0) break;
      }
      return { sum: round2(sum), fetched, total };
    },
  });
}
