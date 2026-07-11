'use client';

import Box from '@mui/material/Box';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRowParams,
  type GridValidRowModel,
} from '@mui/x-data-grid';

export interface DataTableProps<T extends GridValidRowModel> {
  rows: T[];
  columns: GridColDef<T>[];
  rowCount: number;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
}

/**
 * Thin server-mode wrapper around @mui/x-data-grid. Dense by default; horizontal scroll
 * kicks in on narrow viewports once column minWidths (set by callers) exceed the container.
 */
export function DataTable<T extends GridValidRowModel & { _id?: string }>({
  rows,
  columns,
  rowCount,
  paginationModel,
  onPaginationModelChange,
  loading,
  onRowClick,
  getRowId,
}: DataTableProps<T>) {
  const resolveRowId = (row: T): string => (getRowId ? getRowId(row) : ((row as { _id: string })._id));

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <DataGrid
        rows={rows as unknown as GridValidRowModel[]}
        columns={columns as unknown as GridColDef[]}
        rowCount={rowCount}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        paginationMode="server"
        pageSizeOptions={[10, 20, 50]}
        loading={loading}
        density="compact"
        disableRowSelectionOnClick
        autoHeight
        getRowId={(row) => resolveRowId(row as T)}
        onRowClick={onRowClick ? (params: GridRowParams) => onRowClick(params.row as T) : undefined}
        sx={{
          minWidth: 0,
          bgcolor: 'background.paper',
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
          ...(onRowClick ? { '& .MuiDataGrid-row': { cursor: 'pointer' } } : {}),
        }}
      />
    </Box>
  );
}
