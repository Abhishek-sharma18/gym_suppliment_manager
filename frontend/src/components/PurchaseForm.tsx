'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import InputAdornment from '@mui/material/InputAdornment';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  purchaseCreate,
  supplierOut,
  materialOut,
  PAYMENT_MODES,
  type SupplierOut,
  type MaterialOut,
  type PaymentMode,
} from '@gym/shared';
import { postJson } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { localDateValue } from '@/lib/fmt';
import { FormDialog } from './FormDialog';
import { MoneyText } from './MoneyText';
import { useNotify } from './SnackbarProvider';

interface PurchaseLineState {
  materialId: string;
  qtyBuyUnit: string;
  costPerBuyUnit: string;
}

const emptyLine = (): PurchaseLineState => ({ materialId: '', qtyBuyUnit: '', costPerBuyUnit: '' });
// Local day, not the UTC day — toISOString() defaults to YESTERDAY before 05:30 IST.
const todayValue = (): string => localDateValue(new Date());

export interface PurchaseFormProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "Record purchase" — full-screen-on-mobile intake open to both roles: they type costs here
 * even though stored reads later strip cost fields for staff (see purchaseOut's
 * costPerBuyUnit/lineTotal/totalAmount — admin-only on GET, present on this form because the
 * user is the one entering them). Supplier + date + payment mode up top, one row per material
 * line (Autocomplete + qty in buyUnit with a unit-suffix adornment + cost per buyUnit), a
 * running total computed client-side in the khata double-rule style, add/remove rows.
 */
