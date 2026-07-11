'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { productCreate, productOut, productUpdate, type ProductOut } from '@gym/shared';
import { postJson, patchJson, deleteJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useMe } from '@/lib/auth';
import { qtyFmt } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StockHistoryDialog } from '@/components/StockHistoryDialog';
import { BomEditor, type BomLineValue } from '@/components/BomEditor';
import { useNotify } from '@/components/SnackbarProvider';

interface ProductFormState {
  name: string;
  variant: string;
  sku: string;
  sellingPrice: string;
  packagingCostPerUnit: string;
  reorderLevel: string;
  bom: BomLineValue[];
}

const emptyForm: ProductFormState = {
  name: '',
  variant: '',
  sku: '',
  sellingPrice: '',
  packagingCostPerUnit: '0',
  reorderLevel: '0',
  bom: [],
};

const toFormState = (p: ProductOut): ProductFormState => ({
  name: p.name,
  variant: p.variant ?? '',
  sku: p.sku ?? '',
  sellingPrice: String(p.sellingPrice),
  packagingCostPerUnit: String(p.packagingCostPerUnit ?? 0),
  reorderLevel: String(p.reorderLevel),
  bom: p.bom.map((line) => ({ materialId: line.materialId, qtyPerUnit: line.qtyPerUnit })),
});

/** Empty optional strings are omitted so the schema's `.optional()` (not empty-string) is sent. */
const toPayload = (input: ProductFormState) => ({
  name: input.name,
  variant: input.variant.trim() || undefined,
  sku: input.sku.trim() || undefined,
  sellingPrice: Number(input.sellingPrice),
  packagingCostPerUnit: Number(input.packagingCostPerUnit),
  reorderLevel: Number(input.reorderLevel),
  bom: input.bom,
});

export default function ProductsPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductOut | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ProductOut | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ProductOut | null>(null);

  // Reset to page 0 whenever the (debounced) search term changes — adjusted during render
  // per React's "you might not need an effect" guidance, not in a useEffect.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('products', productOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    search: search || undefined,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['products'] });

  const createProduct = useMutation({
    mutationFn: (input: ProductFormState) =>
      postJson<{ data: unknown }>('/products', productCreate.parse(toPayload(input))),
    onSuccess: async () => {
      notify('Product added');
      setFormOpen(false);
      await invalidate();
    },
  });

  const updateProduct = useMutation({
    mutationFn: (vars: { id: string; input: ProductFormState }) =>
      patchJson<{ data: unknown }>(`/products/${vars.id}`, productUpdate.parse(toPayload(vars.input))),
    onSuccess: async () => {
      notify('Product updated');
      setFormOpen(false);
      setEditTarget(null);
      await invalidate();
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => deleteJson(`/products/${id}`),
    onSuccess: async () => {
      notify('Product deleted');
      await invalidate();
    },
    onError: (err: unknown) => {
      notify(err instanceof ApiClientError ? err.message : 'Delete failed', 'error');
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (row: ProductOut) => {
    setEditTarget(row);
    setForm(toFormState(row));
    setFormOpen(true);
  };

  const columns: GridColDef<ProductOut>[] = [
    {
      field: 'name',
      headerName: 'Product',
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <Box component="span">{params.row.name}</Box>
          {params.row.variant ? (
            <Typography variant="caption" color="text.secondary" component="span">
              {params.row.variant}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: 'sellingPrice',
      headerName: 'Selling price',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.sellingPrice} />,
    },
    {
      field: 'currentQty',
      headerName: 'Stock',
      width: 170,
      renderCell: (params) => {
        const low = params.row.reorderLevel > 0 && params.row.currentQty <= params.row.reorderLevel;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ fontFamily: monoFamily }}>
              {qtyFmt(params.row.currentQty, 'unit')}
            </Box>
            {low && <Chip label="Low" size="small" color="warning" />}
          </Box>
        );
      },
    },
    {
      field: 'avgUnitCost',
      headerName: 'Avg unit cost',
      width: 140,
      renderCell: (params) => <MoneyText value={params.row.avgUnitCost} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: isAdmin ? 132 : 60,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Stock history">
            <IconButton size="small" aria-label="Stock history" onClick={() => setHistoryTarget(params.row)}>
              <HistoryOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <>
              <Tooltip title="Edit product">
                <IconButton size="small" aria-label="Edit product" onClick={() => openEdit(params.row)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete product">
                <IconButton size="small" aria-label="Delete product" onClick={() => setDeleteTarget(params.row)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        action={
          isAdmin && (
            <Button variant="contained" onClick={openCreate}>
              Add product
            </Button>
          )
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          label="Search products"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ maxWidth: 320, width: '100%' }}
        />
      </Box>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No products yet — add the first one"
          actionLabel={isAdmin ? 'Add product' : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <DataTable<ProductOut>
          rows={rows}
          columns={columns}
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          loading={isLoading}
        />
      )}

      <FormDialog
        open={formOpen}
        title={editTarget ? 'Edit product' : 'Add product'}
        submitLabel={editTarget ? 'Save' : 'Add product'}
        pending={createProduct.isPending || updateProduct.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={async () => {
          if (editTarget) {
            await updateProduct.mutateAsync({ id: editTarget._id, input: form });
          } else {
            await createProduct.mutateAsync(form);
          }
        }}
      >
        {({ fieldError }) => (
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={Boolean(fieldError('name'))}
              helperText={fieldError('name')}
              autoFocus
              required
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Variant"
                value={form.variant}
                onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))}
                error={Boolean(fieldError('variant'))}
                helperText={fieldError('variant') ?? 'e.g. 1kg'}
                fullWidth
              />
              <TextField
                label="SKU"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                error={Boolean(fieldError('sku'))}
                helperText={fieldError('sku')}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Selling price"
                type="number"
                value={form.sellingPrice}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                error={Boolean(fieldError('sellingPrice'))}
                helperText={fieldError('sellingPrice')}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                required
                fullWidth
              />
              <TextField
                label="Packaging cost per unit"
                type="number"
                value={form.packagingCostPerUnit}
                onChange={(e) => setForm((f) => ({ ...f, packagingCostPerUnit: e.target.value }))}
                error={Boolean(fieldError('packagingCostPerUnit'))}
                helperText={fieldError('packagingCostPerUnit')}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                fullWidth
              />
            </Stack>
            <TextField
              label="Reorder level"
              type="number"
              value={form.reorderLevel}
              onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              error={Boolean(fieldError('reorderLevel'))}
              helperText={fieldError('reorderLevel') ?? '0 disables the low-stock warning'}
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              fullWidth
            />
            <BomEditor
              value={form.bom}
              onChange={(bom) => setForm((f) => ({ ...f, bom }))}
              fieldError={fieldError}
            />
            {form.bom.length === 0 && (
              <Alert severity="info">Without a recipe this product cannot be produced.</Alert>
            )}
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete product"
        body={`Delete "${deleteTarget?.name ?? ''}"? Removes it from lists; its history stays on the ledger.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteProduct.mutateAsync(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />

      {historyTarget && (
        <StockHistoryDialog
          open
          onClose={() => setHistoryTarget(null)}
          itemKind="FINISHED"
          itemId={historyTarget._id}
          name={historyTarget.name}
          unit="unit"
        />
      )}
    </>
  );
}
