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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { materialCreate, materialOut, materialUpdate, type MaterialOut } from '@gym/shared';
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
import { useNotify } from '@/components/SnackbarProvider';

interface MaterialFormState {
  name: string;
  buyUnit: string;
  useUnit: string;
  conversionFactor: string;
  reorderLevel: string;
}

const emptyForm: MaterialFormState = { name: '', buyUnit: '', useUnit: '', conversionFactor: '1', reorderLevel: '0' };

const toFormState = (m: MaterialOut): MaterialFormState => ({
  name: m.name,
  buyUnit: m.buyUnit,
  useUnit: m.useUnit,
  conversionFactor: String(m.conversionFactor),
  reorderLevel: String(m.reorderLevel),
});

export default function MaterialsPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MaterialOut | null>(null);
  const [form, setForm] = useState<MaterialFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<MaterialOut | null>(null);
  const [historyTarget, setHistoryTarget] = useState<MaterialOut | null>(null);

  // Reset to page 0 whenever the (debounced) search term changes — adjusted during render
  // per React's "you might not need an effect" guidance, not in a useEffect.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('materials', materialOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    search: search || undefined,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['materials'] });

  const createMaterial = useMutation({
    mutationFn: (input: MaterialFormState) =>
      postJson<{ data: unknown }>(
        '/materials',
        materialCreate.parse({
          name: input.name,
          buyUnit: input.buyUnit,
          useUnit: input.useUnit,
          conversionFactor: Number(input.conversionFactor),
          reorderLevel: Number(input.reorderLevel),
        }),
      ),
    onSuccess: async () => {
      notify('Material added');
      setFormOpen(false);
      await invalidate();
    },
  });

  const updateMaterial = useMutation({
    mutationFn: (vars: { id: string; input: MaterialFormState }) =>
      patchJson<{ data: unknown }>(
        `/materials/${vars.id}`,
        materialUpdate.parse({
          name: vars.input.name,
          buyUnit: vars.input.buyUnit,
          useUnit: vars.input.useUnit,
          conversionFactor: Number(vars.input.conversionFactor),
          reorderLevel: Number(vars.input.reorderLevel),
        }),
      ),
    onSuccess: async () => {
      notify('Material updated');
      setFormOpen(false);
      setEditTarget(null);
      await invalidate();
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: (id: string) => deleteJson(`/materials/${id}`),
    onSuccess: async () => {
      notify('Material deleted');
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

  const openEdit = (row: MaterialOut) => {
    setEditTarget(row);
    setForm(toFormState(row));
    setFormOpen(true);
  };

  const columns: GridColDef<MaterialOut>[] = [
    { field: 'name', headerName: 'Material', flex: 1, minWidth: 160 },
    {
      field: 'currentQty',
      headerName: 'Stock',
      width: 170,
      renderCell: (params) => {
        const low = params.row.reorderLevel > 0 && params.row.currentQty <= params.row.reorderLevel;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ fontFamily: monoFamily }}>
              {qtyFmt(params.row.currentQty, params.row.useUnit)}
            </Box>
            {low && <Chip label="Low" size="small" color="warning" />}
          </Box>
        );
      },
    },
    {
      field: 'avgCost',
      headerName: 'Avg cost',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.avgCost} />,
    },
    {
      field: 'reorderLevel',
      headerName: 'Reorder level',
      width: 150,
      renderCell: (params) => (
        <Box component="span" sx={{ fontFamily: monoFamily }}>
          {qtyFmt(params.row.reorderLevel, params.row.useUnit)}
        </Box>
      ),
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
              <Tooltip title="Edit material">
                <IconButton size="small" aria-label="Edit material" onClick={() => openEdit(params.row)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete material">
                <IconButton size="small" aria-label="Delete material" onClick={() => setDeleteTarget(params.row)}>
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
        title="Materials"
        action={
          isAdmin && (
            <Button variant="contained" onClick={openCreate}>
              Add material
            </Button>
          )
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          label="Search materials"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ maxWidth: 320, width: '100%' }}
        />
      </Box>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No materials yet — add the first one"
          actionLabel={isAdmin ? 'Add material' : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <DataTable<MaterialOut>
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
        title={editTarget ? 'Edit material' : 'Add material'}
        submitLabel={editTarget ? 'Save' : 'Add material'}
        pending={createMaterial.isPending || updateMaterial.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={async () => {
          if (editTarget) {
            await updateMaterial.mutateAsync({ id: editTarget._id, input: form });
          } else {
            await createMaterial.mutateAsync(form);
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
                label="Buy unit"
                value={form.buyUnit}
                onChange={(e) => setForm((f) => ({ ...f, buyUnit: e.target.value }))}
                error={Boolean(fieldError('buyUnit'))}
                helperText={fieldError('buyUnit') ?? 'e.g. bag'}
                required
                fullWidth
              />
              <TextField
                label="Use unit"
                value={form.useUnit}
                onChange={(e) => setForm((f) => ({ ...f, useUnit: e.target.value }))}
                error={Boolean(fieldError('useUnit'))}
                helperText={fieldError('useUnit') ?? 'e.g. kg'}
                required
                fullWidth
              />
            </Stack>
            <TextField
              label="Conversion factor"
              type="number"
              value={form.conversionFactor}
              onChange={(e) => setForm((f) => ({ ...f, conversionFactor: e.target.value }))}
              error={Boolean(fieldError('conversionFactor'))}
              helperText={fieldError('conversionFactor') ?? '1 buy unit = N use units'}
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              required
              fullWidth
            />
            <TextField
              label="Reorder level"
              type="number"
              value={form.reorderLevel}
              onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              error={Boolean(fieldError('reorderLevel'))}
              helperText={fieldError('reorderLevel') ?? 'In use units — 0 disables the low-stock warning'}
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              fullWidth
            />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete material"
        body={`Delete "${deleteTarget?.name ?? ''}"? Removes it from lists; its history stays on the ledger.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMaterial.mutateAsync(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />

      {historyTarget && (
        <StockHistoryDialog
          open
          onClose={() => setHistoryTarget(null)}
          itemKind="RAW"
          itemId={historyTarget._id}
          name={historyTarget.name}
          unit={historyTarget.useUnit}
        />
      )}
    </>
  );
}
