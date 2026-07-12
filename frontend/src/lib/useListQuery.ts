'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { getJson } from './api';

export type ListParams = Record<string, string | number | undefined>;

interface ListResponse {
  data: unknown[];
  page: number;
  limit: number;
  total: number;
}

export interface UseListQueryResult<T> {
  rows: T[];
  total: number;
  isLoading: boolean;
  error: UseQueryResult['error'];
  refetch: UseQueryResult['refetch'];
}

function buildQueryString(params: ListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Wraps a server-paginated list endpoint ({ data, page, limit, total }) in a TanStack Query
 * hook. Each row is parsed with itemSchema so consumers only ever see validated data.
 */
export function useListQuery<T>(
  resource: string,
  itemSchema: ZodType<T>,
  params: ListParams,
): UseListQueryResult<T> {
  const query = useQuery({
    queryKey: [resource, params],
    queryFn: async () => {
      const res = await getJson<ListResponse>(`/${resource}${buildQueryString(params)}`);
      return {
        rows: res.data.map((row) => itemSchema.parse(row)),
        total: res.total,
      };
    },
  });

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
