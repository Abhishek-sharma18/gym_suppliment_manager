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
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { customerCreate, customerOut, customerUpdate, type CustomerOut } from '@gym/shared';
import { postJson, patchJson, deleteJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useMe } from '@/lib/auth';
import { EM_DASH } from '@/lib/fmt';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CustomerLedgerDrawer } from '@/components/CustomerLedgerDrawer';
import { useNotify } from '@/components/SnackbarProvider';

interface CustomerFormState {
  name: string;
  phone: string;
}

const emptyForm: CustomerFormState = { name: '', phone: '' };

const toFormState = (c: CustomerOut): CustomerFormState => ({
  name: c.name,
  phone: c.phone ?? '',
});

/** Empty optional strings are omitted so the schema's `.optional()` (not empty-string) is sent. */
const toPayload = (input: CustomerFormState) => ({
  name: input.name,
  phone: input.phone.trim() || undefined,
});

export default function CustomersPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerOut | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CustomerOut | null>(null);
  const [ledgerCustomerId, setLedgerCustomerId] = useState<string | null>(null);

  // Reset to page 0 whenever the (debounced) search term changes — adjusted during render
  // per React's "you might not need an effect" guidance, not in a useEffect.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading } = useListQuery('customers', customerOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    search: search || undefined,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] });

  const createCustomer = useMutation({
    mutationFn: (input: CustomerFormState) =>
      postJson<{ data: unknown }>('/customers', customerCreate.parse(toPayload(input))),
    onSuccess: async () => {
      notify('Customer added');
      setFormOpen(false);
      await invalidate();
    },
  });

  const updateCustomer = useMutation({
    mutationFn: (vars: { id: string; input: CustomerFormState }) =>
      patchJson<{ data: unknown }>(`/customers/${vars.id}`, customerUpdate.parse(toPayload(vars.input))),
    onSuccess: async () => {
      notify('Customer updated');
      setFormOpen(false);
      setEditTarget(null);
      await invalidate();
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: string) => deleteJson(`/customers/${id}`),
    onSuccess: async () => {
      notify('Customer deleted');
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

  const openEdit = (row: CustomerOut) => {
    setEditTarget(row);
    setForm(toFormState(row));
    setFormOpen(true);
  };

  const columns: GridColDef<CustomerOut>[] = [
    { field: 'name', headerName: 'Customer', flex: 1, minWidth: 160 },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 140,
      valueGetter: (_value, row) => row.phone ?? EM_DASH,
    },
    {
      field: 'udhaarBalance',
      headerName: 'Owed',
      width: 150,
      renderCell: (params) => (
        <MoneyText
          value={params.row.udhaarBalance}
          variant="total"
          udhaar={params.row.udhaarBalance > 0}
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: isAdmin ? 260 : 120,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<MenuBookOutlinedIcon fontSize="small" />}
            onClick={() => setLedgerCustomerId(params.row._id)}
          >
            Khata
          </Button>
          {isAdmin && (
            <>
              <Tooltip title="Edit customer">
                <IconButton size="small" aria-label="Edit customer" onClick={() => openEdit(params.row)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete customer">
                <IconButton size="small" aria-label="Delete customer" onClick={() => setDeleteTarget(params.row)}>
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
        title="Customers"
        action={
          isAdmin && (
            <Button variant="contained" onClick={openCreate}>
              Add customer
            </Button>
          )
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          label="Search customers"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ maxWidth: 320, width: '100%' }}
        />
      </Box>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          message="No customers yet — add the first one"
          actionLabel={isAdmin ? 'Add customer' : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <DataTable<CustomerOut>
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
        title={editTarget ? 'Edit customer' : 'Add customer'}
        submitLabel={editTarget ? 'Save' : 'Add customer'}
        pending={createCustomer.isPending || updateCustomer.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={async () => {
          if (editTarget) {
            await updateCustomer.mutateAsync({ id: editTarget._id, input: form });
          } else {
            await createCustomer.mutateAsync(form);
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
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete customer"
        body={`Delete "${deleteTarget?.name ?? ''}"? Removes them from lists; their sales and payment history stays on the ledger.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteCustomer.mutateAsync(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />

      {ledgerCustomerId && (
        <CustomerLedgerDrawer customerId={ledgerCustomerId} onClose={() => setLedgerCustomerId(null)} />
      )}
    </>
  );
}
