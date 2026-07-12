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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import {
  EXPENSE_CATEGORIES, expenseCreate, expenseOut, expenseUpdate, type ExpenseCategory, type ExpenseOut,
} from '@gym/shared';
import { postJson, patchJson, deleteJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useExpenseRangeTotal } from '@/lib/useExpenseRangeTotal';
import { localDateValue, dateFmt, enumLabel, EM_DASH } from '@/lib/fmt';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';

interface ExpenseFormState {
  category: ExpenseCategory;
  amount: string;
  date: string;
  notes: string;
}

const emptyForm = (): ExpenseFormState => ({
  category: 'OTHER',
  amount: '',
  date: localDateValue(new Date()),
  notes: '',
});

const toFormState = (e: ExpenseOut): ExpenseFormState => ({
  category: e.category,
  amount: String(e.amount),
  date: localDateValue(e.date),
  notes: e.notes ?? '',
});

const toPayload = (input: ExpenseFormState) => ({
  category: input.category,
  amount: Number(input.amount),
  date: input.date,
  notes: input.notes.trim() || undefined,
});

export default function ExpensesPage() {
  usePageTitle('Expenses');
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseOut | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ExpenseOut | null>(null);

  // Reset to page 0 whenever a filter changes — adjusted during render per React's "you
  // might not need an effect" guidance, same convention the other list pages use.
  const filterKey = `${categoryFilter}|${fromDate}|${toDate}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  const filterParams = {
    category: categoryFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  };
  const anyFilterActive = Boolean(categoryFilter || fromDate || toDate);

  const { rows, total, isLoading, error } = useListQuery('expenses', expenseOut, {
    ...filterParams,
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
  });

  // Visible-range total: no aggregate endpoint exists, so this loop-fetches every matching
  // page (up to the hook's cap) and reports fetched-vs-total so a partial sum is labelled
  // honestly instead of rendering as if it covered the whole range.
  const { data: rangeTotal } = useExpenseRangeTotal(filterParams);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expenses'] });

  const createExpense = useMutation({
    mutationFn: (input: ExpenseFormState) =>
      postJson<{ data: unknown }>('/expenses', expenseCreate.parse(toPayload(input))),
    onSuccess: async () => {
      notify('Expense added');
      setFormOpen(false);
      await invalidate();
    },
  });

  const updateExpense = useMutation({
    mutationFn: (vars: { id: string; input: ExpenseFormState }) =>
      patchJson<{ data: unknown }>(`/expenses/${vars.id}`, expenseUpdate.parse(toPayload(vars.input))),
    onSuccess: async () => {
      notify('Expense updated');
      setFormOpen(false);
      setEditTarget(null);
      await invalidate();
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (id: string) => deleteJson(`/expenses/${id}`),
    onSuccess: async () => {
      notify('Expense deleted');
      await invalidate();
    },
    onError: (err: unknown) => {
      notify(err instanceof ApiClientError ? err.message : 'Delete failed', 'error');
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row: ExpenseOut) => {
    setEditTarget(row);
    setForm(toFormState(row));
    setFormOpen(true);
  };

  // Expenses is a fully admin-only API (backend requireRole('admin') on the whole router):
  // a staff member navigating here directly gets a 403 on every request above. Render that
  // as a plain-language message instead of the empty-state/crash a raw ApiClientError would
  // otherwise produce — the nav already hides this link from staff, so this only fires on
  // direct URL entry.
  if (error instanceof ApiClientError && error.status === 403) {
    return (
      <>
        <PageHeader title="Expenses" />
        <Alert severity="warning">{error.message || "You don't have permission to view expenses."}</Alert>
      </>
    );
  }

  const columns: GridColDef<ExpenseOut>[] = [
    { field: 'date', headerName: 'Date', width: 110, valueGetter: (_value, row) => dateFmt(row.date) },
    {
      field: 'category',
      headerName: 'Category',
      width: 140,
      renderCell: (params) => <Chip label={enumLabel(params.row.category)} size="small" variant="outlined" />,
    },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 130,
      renderCell: (params) => <MoneyText value={params.row.amount} />,
    },
    { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 160, valueGetter: (_value, row) => row.notes ?? EM_DASH },
    {
      field: 'actions',
      headerName: '',
      width: 96,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Edit expense">
            <IconButton size="small" aria-label="Edit expense" onClick={() => openEdit(params.row)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete expense">
            <IconButton size="small" aria-label="Delete expense" onClick={() => setDeleteTarget(params.row)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        action={
          <Button variant="contained" onClick={openCreate}>
            Add expense
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | '')}
          size="small"
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">All categories</MenuItem>
          {EXPENSE_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {enumLabel(c)}
            </MenuItem>
          ))}
        </TextField>
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
          message={anyFilterActive ? 'No expenses match these filters' : 'No expenses yet — add the first one'}
          actionLabel={anyFilterActive ? undefined : 'Add expense'}
          onAction={anyFilterActive ? undefined : openCreate}
        />
      ) : (
        <>
          <DataTable<ExpenseOut>
            rows={rows}
            columns={columns}
            rowCount={total}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            loading={isLoading}
          />
          {rangeTotal && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1, mt: 2 }}>
              {rangeTotal.fetched < rangeTotal.total ? (
                <Box component="span" sx={{ color: 'warning.main' }}>
                  Total of first {rangeTotal.fetched} of {rangeTotal.total} expenses
                </Box>
              ) : (
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  Total for this range
                </Box>
              )}
              <MoneyText value={rangeTotal.sum} variant="total" />
            </Box>
          )}
        </>
      )}

      <FormDialog
        open={formOpen}
        title={editTarget ? 'Edit expense' : 'Add expense'}
        submitLabel={editTarget ? 'Save' : 'Add expense'}
        pending={createExpense.isPending || updateExpense.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={async () => {
          if (editTarget) {
            await updateExpense.mutateAsync({ id: editTarget._id, input: form });
          } else {
            await createExpense.mutateAsync(form);
          }
        }}
      >
        {({ fieldError }) => (
          <Stack spacing={2}>
            <TextField
              select
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              error={Boolean(fieldError('category'))}
              helperText={fieldError('category')}
              required
              fullWidth
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {enumLabel(c)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount"
              type="number"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              error={Boolean(fieldError('amount'))}
              helperText={fieldError('amount')}
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              error={Boolean(fieldError('date'))}
              helperText={fieldError('date')}
              slotProps={{ inputLabel: { shrink: true } }}
              required
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
        title="Delete expense"
        body="This permanently deletes the expense and changes past profit reports."
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteExpense.mutateAsync(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
