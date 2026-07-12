'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import { saleOut, productOut, customerOut } from '@gym/shared';
import { getJson } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { useMe } from '@/lib/auth';
import { dateFmt, qtyFmt, enumLabel, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { MoneyText } from './MoneyText';
import { EmptyState } from './EmptyState';
import { ReturnDialog, returnableLines } from './ReturnDialog';

export interface SaleDetailDialogProps {
  saleId: string | null;
  onClose: () => void;
}

/**
 * Read-only sale detail, fetched fresh by id (rather than handed the list row) so that
 * recording a return through the nested ReturnDialog — which invalidates the ['sales']
 * query key on success — refetches this same dialog and shows the updated returns
 * history without closing anything, same live-refresh trick CustomerLedgerDrawer uses
 * for its customer query.
 */
export function SaleDetailDialog({ saleId, onClose }: SaleDetailDialogProps) {
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';
  const [returnOpen, setReturnOpen] = useState(false);

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: async () => saleOut.parse((await getJson<{ data: unknown }>(`/sales/${saleId}`)).data),
    enabled: saleId !== null,
  });

  // Products/customers are only ever referenced by id on a sale; both lookups are small
  // enough to load in full and resolve locally, same 100-row-cap convention used elsewhere.
  const { rows: products } = useListQuery('products', productOut, { limit: 100 });
  const { rows: customers } = useListQuery('customers', customerOut, { limit: 100 });
  const productMap = new Map(products.map((p) => [p._id, p]));
  const customerMap = new Map(customers.map((c) => [c._id, c]));

  const canReturn = sale ? returnableLines(sale, productMap).length > 0 : false;
  // Admin always qualifies (every row carries unitCostAtSale); staff never does, since the
  // API strips the field entirely — so this doubles as the admin/staff column-visibility gate.
  const showCost = sale ? sale.items.some((l) => l.unitCostAtSale !== undefined) : false;

  return (
    <>
      <Dialog open={saleId !== null} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Sale detail</DialogTitle>
        <DialogContent>
          {isLoading || !sale ? (
            <Stack spacing={1.5}>
              <Skeleton variant="text" width={240} height={32} />
              <Skeleton variant="rectangular" height={120} />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Chip label={sale.invoiceNo} size="small" sx={{ fontFamily: monoFamily }} />
                <Chip label={dateFmt(sale.date)} size="small" variant="outlined" />
                <Chip label={enumLabel(sale.paymentMode)} size="small" variant="outlined" />
                <Chip
                  label={sale.customerId ? (customerMap.get(sale.customerId)?.name ?? EM_DASH) : 'Walk-in'}
                  size="small"
                  variant="outlined"
                />
              </Stack>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Unit price</TableCell>
                      {showCost && <TableCell align="right">Cost / unit</TableCell>}
                      <TableCell align="right">Line total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sale.items.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell>{productMap.get(line.productId)?.name ?? EM_DASH}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: monoFamily }}>
                          {qtyFmt(line.qty, 'unit')}
                        </TableCell>
                        <TableCell align="right">
                          <MoneyText value={line.unitPrice} />
                        </TableCell>
                        {showCost && (
                          <TableCell align="right">
                            <MoneyText value={line.unitCostAtSale} />
                          </TableCell>
                        )}
                        <TableCell align="right">
                          <MoneyText value={line.lineTotal} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    Subtotal
                  </Box>
                  <MoneyText value={sale.subtotal} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    Discount
                  </Box>
                  <MoneyText value={sale.discount} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    Amount paid
                  </Box>
                  <MoneyText value={sale.amountPaid} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1 }}>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    Total
                  </Box>
                  <MoneyText value={sale.total} variant="total" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    Udhaar
                  </Box>
                  <MoneyText value={sale.udhaarAmount} udhaar={sale.udhaarAmount > 0} />
                </Box>
              </Stack>

              <Box>
                <Box sx={{ mb: 1, fontWeight: 600 }}>Returns</Box>
                {sale.returns.length === 0 ? (
                  <EmptyState message="No returns yet" />
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Items</TableCell>
                          <TableCell>Refund note</TableCell>
                          <TableCell align="right">Udhaar reduced</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sale.returns.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{dateFmt(r.date)}</TableCell>
                            <TableCell>
                              {r.items
                                .map((it) => `${productMap.get(it.productId)?.name ?? EM_DASH} x ${it.qty}`)
                                .join(', ')}
                            </TableCell>
                            <TableCell>{r.refundNote ?? EM_DASH}</TableCell>
                            <TableCell align="right">
                              <MoneyText value={r.udhaarReduced} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {isAdmin && sale && canReturn && (
            <Button onClick={() => setReturnOpen(true)} sx={{ mr: 'auto' }}>
              Return items
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {sale && returnOpen && (
        <ReturnDialog open sale={sale} productMap={productMap} onClose={() => setReturnOpen(false)} />
      )}
    </>
  );
}
