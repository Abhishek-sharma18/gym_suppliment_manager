'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { movementOut, type ItemKind, type MovementOut } from '@gym/shared';
import { useListQuery } from '@/lib/useListQuery';
import { dateFmt, enumLabel, qtyFmt, EM_DASH } from '@/lib/fmt';
import { monoFamily, KHATA } from '@/lib/theme';
import { DataTable } from './DataTable';
import { EmptyState } from './EmptyState';

export interface StockHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  itemKind: ItemKind;
  itemId: string;
  name: string;
  unit: string;
}

/**
 * Read-only stock ledger for one item (a raw material or a finished product) — answers
 * "why does the stock figure show X when I expected Y" by listing every movement that
 * touched this item's quantity, newest first. Reused by Materials (RAW) and, in Task 4,
 * Products (FINISHED).
 */
export function StockHistoryDialog({ open, onClose, itemKind, itemId, name, unit }: StockHistoryDialogProps) {
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });

  const { rows, total, isLoading } = useListQuery('movements', movementOut, {
    itemKind,
    itemId,
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
  });

  const columns: GridColDef<MovementOut>[] = [
    {
      field: 'createdAt',
      headerName: 'Date',
      width: 110,
      valueGetter: (_value, row) => dateFmt(row.createdAt),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 160,
      renderCell: (params) => <Chip label={enumLabel(params.row.type)} size="small" variant="outlined" />,
    },
    {
      field: 'qty',
      headerName: 'Quantity',
      width: 130,
      renderCell: (params) => (
        <Box
          component="span"
          sx={{ fontFamily: monoFamily, color: params.row.qty < 0 ? KHATA.red : 'inherit' }}
        >
          {params.row.qty > 0 ? '+' : ''}
          {qtyFmt(params.row.qty, unit)}
        </Box>
      ),
    },
    {
      field: 'note',
      headerName: 'Note',
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => row.note ?? EM_DASH,
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{name} — stock history</DialogTitle>
      <DialogContent>
        {!isLoading && rows.length === 0 ? (
          <EmptyState message="No stock movements yet" />
        ) : (
          <DataTable<MovementOut>
            rows={rows}
            columns={columns}
            rowCount={total}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            loading={isLoading}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
