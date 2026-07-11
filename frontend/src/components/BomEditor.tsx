'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
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
}

/**
 * Recipe (bill-of-materials) editor embedded in the product create/edit dialog. Each row
 * picks a raw material (options fetched from /materials) and the quantity, in that
 * material's useUnit, consumed to make 1 finished unit. A material already used by
 * another row is disabled in that row's options so the same ingredient can't be listed
 * twice.
 */
export function BomEditor({ value, onChange }: BomEditorProps) {
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

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Recipe (bill of materials)
      </Typography>
      <Stack spacing={1.5}>
        {value.map((row, index) => {
          const selected = materials.find((m) => m._id === row.materialId) ?? null;
          return (
            <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Autocomplete<MaterialOut>
                options={materials}
                loading={isLoading}
                value={selected}
                getOptionLabel={(m) => `${m.name} (${m.useUnit})`}
                isOptionEqualToValue={(a, b) => a._id === b._id}
                getOptionDisabled={(m) => value.some((r, i) => i !== index && r.materialId === m._id)}
                onChange={(_e, newValue) => updateRow(index, { materialId: newValue?._id ?? '' })}
                sx={{ flex: 1 }}
                renderInput={(params) => <TextField {...params} label="Material" placeholder="Choose a material" />}
              />
              <TextField
                label="Quantity"
                type="number"
                value={row.qtyPerUnit === 0 ? '' : row.qtyPerUnit}
                onChange={(e) =>
                  updateRow(index, { qtyPerUnit: e.target.value === '' ? 0 : Number(e.target.value) })
                }
                helperText="per 1 unit made"
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                sx={{ width: 160 }}
              />
              <IconButton aria-label="Remove ingredient" onClick={() => removeRow(index)} sx={{ mt: 0.5 }}>
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
