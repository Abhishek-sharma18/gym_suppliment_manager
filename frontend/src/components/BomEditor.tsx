'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import FormHelperText from '@mui/material/FormHelperText';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { materialOut, type MaterialOut } from '@gym/shared';
import { useListQuery } from '@/lib/useListQuery';

export interface BomLineValue {
  materialId: string;
  qtyPerUnit: number;
}

export interface BomEditorProps {
  value: BomLineValue[];
  onChange: (value: BomLineValue[]) => void;
  /**
   * Per-field validation lookup (FormDialog's fieldError render prop). Keys follow
   * zodErrorToFields paths: "bom" for array-level issues, "bom.{i}.materialId" and
   * "bom.{i}.qtyPerUnit" for row-level ones.
   */
  fieldError?: (name: string) => string | undefined;
}

/**
 * Recipe (bill-of-materials) editor embedded in the product create/edit dialog. Each row
 * picks a raw material (options fetched from /materials) and the quantity, in that
 * material's useUnit, consumed to make 1 finished unit. A material already used by
 * another row is disabled in that row's options so the same ingredient can't be listed
 * twice. Validation messages for "bom.*" paths surface on the offending row's inputs.
 */
export function BomEditor({ value, onChange, fieldError }: BomEditorProps) {
  const { rows: materials, isLoading } = useListQuery('materials', materialOut, { limit: 100 });

  const updateRow = (index: number, patch: Partial<BomLineValue>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...value, { materialId: '', qtyPerUnit: 0 }]);
  };

  const bomError = fieldError?.('bom');

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Recipe (bill of materials)
      </Typography>
      {bomError && (
        <FormHelperText error sx={{ mb: 1 }}>
          {bomError}
        </FormHelperText>
      )}
      <Stack spacing={1.5}>
        {value.map((row, index) => {
          const selected = materials.find((m) => m._id === row.materialId) ?? null;
          const materialError = fieldError?.(`bom.${index}.materialId`);
          const qtyError = fieldError?.(`bom.${index}.qtyPerUnit`);
          return (
            <Stack
              key={index}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'flex-start' } }}
            >
              <Autocomplete<MaterialOut>
                options={materials}
                loading={isLoading}
                value={selected}
                getOptionLabel={(m) => `${m.name} (${m.useUnit})`}
                isOptionEqualToValue={(a, b) => a._id === b._id}
                getOptionDisabled={(m) => value.some((r, i) => i !== index && r.materialId === m._id)}
                onChange={(_e, newValue) => updateRow(index, { materialId: newValue?._id ?? '' })}
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
                value={row.qtyPerUnit === 0 ? '' : row.qtyPerUnit}
                onChange={(e) =>
                  updateRow(index, { qtyPerUnit: e.target.value === '' ? 0 : Number(e.target.value) })
                }
                error={Boolean(qtyError)}
                helperText={qtyError ?? 'per 1 unit made'}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                sx={{ width: { xs: '100%', sm: 160 } }}
              />
              <IconButton
                aria-label="Remove ingredient"
                onClick={() => removeRow(index)}
                sx={{ mt: { sm: 0.5 }, alignSelf: { xs: 'flex-end', sm: 'auto' } }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>
      <Button startIcon={<AddOutlinedIcon />} onClick={addRow} sx={{ mt: 1.5 }}>
        Add ingredient
      </Button>
    </Box>
  );
}
