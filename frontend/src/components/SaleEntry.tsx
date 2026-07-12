'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ZodError } from 'zod';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import FormHelperText from '@mui/material/FormHelperText';
import Divider from '@mui/material/Divider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import RemoveOutlinedIcon from '@mui/icons-material/RemoveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  saleCreate,
  saleOut,
  productOut,
  customerOut,
  PAYMENT_MODES,
  type ProductOut,
  type CustomerOut,
  type PaymentMode,
} from '@gym/shared';
import { postJson, ApiClientError } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { zodErrorToFields } from '@/lib/zodFields';
import { enumLabel, localDateValue } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { MoneyText } from './MoneyText';
import { useNotify } from './SnackbarProvider';

interface CartLine {
  productId: string;
  name: string;
  qty: number;
  unitPrice: string;
}

interface FormErrorState {
  message: string;
  fields?: Record<string, string>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const STEPPER_SX = { width: 40, height: 40 };

/**
 * "New sale" — the busiest screen in the app, so it lives open at the top of the page
 * instead of behind a dialog: zero taps to start a sale. Picking a product from the search
 * Autocomplete adds a cart line at qty 1 (or bumps the existing line's qty if it's already
 * in the cart), unit price prefilled from sellingPrice but editable. The running TOTAL is
 * the signature khata double-rule; udhaar (total - amountPaid) requires a customer the
 * moment it goes positive — submit stays disabled with a helper text until one is chosen,
 * mirroring the server's saleCreate refine exactly (see shared/src/sales.ts).
 */
export function SaleEntry() {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [productSearch, setProductSearch] = useState('');
  const debouncedSearch = useDebouncedValue(productSearch);
  const { rows: productResults, isLoading: productsLoading } = useListQuery('products', productOut, {
    search: debouncedSearch || undefined,
    limit: 20,
  });

  // Server-searched, like the product field above — a fixed { limit: 100 } page would make
  // customer #101 unreachable for udhaar sales.
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebouncedValue(customerSearch);
  const { rows: customerResults, isLoading: customersLoading } = useListQuery('customers', customerOut, {
    search: debouncedCustomerSearch || undefined,
    limit: 20,
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  // The full object, not just the id: with server-side search the current results page may
  // no longer contain the selection, so it can't be re-derived from the options list.
  const [customer, setCustomer] = useState<CustomerOut | null>(null);
  const [error, setError] = useState<FormErrorState | null>(null);

  const fieldError = (name: string): string | undefined => error?.fields?.[name];

  const reset = () => {
    setCart([]);
    setDiscount('0');
    setPaymentMode('CASH');
    setAmountPaid('');
    setCustomer(null);
    setCustomerSearch('');
    setProductSearch('');
    setError(null);
  };

  const addProduct = (product: ProductOut) => {
    setCart((lines) => {
      const existing = lines.findIndex((l) => l.productId === product._id);
      if (existing >= 0) {
        return lines.map((l, i) => (i === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...lines, { productId: product._id, name: product.name, qty: 1, unitPrice: String(product.sellingPrice) }];
    });
    setProductSearch('');
  };

  const updateLine = (index: number, patch: Partial<CartLine>) => {
    setCart((lines) => lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const removeLine = (index: number) => setCart((lines) => lines.filter((_, i) => i !== index));

  const subtotal = round2(cart.reduce((sum, l) => sum + l.qty * (Number(l.unitPrice) || 0), 0));
  const discountNum = Number(discount) || 0;
  const total = round2(subtotal - discountNum);
  const paidNum = Number(amountPaid) || 0;
  const udhaar = Math.max(0, round2(total - paidNum));
  const requiresCustomer = udhaar > 0 && !customer;
  // Keep the selection visible in the dropdown even when the current search page no longer includes it.
  const customerOptions =
    customer && !customerResults.some((c) => c._id === customer._id)
      ? [customer, ...customerResults]
      : customerResults;

  const recordSale = useMutation({
    mutationFn: async () => {
      const payload = saleCreate.parse({
        customerId: customer?._id,
        date: localDateValue(new Date()),
        paymentMode,
        discount: discountNum,
        amountPaid: paidNum,
        items: cart.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: Number(l.unitPrice) || 0,
        })),
      });
      const res = await postJson<{ data: unknown }>('/sales', payload);
      return saleOut.parse(res.data);
    },
    onSuccess: async (sale) => {
      notify(`Sale ${sale.invoiceNo} recorded`);
      const hadCustomer = Boolean(sale.customerId);
      reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        ...(hadCustomer ? [queryClient.invalidateQueries({ queryKey: ['customers'] })] : []),
      ]);
    },
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      await recordSale.mutateAsync();
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

  const submitDisabled = cart.length === 0 || requiresCustomer || recordSale.isPending;

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h2">
              New sale
            </Typography>

            {error && <Alert severity="error">{error.message}</Alert>}

            <Autocomplete<ProductOut>
              options={productResults}
              loading={productsLoading}
              value={null}
              inputValue={productSearch}
              onInputChange={(_e, v) => setProductSearch(v)}
              filterOptions={(x) => x}
              getOptionLabel={(p) => (p.variant ? `${p.name} (${p.variant})` : p.name)}
              isOptionEqualToValue={(a, b) => a._id === b._id}
              onChange={(_e, v) => {
                if (v) addProduct(v);
              }}
              renderInput={(params) => (
                <TextField {...params} label="Add a product" placeholder="Search products" autoFocus />
              )}
            />

            {fieldError('items') && (
              <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                {fieldError('items')}
              </Typography>
            )}

            {cart.length === 0 ? (
              <Alert severity="info">Search and pick a product above to start the sale.</Alert>
            ) : (
              <Stack spacing={1.5} divider={<Divider />}>
                {cart.map((line, index) => {
                  const lineTotal = round2(line.qty * (Number(line.unitPrice) || 0));
                  const priceError = fieldError(`items.${index}.unitPrice`);
                  return (
                    <Stack
                      key={line.productId}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      sx={{ alignItems: { sm: 'center' } }}
                    >
                      <Typography sx={{ flex: 1, fontWeight: 500 }}>{line.name}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <IconButton
                          aria-label={`Decrease quantity of ${line.name}`}
                          onClick={() => updateLine(index, { qty: Math.max(1, line.qty - 1) })}
                          sx={STEPPER_SX}
                        >
                          <RemoveOutlinedIcon fontSize="small" />
                        </IconButton>
                        <Typography sx={{ minWidth: 28, textAlign: 'center', fontFamily: monoFamily }}>
                          {line.qty}
                        </Typography>
                        <IconButton
                          aria-label={`Increase quantity of ${line.name}`}
                          onClick={() => updateLine(index, { qty: line.qty + 1 })}
                          sx={STEPPER_SX}
                        >
                          <AddOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <TextField
                        label="Unit price"
                        type="number"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                        error={Boolean(priceError)}
                        helperText={priceError}
                        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                        sx={{ width: { xs: '100%', sm: 130 } }}
                      />
                      <Box sx={{ minWidth: 90, textAlign: 'right' }}>
                        <MoneyText value={lineTotal} />
                      </Box>
                      <IconButton
                        aria-label={`Remove ${line.name}`}
                        onClick={() => removeLine(index)}
                        sx={{ ...STEPPER_SX, alignSelf: { xs: 'flex-end', sm: 'auto' } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Stack>
            )}

            <Divider />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <TextField
                label="Discount"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                error={Boolean(fieldError('discount'))}
                helperText={fieldError('discount')}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                sx={{ flex: 1 }}
              />
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: { xs: 'space-between', sm: 'flex-end' },
                  gap: 1,
                  flex: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Total
                </Typography>
                <MoneyText value={total} variant="total" />
              </Box>
            </Stack>

            <ToggleButtonGroup
              value={paymentMode}
              exclusive
              fullWidth
              onChange={(_e, v: PaymentMode | null) => {
                if (v) setPaymentMode(v);
              }}
            >
              {PAYMENT_MODES.map((m) => (
                <ToggleButton key={m} value={m} sx={{ minHeight: 40 }}>
                  {enumLabel(m)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
              <TextField
                label="Amount paid"
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                error={Boolean(fieldError('amountPaid'))}
                helperText={fieldError('amountPaid')}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                fullWidth
              />
              <Button
                variant="outlined"
                onClick={() => setAmountPaid(String(total))}
                sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
              >
                Full
              </Button>
            </Stack>

            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                <Typography variant="body2" color="text.secondary">
                  Udhaar
                </Typography>
                <MoneyText value={udhaar} udhaar={udhaar > 0} />
              </Stack>
              {udhaar > 0 ? (
                <Autocomplete<CustomerOut>
                  options={customerOptions}
                  loading={customersLoading}
                  value={customer}
                  inputValue={customerSearch}
                  onInputChange={(_e, v) => setCustomerSearch(v)}
                  filterOptions={(x) => x}
                  getOptionLabel={(c) => c.name}
                  isOptionEqualToValue={(a, b) => a._id === b._id}
                  onChange={(_e, v) => setCustomer(v)}
                  sx={{ mt: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Customer"
                      placeholder="Search customers"
                      error={Boolean(fieldError('customerId')) || requiresCustomer}
                      helperText={
                        fieldError('customerId') ??
                        (requiresCustomer ? 'Choose a customer to record this udhaar sale' : undefined)
                      }
                    />
                  )}
                />
              ) : (
                // The server's customerId refine can still fail while the Autocomplete is
                // unmounted (client udhaar computed 0 inside the EPS window) — don't let
                // that field error vanish invisibly.
                fieldError('customerId') && <FormHelperText error>{fieldError('customerId')}</FormHelperText>
              )}
            </Box>

            <Button type="submit" variant="contained" size="large" disabled={submitDisabled} sx={{ minHeight: 48 }}>
              {recordSale.isPending ? 'Recording…' : 'Record sale'}
            </Button>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