export function PurchaseForm({ open, onClose }: PurchaseFormProps) {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { rows: suppliers, isLoading: suppliersLoading } = useListQuery('suppliers', supplierOut, { limit: 100 });
  const { rows: materials, isLoading: materialsLoading } = useListQuery('materials', materialOut, { limit: 100 });

  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(todayValue());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<PurchaseLineState[]>([emptyLine()]);

  const reset = () => {
    setSupplierId('');
    setDate(todayValue());
    setPaymentMode('CASH');
    setInvoiceNo('');
    setLines([emptyLine()]);
  };

  const updateLine = (index: number, patch: Partial<PurchaseLineState>) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const removeLine = (index: number) => setLines((ls) => ls.filter((_, i) => i !== index));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);

  const total = lines.reduce((sum, l) => {
    const qty = Number(l.qtyBuyUnit) || 0;
    const cost = Number(l.costPerBuyUnit) || 0;
    return sum + qty * cost;
  }, 0);

  const recordPurchase = useMutation({
    mutationFn: () =>
      postJson<{ data: unknown }>(
        '/purchases',
        purchaseCreate.parse({
          supplierId,
          invoiceNo: invoiceNo.trim() || undefined,
          date,
          paymentMode,
          items: lines.map((l) => ({
            materialId: l.materialId,
            qtyBuyUnit: Number(l.qtyBuyUnit),
            costPerBuyUnit: Number(l.costPerBuyUnit),
          })),
        }),
      ),
    onSuccess: async () => {
      notify('Purchase recorded');
      reset();
      onClose();
      // Stock and avgCost on the affected materials changed alongside the purchase itself.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['materials'] }),
      ]);
    },
  });

  const selectedSupplier = suppliers.find((s) => s._id === supplierId) ?? null;

  return (
    <FormDialog
      open={open}
      title="Record purchase"
      submitLabel="Record purchase"
      maxWidth="md"
      fullScreenOnMobile
      pending={recordPurchase.isPending}
      onClose={() => {
        if (recordPurchase.isPending) return;
        reset();
        onClose();
      }}
      onSubmit={async () => {
        await recordPurchase.mutateAsync();
      }}
    >
      {({ fieldError }) => (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete<SupplierOut>
              options={suppliers}
              loading={suppliersLoading}
              value={selectedSupplier}
              getOptionLabel={(s) => s.name}
              isOptionEqualToValue={(a, b) => a._id === b._id}
              onChange={(_e, v) => setSupplierId(v?._id ?? '')}
              sx={{ flex: 1 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Supplier"
                  placeholder="Choose a supplier"
                  error={Boolean(fieldError('supplierId'))}
                  helperText={fieldError('supplierId')}
                  autoFocus
                  required
                />
              )}
            />
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={Boolean(fieldError('date'))}
              helperText={fieldError('date')}
              slotProps={{ inputLabel: { shrink: true } }}
              required
              sx={{ minWidth: 170 }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField
              label="Invoice no."
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              error={Boolean(fieldError('invoiceNo'))}
              helperText={fieldError('invoiceNo') ?? 'Optional'}
              fullWidth
            />
            <ToggleButtonGroup
              value={paymentMode}
              exclusive
              onChange={(_e, v: PaymentMode | null) => {
                if (v) setPaymentMode(v);
              }}
            >
              {PAYMENT_MODES.map((m) => (
                <ToggleButton key={m} value={m}>
                  {m}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Purchase lines
            </Typography>
            {fieldError('items') && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                {fieldError('items')}
              </Typography>
            )}
            <Stack spacing={2}>
              {lines.map((line, index) => {
                const material = materials.find((m) => m._id === line.materialId) ?? null;
                const materialError = fieldError(`items.${index}.materialId`);
                const qtyError = fieldError(`items.${index}.qtyBuyUnit`);
                const costError = fieldError(`items.${index}.costPerBuyUnit`);
                const lineTotal = (Number(line.qtyBuyUnit) || 0) * (Number(line.costPerBuyUnit) || 0);
                return (
                  <Box key={index}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
                      <Autocomplete<MaterialOut>
                        options={materials}
                        loading={materialsLoading}
                        value={material}
                        getOptionLabel={(m) => m.name}
                        isOptionEqualToValue={(a, b) => a._id === b._id}
                        onChange={(_e, v) => updateLine(index, { materialId: v?._id ?? '' })}
                        sx={{ flex: 1, minWidth: { sm: 180 } }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Material"
                            placeholder="Choose a material"
                            error={Boolean(materialError)}
                            helperText={materialError}
                          />
                        )}
                      />
                      <TextField
                        label="Quantity"
                        type="number"
                        value={line.qtyBuyUnit}
                        onChange={(e) => updateLine(index, { qtyBuyUnit: e.target.value })}
                        error={Boolean(qtyError)}
                        helperText={qtyError}
                        slotProps={{
                          htmlInput: { min: 0, step: 'any' },
                          input: material
                            ? { endAdornment: <InputAdornment position="end">{material.buyUnit}</InputAdornment> }
                            : undefined,
                        }}
                        sx={{ width: { xs: '100%', sm: 160 } }}
                      />
                      <TextField
                        label="Cost / buy unit"
                        type="number"
                        value={line.costPerBuyUnit}
                        onChange={(e) => updateLine(index, { costPerBuyUnit: e.target.value })}
                        error={Boolean(costError)}
                        helperText={costError}
                        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                        sx={{ width: { xs: '100%', sm: 160 } }}
                      />
                      <IconButton
                        aria-label="Remove line"
                        onClick={() => removeLine(index)}
                        sx={{ mt: { sm: 0.5 }, alignSelf: { xs: 'flex-end', sm: 'auto' } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}>
                      Line total: <MoneyText value={lineTotal} />
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
            {lines.length === 0 && <Alert severity="info" sx={{ mt: 1.5 }}>Add at least one purchase line.</Alert>}
            <Button startIcon={<AddOutlinedIcon />} onClick={addLine} sx={{ mt: 1.5 }}>
              Add line
            </Button>
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Total
            </Typography>
            <MoneyText value={total} variant="total" />
          </Box>
        </Stack>
      )}
    </FormDialog>
  );
}
