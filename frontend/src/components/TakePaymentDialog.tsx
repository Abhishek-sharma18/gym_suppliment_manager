'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Stack from '@mui/material/Stack';
import { paymentCreate, PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { postJson } from '@/lib/api';
import { inr } from '@/lib/fmt';
import { FormDialog } from './FormDialog';
import { useNotify } from './SnackbarProvider';

export interface TakePaymentDialogProps {
  open: boolean;
  customerId: string;
  owed: number;
  onClose: () => void;
}

/**
 * Counter-side payment collection, open to both roles. Client-validates with the shared
 * paymentCreate schema; the server's OVERPAY 400 (amount > current udhaarBalance) surfaces
 * through FormDialog's Alert exactly like any other ApiClientError.
 */
export function TakePaymentDialog({ open, customerId, owed, onClose }: TakePaymentDialogProps) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setAmount('');
    setMode('CASH');
    setNotes('');
  };

  const takePayment = useMutation({
    mutationFn: () =>
      postJson<{ data: unknown }>(
        '/payments',
        paymentCreate.parse({
          customerId,
          amount: Number(amount),
          date: new Date().toISOString(),
          paymentMode: mode,
          notes: notes.trim() || undefined,
        }),
      ),
    onSuccess: async () => {
      notify('Payment recorded');
      reset();
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
      ]);
    },
  });

  return (
    <FormDialog
      open={open}
      title="Take payment"
      submitLabel="Record payment"
      pending={takePayment.isPending}
      onClose={() => {
        if (takePayment.isPending) return;
        reset();
        onClose();
      }}
      onSubmit={async () => {
        await takePayment.mutateAsync();
      }}
    >
      {({ fieldError }) => (
        <Stack spacing={2}>
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={Boolean(fieldError('amount'))}
            helperText={fieldError('amount') ?? `Owed ${inr(owed)}`}
            slotProps={{ htmlInput: { min: 0, step: 'any' } }}
            autoFocus
            required
            fullWidth
          />
          <ToggleButtonGroup
            value={mode}
            exclusive
            fullWidth
            onChange={(_e, value: PaymentMode | null) => {
              if (value) setMode(value);
            }}
          >
            {PAYMENT_MODES.map((m) => (
              <ToggleButton key={m} value={m}>
                {m}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={Boolean(fieldError('notes'))}
            helperText={fieldError('notes')}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      )}
    </FormDialog>
  );
}
