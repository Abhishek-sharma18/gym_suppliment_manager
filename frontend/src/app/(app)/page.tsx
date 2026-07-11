'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { materialCreate, materialOut, type MaterialOut } from '@gym/shared';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { postJson, deleteJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { qtyFmt } from '@/lib/fmt';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';

// Temporary demo of the shared UI kit (Task 2). Task 9 replaces this page with the
// real dashboard; the Materials list UI proper lands in Task 3.
export default function DashboardPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MaterialOut | null>(null);

  const { rows, total, isLoading } = useListQuery('materials', materialOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
  });

  const createMaterial = useMutation({
    mutationFn: (input: { name: string }) =>
      postJson<{ data: unknown }>(
        '/materials',
        materialCreate.parse({ name: input.name, buyUnit: 'kg', useUnit: 'kg', conversionFactor: 1 }),
      ),
    onSuccess: async () => {
      notify('Material added');
      setCreateOpen(false);
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: (id: string) => deleteJson(`/materials/${id}`),
    onSuccess: async () => {
      notify('Material deleted');
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: unknown) => {
      notify(err instanceof ApiClientError ? err.message : 'Delete failed', 'error');
    },
  });

  const columns: GridColDef<MaterialOut>[] = [
    { field: 'name', headerName: 'Material', flex: 1, minWidth: 160 },
    { field: 'useUnit', headerName: 'Unit', width: 90 },
    {
      field: 'currentQty',
      headerName: 'Stock',
      width: 130,
      valueGetter: (_value, row) => qtyFmt(row.currentQty, row.useUnit),
    },
    {
      field: 'avgCost',
      headerName: 'Avg cost',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.avgCost} />,
    },
    {
      field: 'value',
      headerName: 'Stock value',
      width: 150,
      renderCell: (params) => (
        <MoneyText
          value={params.row.avgCost === undefined ? undefined : params.row.avgCost * params.row.currentQty}
          variant="total"
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 56,
      sortable: false,
      renderCell: (params) => (
        <IconButton size="small" aria-label="Delete material" onClick={() => setDeleteTarget(params.row)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        action={
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            New material
          </Button>
        }
      />

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No materials yet — add the first one"
          actionLabel="New material"
          onAction={() => setCreateOpen(true)}
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
        open={createOpen}
        title="New material"
        submitLabel="Add material"
        pending={createMaterial.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={async () => {
          await createMaterial.mutateAsync({ name });
        }}
      >
        {({ fieldError }) => (
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(fieldError('name'))}
              helperText={fieldError('name')}
              autoFocus
              required
              fullWidth
            />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete material"
        body={`Delete "${deleteTarget?.name ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMaterial.mutateAsync(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
