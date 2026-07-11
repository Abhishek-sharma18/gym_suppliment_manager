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
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { ZodError } from 'zod';
import { ApiClientError } from '@/lib/api';
import { zodErrorToFields } from '@/lib/zodFields';

export interface FormDialogRenderProps {
  /** Per-field helper text from the last validation failure (client ZodError or server ApiClientError.fields), keyed by field name. */
  fieldError: (name: string) => string | undefined;
}

interface FormErrorState {
  message: string;
  fields?: Record<string, string>;
}

export interface FormDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  submitLabel?: string;
  pending?: boolean;
  /** Dialog width breakpoint (default 'sm'). Wider forms — e.g. multi-line row editors — can request 'md'. */
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Goes edge-to-edge below the 'sm' breakpoint instead of a small centered modal — for forms too tall/wide for a phone screen. */
  fullScreenOnMobile?: boolean;
  children: (helpers: FormDialogRenderProps) => ReactNode;
}

/**
 * Modal form shell shared by every create/edit dialog. Submits on Enter (native <form>
 * submit). Catches ApiClientError AND ZodError thrown by onSubmit — both surface a
 * message in the Alert and per-field text via the fieldError(name) render prop, so
 * client-side schema.parse() failures behave exactly like server validation errors.
 */
export function FormDialog({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  pending,
  maxWidth = 'sm',
  fullScreenOnMobile = false,
  children,
}: FormDialogProps) {
  const [error, setError] = useState<FormErrorState | null>(null);
  const theme = useTheme();
  const isMobileViewport = useMediaQuery(theme.breakpoints.down('sm'));
  const fullScreen = fullScreenOnMobile && isMobileViewport;

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
      if (err instanceof ZodError) {
        setError({ message: 'Please fix the highlighted fields', fields: zodErrorToFields(err) });
      } else if (err instanceof ApiClientError) {
        setError({ message: err.message, fields: err.fields });
      } else {
        throw err;
      }
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth={maxWidth} fullScreen={fullScreen}>
      <DialogTitle>{title}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} sx={fullScreen ? { display: 'flex', flexDirection: 'column', height: '100%' } : undefined}>
        <DialogContent sx={fullScreen ? { flexGrow: 1 } : undefined}>
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
