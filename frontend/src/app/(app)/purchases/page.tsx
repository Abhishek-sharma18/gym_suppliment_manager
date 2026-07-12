'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { purchaseOut, supplierOut, materialOut, type PurchaseOut, type SupplierOut } from '@gym/shared';
import { useListQuery } from '@/lib/useListQuery';
import { dateFmt, qtyFmt, enumLabel, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { PurchaseForm } from '@/components/PurchaseForm';

export default function PurchasesPage() {
  usePageTitle('Purchases');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [supplierFilter, setSupplierFilter] = useState<SupplierOut | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PurchaseOut | null>(null);

  // Reset to page 0 whenever a filter changes — adjusted during render per React's
  // "you might not need an effect" guidance, not in a useEffect (same convention the
  // other list pages use for their debounced search box).
  const filterKey = `${supplierFilter?._id ?? ''}|${fromDate}|${toDate}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('purchases', purchaseOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    supplierId: supplierFilter?._id || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  });
  const anyFilterActive = Boolean(supplierFilter || fromDate || toDate);

  // Suppliers/materials are only ever referenced by id on a purchase; both lookups are
  // small enough (same 100-row cap BomEditor uses for materials) to load in full and
  // resolve locally, for both the supplier filter and the name/line lookups below.
  const { rows: suppliers } = useListQuery('suppliers', supplierOut, { limit: 100 });
  const { rows: materials } = useListQuery('materials', materialOut, { limit: 100 });
  const supplierMap = new Map(suppliers.map((s) => [s._id, s]));
  const materialMap = new Map(materials.map((m) => [m._id, m]));

  const columns: GridColDef<PurchaseOut>[] = [
    {
      field: 'date',
      headerName: 'Date',
      width: 110,
      valueGetter: (_value, row) => dateFmt(row.date),
    },
    {
      field: 'supplier',
      headerName: 'Supplier',
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => supplierMap.get(row.supplierId)?.name ?? EM_DASH,
    },
    {
      field: 'invoiceNo',
      headerName: 'Invoice no.',
      width: 140,
      renderCell: (params) => (
        <Box component="span" sx={{ fontFamily: monoFamily }}>
          {params.row.invoiceNo ?? EM_DASH}
        </Box>
      ),
    },
    {
      field: 'itemCount',
      headerName: 'Lines',
      width: 90,
      valueGetter: (_value, row) => row.items.length,
    },
    {
      field: 'totalAmount',
      headerName: 'Total',
      width: 140,
      renderCell: (params) => <MoneyText value={params.row.totalAmount} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchases"
        action={
          <Button variant="contained" onClick={() => setFormOpen(true)}>
            Record purchase
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Autocomplete<SupplierOut>
          options={suppliers}
          value={supplierFilter}
          getOptionLabel={(s) => s.name}
          isOptionEqualToValue={(a, b) => a._id === b._id}
          onChange={(_e, v) => setSupplierFilter(v)}
          size="small"
          sx={{ minWidth: 220 }}
          renderInput={(params) => <TextField {...params} label="Supplier" placeholder="All suppliers" />}
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
          message={anyFilterActive ? 'No purchases match these filters' : 'No purchases yet — record the first one'}
          actionLabel={anyFilterActive ? undefined : 'Record purchase'}
          onAction={anyFilterActive ? undefined : () => setFormOpen(true)}
        />
      ) : (
        <DataTable<PurchaseOut>
          rows={rows}
          columns={columns}
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          loading={isLoading}
          onRowClick={(row) => setDetailTarget(row)}
        />
      )}

      <PurchaseForm open={formOpen} onClose={() => setFormOpen(false)} />

      <Dialog open={detailTarget !== null} onClose={() => setDetailTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Purchase detail</DialogTitle>
        <DialogContent>
          {detailTarget && (() => {
            // Admin always qualifies (every line carries costPerBuyUnit/lineTotal); staff
            // never does, since the API strips both fields entirely for that role.
            const showCost = detailTarget.items.some((l) => l.costPerBuyUnit !== undefined);
            return (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Chip label={supplierMap.get(detailTarget.supplierId)?.name ?? EM_DASH} size="small" />
                <Chip label={dateFmt(detailTarget.date)} size="small" variant="outlined" />
                <Chip label={enumLabel(detailTarget.paymentMode)} size="small" variant="outlined" />
                {detailTarget.invoiceNo && (
                  <Chip label={`Invoice ${detailTarget.invoiceNo}`} size="small" variant="outlined" />
                )}
              </Stack>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Material</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      {showCost && <TableCell align="right">Cost / unit</TableCell>}
                      {showCost && <TableCell align="right">Line total</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailTarget.items.map((line, i) => {
                      const material = materialMap.get(line.materialId);
                      return (
                        <TableRow key={i}>
                          <TableCell>{material?.name ?? EM_DASH}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: monoFamily }}>
                            {qtyFmt(line.qtyBuyUnit, material?.buyUnit ?? '')}
                          </TableCell>
                          {showCost && (
                            <TableCell align="right">
                              <MoneyText value={line.costPerBuyUnit} />
                            </TableCell>
                          )}
                          {showCost && (
                            <TableCell align="right">
                              <MoneyText value={line.lineTotal} />
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1 }}>
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  Total
                </Box>
                <MoneyText value={detailTarget.totalAmount} variant="total" />
              </Box>
            </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
