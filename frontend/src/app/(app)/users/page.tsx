'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { ROLES, userCreate, userOut, userUpdate, type Role, type UserOut } from '@gym/shared';
import { postJson, patchJson, deleteJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useMe } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';

interface CreateFormState {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface EditFormState {
  role: Role;
  isActive: boolean;
  password: string;
}

const emptyCreateForm: CreateFormState = { name: '', email: '', password: '', role: 'staff' };

const toEditFormState = (u: UserOut): EditFormState => ({
  role: u.role,
  isActive: u.isActive,
  password: '',
});

export default function UsersPage() {
  usePageTitle('Users');
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm);
  const [editTarget, setEditTarget] = useState<UserOut | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ role: 'staff', isActive: true, password: '' });
  const [deactivateTarget, setDeactivateTarget] = useState<UserOut | null>(null);

  // Reset to page 0 whenever the (debounced) search term changes — adjusted during render
  // per React's "you might not need an effect" guidance, same convention the other list pages use.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const { rows, total, isLoading, error } = useListQuery('users', userOut, {
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
    search: search || undefined,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const createUser = useMutation({
    mutationFn: (input: CreateFormState) =>
      postJson<{ data: unknown }>('/users', userCreate.parse(input)),
    onSuccess: async () => {
      notify('User added');
      setCreateOpen(false);
      await invalidate();
    },
  });

  const updateUser = useMutation({
    mutationFn: (vars: { id: string; input: EditFormState }) =>
      patchJson<{ data: unknown }>(
        `/users/${vars.id}`,
        userUpdate.parse({
          role: vars.input.role,
          isActive: vars.input.isActive,
          password: vars.input.password.trim() || undefined,
        }),
      ),
    onSuccess: async () => {
      notify('User updated');
      setEditTarget(null);
      await invalidate();
    },
  });

  const deactivateUser = useMutation({
    mutationFn: (id: string) => deleteJson(`/users/${id}`),
    onSuccess: async () => {
      notify('User deactivated');
      await invalidate();
    },
    onError: (err: unknown) => {
      notify(err instanceof ApiClientError ? err.message : 'Deactivate failed', 'error');
    },
  });

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setCreateOpen(true);
  };

  const openEdit = (row: UserOut) => {
    setEditTarget(row);
    setEditForm(toEditFormState(row));
  };

  // Users is a fully admin-only API (backend requireRole('admin') on the whole router): a
  // staff member navigating here directly gets a 403 on every request above. Render that as
  // a plain-language message instead of the empty-state/crash a raw ApiClientError would
  // otherwise produce — the nav already hides this link from staff, so this only fires on
  // direct URL entry. Same pattern as the Expenses page.
  if (error instanceof ApiClientError && error.status === 403) {
    return (
      <>
        <PageHeader title="Users" />
        <Alert severity="warning">{error.message || "You don't have permission to view users."}</Alert>
      </>
    );
  }

  const columns: GridColDef<UserOut>[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
    {
      field: 'role',
      headerName: 'Role',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.row.role}
          size="small"
          variant={params.row.role === 'admin' ? 'outlined' : 'filled'}
        />
      ),
    },
    {
      field: 'isActive',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.row.isActive ? 'Active' : 'Inactive'}
          size="small"
          color={params.row.isActive ? 'success' : 'default'}
          variant={params.row.isActive ? 'filled' : 'outlined'}
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 96,
      sortable: false,
      renderCell: (params) => {
        const isSelf = params.row._id === me?._id;
        return (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Edit user">
              <IconButton size="small" aria-label="Edit user" onClick={() => openEdit(params.row)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={
                isSelf
                  ? 'You cannot deactivate your own account'
                  : !params.row.isActive
                    ? 'Already inactive'
                    : 'Deactivate user'
              }
            >
              {/* Tooltip needs a non-disabled child to still catch hover, so this wraps the
                  IconButton in a span whenever the button itself is disabled. */}
              <span>
                <IconButton
                  size="small"
                  aria-label="Deactivate user"
                  disabled={isSelf || !params.row.isActive}
                  onClick={() => setDeactivateTarget(params.row)}
                >
                  <PersonOffOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        action={
          <Button variant="contained" onClick={openCreate}>
            Add user
          </Button>
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          label="Search users"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ maxWidth: 320, width: '100%' }}
        />
      </Box>

      {!isLoading && rows.length === 0 ? (
        <EmptyState message="No users yet — add the first one" actionLabel="Add user" onAction={openCreate} />
      ) : (
        <DataTable<UserOut>
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
        title="Add user"
        submitLabel="Add user"
        pending={createUser.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={async () => {
          await createUser.mutateAsync(createForm);
        }}
      >
        {({ fieldError }) => (
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              error={Boolean(fieldError('name'))}
              helperText={fieldError('name')}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              error={Boolean(fieldError('email'))}
              helperText={fieldError('email')}
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              error={Boolean(fieldError('password'))}
              helperText={fieldError('password') ?? 'At least 8 characters'}
              required
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as Role }))}
              error={Boolean(fieldError('role'))}
              helperText={fieldError('role')}
              required
              fullWidth
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
      </FormDialog>

      <FormDialog
        open={editTarget !== null}
        title={editTarget ? `Edit user: ${editTarget.name}` : 'Edit user'}
        submitLabel="Save"
        pending={updateUser.isPending}
        onClose={() => setEditTarget(null)}
        onSubmit={async () => {
          if (!editTarget) return;
          await updateUser.mutateAsync({ id: editTarget._id, input: editForm });
        }}
      >
        {({ fieldError }) => (
          <Stack spacing={2}>
            <TextField
              select
              label="Role"
              value={editForm.role}
              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}
              error={Boolean(fieldError('role'))}
              helperText={fieldError('role')}
              required
              fullWidth
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              }
              label="Active"
            />
            <TextField
              label="New password"
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              error={Boolean(fieldError('password'))}
              helperText={fieldError('password') ?? 'Leave blank to keep the current password'}
              fullWidth
            />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate user"
        body={`Deactivate "${deactivateTarget?.name ?? ''}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        danger
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await deactivateUser.mutateAsync(deactivateTarget._id);
          setDeactivateTarget(null);
        }}
      />
    </>
  );
}
