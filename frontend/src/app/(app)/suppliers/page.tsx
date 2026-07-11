'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { supplierCreate, supplierOut, supplierUpdate, type SupplierOut } from '@gym/shared';
import { postJson, patchJson, deleteJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useMe } from '@/lib/auth';
import { EM_DASH } from '@/lib/fmt';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';

interface SupplierFormState {
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const emptyForm: SupplierFormState = { name: '', phone: '', address: '', notes: '' };

const toFormState = (s: SupplierOut): SupplierFormState => ({
  name: s.name,
  phone: s.phone ?? '',
  address: s.address ?? '',
  notes: s.notes ?? '',
});

/** Empty optional strings are omitted so the schema's `.optional()` (not empty-string) is sent. */
const toPayload = (input: SupplierFormState) => ({
  name: input.name,
  phone: input.phone.trim() || undefined,
  address: input.address.trim() || undefined,
  notes: input.notes.trim() || undefined,
});

export default function SuppliersPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierOut | null>(null);
  const [form, setForm] = useState<SupplierFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<SupplierOut | null>(null);

  // Reset to page 0 whenever the (debounced) search term changes — adjusted during render
  // per React's "you might not need an effect" guidance, not in a useEffect.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('suppliers', supplierOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    search: search || undefined,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] });

  const createSupplier = useMutation({
    mutationFn: (input: SupplierFormState) =>
      postJson<{ data: unknown }>('/suppliers', supplierCreate.parse(toPayload(input))),
    onSuccess: async () => {
      notify('Supplier added');
      setFormOpen(false);
      await invalidate();
    },
  });

  const updateSupplier = useMutation({
    mutationFn: (vars: { id: string; input: SupplierFormState }) =>
      patchJson<{ data: unknown }>(`/suppliers/${vars.id}`, supplierUpdate.parse(toPayload(vars.input))),
    onSuccess: async () => {
      notify('Supplier updated');
      setFormOpen(false);
      setEditTarget(null);
      await invalidate();
    },
  });

  const deleteSupplier = useMutation({
    mutationFn: (id: string) => deleteJson(`/suppliers/${id}`),
    onSuccess: async () => {
      notify('Supplier deleted');
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

  const openEdit = (row: SupplierOut) => {
    setEditTarget(row);
    setForm(toFormState(row));
    setFormOpen(true);
  };

  const columns: GridColDef<SupplierOut>[] = [
    { field: 'name', headerName: 'Supplier', flex: 1, minWidth: 160 },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 140,
      valueGetter: (_value, row) => row.phone ?? EM_DASH,
    },
    {
      field: 'address',
      headerName: 'Address',
      flex: 1,
      minWidth: 180,
      valueGetter: (_value, row) => row.address ?? EM_DASH,
    },
    {
      field: 'notes',
      headerName: 'Notes',
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => row.notes ?? EM_DASH,
    },
    ...(isAdmin
      ? [
          {
            field: 'actions',
            headerName: '',
            width: 88,
            sortable: false,
            renderCell: (params) => (
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Edit supplier">
                  <IconButton size="small" aria-label="Edit supplier" onClick={() => openEdit(params.row)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete supplier">
                  <IconButton size="small" aria-label="Delete supplier" onClick={() => setDeleteTarget(params.row)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ),
          } satisfies GridColDef<SupplierOut>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        action={
          isAdmin && (
            <Button variant="contained" onClick={openCreate}>
              Add supplier
            </Button>
          )
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          label="Search suppliers"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ maxWidth: 320, width: '100%' }}
        />
      </Box>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No suppliers yet — add the first one"
          actionLabel={isAdmin ? 'Add supplier' : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <DataTable<SupplierOut>
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
        title={editTarget ? 'Edit supplier' : 'Add supplier'}
        submitLabel={editTarget ? 'Save' : 'Add supplier'}
        pending={createSupplier.isPending || updateSupplier.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={async () => {
          if (editTarget) {
            await updateSupplier.mutateAsync({ id: editTarget._id, input: form });
          } else {
            await createSupplier.mutateAsync(form);
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
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              error={Boolean(fieldError('phone'))}
              helperText={fieldError('phone')}
              fullWidth
            />
            <TextField
              label="Address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              error={Boolean(fieldError('address'))}
              helperText={fieldError('address')}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              error={Boolean(fieldError('notes'))}
              helperText={fieldError('notes')}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete supplier"
        body={`Delete "${deleteTarget?.name ?? ''}"? Removes it from lists; its history stays on the ledger.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteSupplier.mutateAsync(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
