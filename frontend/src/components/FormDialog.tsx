'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { ApiClientError } from '@/lib/api';

export interface FormDialogRenderProps {
  /** Per-field helper text from the last ApiClientError.fields, keyed by field name. */
  fieldError: (name: string) => string | undefined;
}

export interface FormDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  submitLabel?: string;
  pending?: boolean;
  children: (helpers: FormDialogRenderProps) => ReactNode;
}

/**
 * Modal form shell shared by every create/edit dialog. Submits on Enter (native <form>
 * submit). Catches ApiClientError thrown by onSubmit: surfaces .message in an Alert and
 * exposes .fields to the caller's fields via the fieldError(name) render prop.
 */
export function FormDialog({ open, title, onClose, onSubmit, submitLabel = 'Save', pending, children }: FormDialogProps) {
  const [error, setError] = useState<ApiClientError | null>(null);

  const fieldError = (name: string): string | undefined => error?.fields?.[name];

  const handleClose = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err);
      } else {
        throw err;
      }
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error.message}</Alert>}
            {children({ fieldError })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
