'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  dashboardOut, profitReportOut, salesSummaryOut, stockValueOut, udhaarEntry, type DashboardOut,
} from '@gym/shared';
import { getJson } from './api';

interface Envelope<T> {
  data: T;
}

// Only dashboardOut has a named *Out type exported from @gym/shared; the rest are inferred
// locally from their schema, same as the backend's own services/reports.ts does.
export type StockValueOut = z.infer<typeof stockValueOut>;
export type ProfitReportOut = z.infer<typeof profitReportOut>;
export type SalesSummaryOut = z.infer<typeof salesSummaryOut>;

const udhaarReportOut = z.array(udhaarEntry);
export type UdhaarReportOut = z.infer<typeof udhaarReportOut>;

/**
 * Non-list report endpoints ({ data: <value> }, not { data, page, limit, total }) — each
 * parsed with its @gym/shared *Out schema so callers only ever see validated data, same
 * contract useListQuery gives paginated resources.
 */
export function useDashboard() {
  return useQuery<DashboardOut>({
    queryKey: ['reports', 'dashboard'],
    queryFn: async () => dashboardOut.parse((await getJson<Envelope<unknown>>('/reports/dashboard')).data),
  });
}

export function useStockValue() {
  return useQuery<StockValueOut>({
    queryKey: ['reports', 'stock-value'],
    queryFn: async () => stockValueOut.parse((await getJson<Envelope<unknown>>('/reports/stock-value')).data),
  });
}

export function useProfit(month: string) {
  return useQuery<ProfitReportOut>({
    queryKey: ['reports', 'profit', month],
    queryFn: async () => {
      const qs = new URLSearchParams({ month }).toString();
      return profitReportOut.parse((await getJson<Envelope<unknown>>(`/reports/profit?${qs}`)).data);
    },
  });
}

export function useUdhaarReport() {
  return useQuery<UdhaarReportOut>({
    queryKey: ['reports', 'udhaar'],
    queryFn: async () => udhaarReportOut.parse((await getJson<Envelope<unknown>>('/reports/udhaar')).data),
  });
}

export function useSalesSummary(from: string, to: string) {
  return useQuery<SalesSummaryOut>({
    queryKey: ['reports', 'sales-summary', from, to],
    queryFn: async () => {
      const qs = new URLSearchParams({ from, to }).toString();
      return salesSummaryOut.parse((await getJson<Envelope<unknown>>(`/reports/sales-summary?${qs}`)).data);
    },
    enabled: Boolean(from && to),
  });
}
