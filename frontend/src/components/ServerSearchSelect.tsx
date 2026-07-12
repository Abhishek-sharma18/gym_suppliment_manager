'use client';

import { useState } from 'react';
import type { ZodType } from 'zod';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import type { SxProps, Theme } from '@mui/material/styles';
import { useListQuery } from '@/lib/useListQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

export interface ServerSearchSelectProps<T extends { _id: string }> {
  /** List resource path, e.g. 'customers' — queried as `/${resource}?search=...&limit=...`. */
  resource: string;
  itemSchema: ZodType<T>;
  getLabel: (item: T) => string;
  value: T | null;
  onChange: (value: T | null) => void;
  label: string;
  placeholder?: string;
  /** Client-side filter applied to each searched page — e.g. "only products with a recipe". */
  extraFilter?: (item: T) => boolean;
  limit?: number;
  error?: boolean;
  helperText?: string;
  autoFocus?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

/**
 * Debounced server-searched Autocomplete — extracted from SaleEntry's product/customer
 * pickers. A fixed-size page (limit, default 20) would make record #101 unreachable by
 * scrolling, so this re-queries the server on every keystroke (debounced) instead of
 * client-filtering a single page. filterOptions is the identity function because the
 * server already did the filtering — MUI's own client-side filter would otherwise
 * re-narrow an already search-scoped page.
 *
 * `value` is the full object, not just an id: with server-side search the current
 * results page may no longer contain the selection (e.g. right after picking, or when
 * the search box still holds an old term), so it's pinned into `options` whenever the
 * fetched page doesn't include it — the selection can't be re-derived from a
 * client-filtered options list the way it could with a single fixed page.
 */
export function ServerSearchSelect<T extends { _id: string }>({
  resource,
  itemSchema,
  getLabel,
  value,
  onChange,
  label,
  placeholder,
  extraFilter,
  limit = 20,
  error,
  helperText,
  autoFocus,
  required,
  fullWidth,
  size,
  sx,
}: ServerSearchSelectProps<T>) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const { rows, isLoading } = useListQuery(resource, itemSchema, {
    search: debouncedSearch || undefined,
    limit,
  });
  const pageRows = extraFilter ? rows.filter(extraFilter) : rows;
  const options = value && !pageRows.some((r) => r._id === value._id) ? [value, ...pageRows] : pageRows;

  return (
    <Autocomplete<T>
      options={options}
      loading={isLoading}
      value={value}
      inputValue={search}
      onInputChange={(_e, v) => setSearch(v)}
      filterOptions={(x) => x}
      getOptionLabel={getLabel}
      isOptionEqualToValue={(a, b) => a._id === b._id}
      onChange={(_e, v) => onChange(v)}
      size={size}
      fullWidth={fullWidth}
      sx={sx}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={error}
          helperText={helperText}
          autoFocus={autoFocus}
          required={required}
        />
      )}
    />
  );
}
