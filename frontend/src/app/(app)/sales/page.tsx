'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { saleOut, customerOut, type SaleOut, type CustomerOut } from '@gym/shared';
import { useListQuery } from '@/lib/useListQuery';
import { dateFmt, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { ServerSearchSelect } from '@/components/ServerSearchSelect';
import { SaleEntry } from '@/components/SaleEntry';
import { SaleDetailDialog } from '@/components/SaleDetailDialog';

export default function SalesPage() {
  usePageTitle('Sales');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [customerFilter, setCustomerFilter] = useState<CustomerOut | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  // Reset to page 0 whenever a filter changes — adjusted during render per React's
  // "you might not need an effect" guidance, same convention the other list pages use.
  const filterKey = `${customerFilter?._id ?? ''}|${fromDate}|${toDate}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('sales', saleOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    customerId: customerFilter?._id || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  });
  const anyFilterActive = Boolean(customerFilter || fromDate || toDate);

  // Separate from the filter's own server-searched fetch below — this resolves whichever
  // customer names the current page of sales rows references, not a search-scoped page.
  const { rows: customers } = useListQuery('customers', customerOut, { limit: 100 });
  const customerMap = new Map(customers.map((c) => [c._id, c]));

  const columns: GridColDef<SaleOut>[] = [
    {
      field: 'invoiceNo',
      headerName: 'Invoice no.',
      width: 170,
      renderCell: (params) => (
        <Box component="span" sx={{ fontFamily: monoFamily }}>
          {params.row.invoiceNo}
        </Box>
      ),
    },
    {
      field: 'date',
      headerName: 'Date',
      width: 110,
      valueGetter: (_value, row) => dateFmt(row.date),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.total} />,
    },
    {
      field: 'amountPaid',
      headerName: 'Paid',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.amountPaid} />,
    },
    {
      field: 'udhaarAmount',
      headerName: 'Udhaar',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.udhaarAmount} udhaar={params.row.udhaarAmount > 0} />,
    },
    {
      field: 'customer',
      headerName: 'Customer',
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => (row.customerId ? customerMap.get(row.customerId)?.name ?? EM_DASH : 'Walk-in'),
    },
  ];

  return (
    <>
      <PageHeader title="Sales" />

      <SaleEntry />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <ServerSearchSelect<CustomerOut>
          resource="customers"
          itemSchema={customerOut}
          getLabel={(c) => c.name}
          value={customerFilter}
          onChange={setCustomerFilter}
          label="Customer"
          placeholder="All customers"
          size="small"
          sx={{ minWidth: 220 }}
        />
        <TextField
          label="From"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message={
            anyFilterActive ? 'No sales match these filters' : 'No sales yet — the form above records the first one'
          }
        />
      ) : (
        <DataTable<SaleOut>
          rows={rows}
          columns={columns}
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          loading={isLoading}
          onRowClick={(row) => setDetailSaleId(row._id)}
        />
      )}

      <SaleDetailDialog saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
    </>
  );
}
