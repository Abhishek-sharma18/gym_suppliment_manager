'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import RemoveOutlinedIcon from '@mui/icons-material/RemoveOutlined';
import { saleReturnCreate, type SaleOut, type ProductOut } from '@gym/shared';
import { postJson } from '@/lib/api';
import { EM_DASH, qtyFmt } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { FormDialog } from './FormDialog';
import { useNotify } from './SnackbarProvider';

export interface ReturnableLine {
  productId: string;
  name: string;
  soldQty: number;
  alreadyReturned: number;
  remaining: number;
}

/** Sold qty minus already-returned qty (across every prior returns[] entry), per product. */
export function returnableLines(sale: SaleOut, productMap: Map<string, ProductOut>): ReturnableLine[] {
  const sold = new Map<string, number>();
  for (const line of sale.items) {
    sold.set(line.productId, (sold.get(line.productId) ?? 0) + line.qty);
  }
  const returned = new Map<string, number>();
  for (const r of sale.returns) {
    for (const line of r.items) {
      returned.set(line.productId, (returned.get(line.productId) ?? 0) + line.qty);
    }
  }
  const lines: ReturnableLine[] = [];
  for (const [productId, soldQty] of sold) {
    const alreadyReturned = returned.get(productId) ?? 0;
    const remaining = soldQty - alreadyReturned;
    if (remaining > 0) {
      lines.push({
        productId,
        name: productMap.get(productId)?.name ?? EM_DASH,
        soldQty,
        alreadyReturned,
        remaining,
      });
    }
  }
  return lines;
}

export interface ReturnDialogProps {
  open: boolean;
  sale: SaleOut;
  productMap: Map<string, ProductOut>;
  onClose: () => void;
}

/**
 * Admin-only "Return items" flow. One row per product still returnable on this sale (sold
 * minus already-returned, summed across every prior returns[] entry), a +/- stepper capped
 * at that remaining qty, and one refundNote for the whole return. OVER_RETURN/DUPLICATE_LINES
 * surface verbatim via FormDialog's Alert — the per-row cap makes them defensive-only from
 * this UI (they'd only fire on a race with another concurrent return).
 */
export function ReturnDialog({ open, sale, productMap, onClose }: ReturnDialogProps) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const lines = returnableLines(sale, productMap);

  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(lines.map((l) => [l.productId, 0])),
  );
  const [refundNote, setRefundNote] = useState('');

  const setQty = (productId: string, qty: number, cap: number) => {
    setQuantities((q) => ({ ...q, [productId]: Math.max(0, Math.min(cap, qty)) }));
  };

  const hasAnyQty = Object.values(quantities).some((q) => q > 0);

  const recordReturn = useMutation({
    mutationFn: () =>
      postJson<{ data: unknown }>(
        `/sales/${sale._id}/return`,
        saleReturnCreate.parse({
          items: lines
            .filter((l) => (quantities[l.productId] ?? 0) > 0)
            .map((l) => ({ productId: l.productId, qty: quantities[l.productId] })),
          refundNote: refundNote.trim() || undefined,
        }),
      ),
    onSuccess: async () => {
      notify('Return recorded');
      setQuantities(Object.fromEntries(lines.map((l) => [l.productId, 0])));
      setRefundNote('');
      onClose();
      // Stock (restocked), the sale's returns[]/udhaarAmount, and the customer's udhaar
      // balance (if any was reduced) all changed together.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);
    },
  });

  return (
    <FormDialog
      open={open}
      title="Return items"
      submitLabel="Record return"
      pending={recordReturn.isPending}
      submitDisabled={!hasAnyQty}
      onClose={() => {
        if (recordReturn.isPending) return;
        onClose();
      }}
      onSubmit={async () => {
        await recordReturn.mutateAsync();
      }}
    >
      {({ fieldError }) => (
        <Stack spacing={2}>
          {lines.length === 0 ? (
            <Alert severity="info">Everything on this sale has already been returned.</Alert>
          ) : (
            <Stack spacing={1.5}>
              {lines.map((line) => {
                const qty = quantities[line.productId] ?? 0;
                return (
                  <Box key={line.productId}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography>{line.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {qtyFmt(line.remaining, 'unit')} left of {line.soldQty} sold
                          {line.alreadyReturned > 0 ? ` (${line.alreadyReturned} already returned)` : ''}
                        </Typography>
                      </Box>
                      <IconButton
                        aria-label={`Decrease return quantity of ${line.name}`}
                        onClick={() => setQty(line.productId, qty - 1, line.remaining)}
                        disabled={qty <= 0}
                        sx={{ width: 40, height: 40 }}
                      >
                        <RemoveOutlinedIcon fontSize="small" />
                      </IconButton>
                      <Typography sx={{ minWidth: 28, textAlign: 'center', fontFamily: monoFamily }}>
                        {qty}
                      </Typography>
                      <IconButton
                        aria-label={`Increase return quantity of ${line.name}`}
                        onClick={() => setQty(line.productId, qty + 1, line.remaining)}
                        disabled={qty >= line.remaining}
                        sx={{ width: 40, height: 40 }}
                      >
                        <AddOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
          {fieldError('items') && (
            <Typography variant="caption" color="error">
              {fieldError('items')}
            </Typography>
          )}
          <TextField
            label="Refund note"
            value={refundNote}
            onChange={(e) => setRefundNote(e.target.value)}
            error={Boolean(fieldError('refundNote'))}
            helperText={fieldError('refundNote') ?? 'Optional'}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      )}
    </FormDialog>
  );
}
