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
import InputAdornment from '@mui/material/InputAdornment';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import RemoveOutlinedIcon from '@mui/icons-material/RemoveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  productionCreate,
  productOut,
  materialOut,
  type ProductOut,
  type MaterialOut,
} from '@gym/shared';
import { postJson } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { qtyFmt, localDateValue, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { FormDialog } from './FormDialog';
import { ServerSearchSelect } from './ServerSearchSelect';
import { useNotify } from './SnackbarProvider';

interface ConsumptionRowState {
  materialId: string;
  actualQty: string;
  wastageQty: string;
  /** Rows seeded from the product's recipe aren't removable and always show a read-only planned qty. */
  fromBom: boolean;
}

// Local day, not the UTC day — toISOString() defaults to YESTERDAY before 05:30 IST.
const todayValue = (): string => localDateValue(new Date());
const round2 = (n: number): number => Math.round(n * 100) / 100;
const emptyExtraRow = (): ConsumptionRowState => ({ materialId: '', actualQty: '', wastageQty: '0', fromBom: false });

export interface ProductionFormProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "New batch" — pick a product (only those with a recipe), size the batch, and the
 * consumption grid prefills one row per BoM line (plannedQty = qtyPerUnit * qtyProduced,
 * read-only; actualQty defaults to planned; wastageQty defaults to 0 — both editable).
 * Changing the product OR the qty re-seeds the BoM-derived rows from scratch; any extra,
 * non-recipe materials the user added stay put. INSUFFICIENT_STOCK and other API errors
 * surface verbatim via FormDialog's Alert.
 */
export function ProductionForm({ open, onClose }: ProductionFormProps) {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { rows: materials, isLoading: materialsLoading } = useListQuery('materials', materialOut, { limit: 100 });

  // Full object, not just the id: with server-side search the current results page may no
  // longer contain the selection, so it can't be re-derived from the options list.
  const [selectedProduct, setSelectedProduct] = useState<ProductOut | null>(null);
  const [qtyProduced, setQtyProduced] = useState('1');
  const [date, setDate] = useState(todayValue());
  const [expiryDate, setExpiryDate] = useState('');
  const [rows, setRows] = useState<ConsumptionRowState[]>([]);

  const initialPrefillKey = '|1';
  const [prevPrefillKey, setPrevPrefillKey] = useState(initialPrefillKey);

  const reset = () => {
    setSelectedProduct(null);
    setQtyProduced('1');
    setDate(todayValue());
    setExpiryDate('');
    setRows([]);
    setPrevPrefillKey(initialPrefillKey);
  };

  const qtyNum = Number(qtyProduced) || 0;
  const bomMap = new Map((selectedProduct?.bom ?? []).map((line) => [line.materialId, line.qtyPerUnit]));

  // Re-seed the BoM-derived rows whenever the product or the batch size changes — this is
  // the "on product/qty change PREFILL" rule. Adjusted during render (not a useEffect), same
  // convention as the pagination-reset-on-filter-change pattern used by the list pages.
  // Extra (manually added) rows survive the re-seed EXCEPT when the incoming recipe already
  // contains that material — keeping both would submit duplicate materialId lines, which the
  // backend accepts and posts as double consumption.
  const prefillKey = `${selectedProduct?._id ?? ''}|${qtyProduced}`;
  if (prefillKey !== prevPrefillKey) {
    setPrevPrefillKey(prefillKey);
    setRows((rs) => {
      const bomIds = new Set((selectedProduct?.bom ?? []).map((line) => line.materialId));
      const extra = rs.filter((r) => !r.fromBom && !bomIds.has(r.materialId));
      const bomRows: ConsumptionRowState[] = (selectedProduct?.bom ?? []).map((line) => {
        const planned = round2(line.qtyPerUnit * qtyNum);
        return { materialId: line.materialId, actualQty: String(planned), wastageQty: '0', fromBom: true };
      });
      return [...bomRows, ...extra];
    });
  }

  const updateRow = (index: number, patch: Partial<ConsumptionRowState>) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const removeRow = (index: number) => setRows((rs) => rs.filter((_, i) => i !== index));
  const addExtraRow = () => setRows((rs) => [...rs, emptyExtraRow()]);

  // Defensive: a duplicate materialId across rows would post double consumption on the
  // backend. The re-seed dedup and getOptionDisabled should prevent this, but block submit
  // outright if one slips through.
  const pickedIds = rows.map((r) => r.materialId).filter((id) => id !== '');
  const hasDuplicateMaterials = new Set(pickedIds).size !== pickedIds.length;

  const recordBatch = useMutation({
    mutationFn: () =>
      postJson<{ data: unknown }>(
        '/production',
        productionCreate.parse({
          productId: selectedProduct?._id ?? '',
          qtyProduced: Number(qtyProduced),
          date,
          expiryDate: expiryDate.trim() || undefined,
          materialsConsumed: rows.map((r) => ({
            materialId: r.materialId,
            actualQty: Number(r.actualQty) || 0,
            wastageQty: Number(r.wastageQty) || 0,
          })),
        }),
      ),
    onSuccess: async () => {
      notify('Batch recorded');
      reset();
      onClose();
      // Stock on the consumed materials and the produced product (qty + avgUnitCost) both changed.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['production'] }),
        queryClient.invalidateQueries({ queryKey: ['materials'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
  });

  return (
    <FormDialog
      open={open}
      title="New batch"
      submitLabel="Record batch"
      maxWidth="md"
      fullScreenOnMobile
      pending={recordBatch.isPending}
      submitDisabled={hasDuplicateMaterials}
      onClose={() => {
        if (recordBatch.isPending) return;
        reset();
        onClose();
      }}
      onSubmit={async () => {
        await recordBatch.mutateAsync();
      }}
    >
      {({ fieldError }) => (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <ServerSearchSelect<ProductOut>
              resource="products"
              itemSchema={productOut}
              getLabel={(p) => (p.variant ? `${p.name} (${p.variant})` : p.name)}
              extraFilter={(p) => p.bom.length > 0}
              value={selectedProduct}
              onChange={setSelectedProduct}
              label="Product"
              placeholder="Choose a product"
              error={Boolean(fieldError('productId'))}
              helperText={fieldError('productId') ?? 'Only products with a recipe (BoM) can be produced'}
              autoFocus
              required
              sx={{ flex: 1 }}
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
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <IconButton
                aria-label="Decrease quantity"
                onClick={() => setQtyProduced(String(Math.max(1, qtyNum - 1)))}
              >
                <RemoveOutlinedIcon fontSize="small" />
              </IconButton>
              <TextField
                label="Qty produced"
                type="number"
                value={qtyProduced}
                onChange={(e) => setQtyProduced(e.target.value)}
                error={Boolean(fieldError('qtyProduced'))}
                helperText={fieldError('qtyProduced')}
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                sx={{ width: 140 }}
              />
              <IconButton aria-label="Increase quantity" onClick={() => setQtyProduced(String(qtyNum + 1))}>
                <AddOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <TextField
              label="Expiry date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              error={Boolean(fieldError('expiryDate'))}
              helperText={fieldError('expiryDate') ?? 'Optional'}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 170 }}
            />
          </Stack>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Materials consumed
            </Typography>
            {fieldError('materialsConsumed') && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                {fieldError('materialsConsumed')}
              </Typography>
            )}
            {rows.length === 0 ? (
              <Alert severity="info">
                {selectedProduct ? 'Adjust qty produced above to prefill the recipe.' : 'Pick a product to prefill its recipe, or add materials manually.'}
              </Alert>
            ) : (
              <Stack spacing={2}>
                {rows.map((row, index) => {
                  const material = materials.find((m) => m._id === row.materialId) ?? null;
                  const unit = material?.useUnit ?? '';
                  const planned = row.fromBom ? round2((bomMap.get(row.materialId) ?? 0) * qtyNum) : 0;
                  const materialError = fieldError(`materialsConsumed.${index}.materialId`);
                  const actualError = fieldError(`materialsConsumed.${index}.actualQty`);
                  const wastageError = fieldError(`materialsConsumed.${index}.wastageQty`);
                  const rowError = fieldError(`materialsConsumed.${index}`);
                  return (
                    <Box key={index}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
                        {row.fromBom ? (
                          <Box sx={{ flex: 1, minWidth: { sm: 180 }, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                            <Typography variant="body2">{material?.name ?? EM_DASH}</Typography>
                          </Box>
                        ) : (
                          <Autocomplete<MaterialOut>
                            options={materials}
                            loading={materialsLoading}
                            value={material}
                            getOptionLabel={(m) => `${m.name} (${m.useUnit})`}
                            isOptionEqualToValue={(a, b) => a._id === b._id}
                            getOptionDisabled={(m) => rows.some((r, i) => i !== index && r.materialId === m._id)}
                            onChange={(_e, v) => updateRow(index, { materialId: v?._id ?? '' })}
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
                        )}
                        {row.fromBom && (
                          <TextField
                            label="Planned"
                            value={qtyFmt(planned, unit)}
                            slotProps={{ input: { readOnly: true } }}
                            sx={{ width: { xs: '100%', sm: 150 }, '& input': { fontFamily: monoFamily } }}
                          />
                        )}
                        <TextField
                          label="Actual"
                          type="number"
                          value={row.actualQty}
                          onChange={(e) => updateRow(index, { actualQty: e.target.value })}
                          error={Boolean(actualError)}
                          helperText={actualError}
                          slotProps={{
                            htmlInput: { min: 0, step: 'any' },
                            input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
                          }}
                          sx={{ width: { xs: '100%', sm: 140 } }}
                        />
                        <TextField
                          label="Wastage"
                          type="number"
                          value={row.wastageQty}
                          onChange={(e) => updateRow(index, { wastageQty: e.target.value })}
                          error={Boolean(wastageError)}
                          helperText={wastageError}
                          slotProps={{
                            htmlInput: { min: 0, step: 'any' },
                            input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
                          }}
                          sx={{ width: { xs: '100%', sm: 140 } }}
                        />
                        {!row.fromBom && (
                          <IconButton
                            aria-label="Remove material"
                            onClick={() => removeRow(index)}
                            sx={{ mt: { sm: 0.5 }, alignSelf: { xs: 'flex-end', sm: 'auto' } }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                      {rowError && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          {rowError}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
            {hasDuplicateMaterials && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                The same material appears on more than one line — remove the duplicate before recording.
              </Alert>
            )}
            <Button startIcon={<AddOutlinedIcon />} onClick={addExtraRow} sx={{ mt: 1.5 }}>
              Add material
            </Button>
          </Box>
        </Stack>
      )}
    </FormDialog>
  );
}
