'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { KHATA } from '@/lib/theme';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Destructive actions (delete, void, ...) render the confirm button in khata red. */
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } catch {
      // Swallowed: callers already surface errors via their own onError snackbars.
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={pending}
          sx={
            danger
              ? { bgcolor: KHATA.red, '&:hover': { bgcolor: KHATA.redDark } }
              : undefined
          }
        >
          {pending ? 'Please wait…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
