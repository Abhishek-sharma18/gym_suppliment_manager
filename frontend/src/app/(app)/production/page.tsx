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
import { productionOut, productOut, materialOut, type ProductionOut, type ProductOut } from '@gym/shared';
import { useListQuery } from '@/lib/useListQuery';
import { dateFmt, qtyFmt, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { ProductionForm } from '@/components/ProductionForm';

const EXPIRY_WARNING_DAYS = 30;

function expiryChip(expiryDate: Date | undefined) {
  if (!expiryDate) return null;
  const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft > EXPIRY_WARNING_DAYS) return null;
  return daysLeft < 0 ? (
    <Chip label="Expired" size="small" color="error" />
  ) : (
    <Chip label="Expiring soon" size="small" color="warning" />
  );
}

export default function ProductionPage() {
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [productFilter, setProductFilter] = useState<ProductOut | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ProductionOut | null>(null);

  // Reset to page 0 whenever a filter changes — adjusted during render per React's
  // "you might not need an effect" guidance, same convention the purchases list page uses.
  const filterKey = `${productFilter?._id ?? ''}|${fromDate}|${toDate}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('production', productionOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    productId: productFilter?._id || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  });

  // Products/materials are only ever referenced by id on a batch; both lookups are small
  // enough to load in full and resolve locally, for the product filter and name/line lookups.
  const { rows: products } = useListQuery('products', productOut, { limit: 100 });
  const { rows: materials } = useListQuery('materials', materialOut, { limit: 100 });
  const productMap = new Map(products.map((p) => [p._id, p]));
  const materialMap = new Map(materials.map((m) => [m._id, m]));

  const columns: GridColDef<ProductionOut>[] = [
    {
      field: 'batchNo',
      headerName: 'Batch no.',
      width: 170,
      renderCell: (params) => (
        <Box component="span" sx={{ fontFamily: monoFamily }}>
          {params.row.batchNo}
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
      field: 'product',
      headerName: 'Product',
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => productMap.get(row.productId)?.name ?? EM_DASH,
    },
    {
      field: 'qtyProduced',
      headerName: 'Qty',
      width: 110,
      renderCell: (params) => (
        <Box component="span" sx={{ fontFamily: monoFamily }}>
          {qtyFmt(params.row.qtyProduced, 'unit')}
        </Box>
      ),
    },
    {
      field: 'expiryDate',
      headerName: 'Expiry',
      width: 190,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box component="span">{params.row.expiryDate ? dateFmt(params.row.expiryDate) : EM_DASH}</Box>
          {expiryChip(params.row.expiryDate)}
        </Stack>
      ),
    },
    {
      field: 'unitCost',
      headerName: 'Unit cost',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.costSnapshot?.unitCost} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Production"
        action={
          <Button variant="contained" onClick={() => setFormOpen(true)}>
            New batch
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Autocomplete<ProductOut>
          options={products}
          value={productFilter}
          getOptionLabel={(p) => (p.variant ? `${p.name} (${p.variant})` : p.name)}
          isOptionEqualToValue={(a, b) => a._id === b._id}
          onChange={(_e, v) => setProductFilter(v)}
          size="small"
          sx={{ minWidth: 220 }}
          renderInput={(params) => <TextField {...params} label="Product" placeholder="All products" />}
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
        <EmptyState message="No batches yet — record the first one" actionLabel="New batch" onAction={() => setFormOpen(true)} />
      ) : (
        <DataTable<ProductionOut>
          rows={rows}
          columns={columns}
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          loading={isLoading}
          onRowClick={(row) => setDetailTarget(row)}
        />
      )}

      <ProductionForm open={formOpen} onClose={() => setFormOpen(false)} />

      <Dialog open={detailTarget !== null} onClose={() => setDetailTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Batch detail</DialogTitle>
        <DialogContent>
          {detailTarget && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Chip label={detailTarget.batchNo} size="small" sx={{ fontFamily: monoFamily }} />
                <Chip label={productMap.get(detailTarget.productId)?.name ?? EM_DASH} size="small" variant="outlined" />
                <Chip label={dateFmt(detailTarget.date)} size="small" variant="outlined" />
                {detailTarget.expiryDate && (
                  <Chip label={`Expires ${dateFmt(detailTarget.expiryDate)}`} size="small" variant="outlined" />
                )}
              </Stack>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Material</TableCell>
                      <TableCell align="right">Planned</TableCell>
                      <TableCell align="right">Actual</TableCell>
                      <TableCell align="right">Wastage</TableCell>
                      <TableCell align="right">Cost / unit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailTarget.materialsConsumed.map((line, i) => {
                      const material = materialMap.get(line.materialId);
                      const unit = material?.useUnit ?? '';
                      return (
                        <TableRow key={i}>
                          <TableCell>{material?.name ?? EM_DASH}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: monoFamily }}>
                            {qtyFmt(line.plannedQty, unit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: monoFamily }}>
                            {qtyFmt(line.actualQty, unit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: monoFamily }}>
                            {qtyFmt(line.wastageQty, unit)}
                          </TableCell>
                          <TableCell align="right">
                            <MoneyText value={line.costPerUseUnit} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {detailTarget.costSnapshot && (
                <Stack spacing={0.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      Material cost
                    </Box>
                    <MoneyText value={detailTarget.costSnapshot.materialCost} />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      Packaging cost
                    </Box>
                    <MoneyText value={detailTarget.costSnapshot.packagingCost} />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1 }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      Total cost
                    </Box>
                    <MoneyText value={detailTarget.costSnapshot.totalCost} variant="total" />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      Unit cost
                    </Box>
                    <MoneyText value={detailTarget.costSnapshot.unitCost} />
                  </Box>
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
