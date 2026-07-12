'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import Skeleton from '@mui/material/Skeleton';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { customerOut, saleOut, paymentOut, type SaleOut, type PaymentOut } from '@gym/shared';
import { getJson } from '@/lib/api';
import { useListQuery } from '@/lib/useListQuery';
import { dateFmt, enumLabel } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { MoneyText } from './MoneyText';
import { EmptyState } from './EmptyState';
import { TakePaymentDialog } from './TakePaymentDialog';

const ROWS_PER_PAGE = 5;

export interface CustomerLedgerDrawerProps {
  customerId: string;
  onClose: () => void;
}

/** Prev/Next footer for the small embedded lists below — a full DataTable/DataGrid is overkill for 5 rows at a time. */
function ListPager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  if (pageCount <= 1) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Page {page} of {pageCount}
      </Typography>
      <IconButton size="small" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

/**
 * Right-side khata drawer for one customer: header carries the signature udhaar total,
 * body lists recent sales and payments, footer opens TakePaymentDialog. Both embedded
 * lists are small (5/page) so a plain MUI Table + Prev/Next footer is used here instead
 * of pulling in DataGrid — that's reserved for the page-level, server-paginated tables.
 */
export function CustomerLedgerDrawer({ customerId, onClose }: CustomerLedgerDrawerProps) {
  const [salesPage, setSalesPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [payOpen, setPayOpen] = useState(false);

  const { data: customer } = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: async () => customerOut.parse((await getJson<{ data: unknown }>(`/customers/${customerId}`)).data),
  });

  const sales = useListQuery('sales', saleOut, {
    customerId,
    page: salesPage,
    limit: ROWS_PER_PAGE,
  });

  const payments = useListQuery('payments', paymentOut, {
    customerId,
    page: paymentsPage,
    limit: ROWS_PER_PAGE,
  });

  const owed = customer?.udhaarBalance ?? 0;

  return (
    <Drawer
      open
      anchor="right"
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 420 } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 3, py: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              {customer ? (
                <Typography variant="h5" component="h2">
                  {customer.name}
                </Typography>
              ) : (
                <Skeleton variant="text" width={160} height={36} />
              )}
              <Typography variant="caption" color="text.secondary">
                Khata
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
              Owed
            </Typography>
            {customer ? (
              <MoneyText value={owed} variant="total" udhaar={owed > 0} />
            ) : (
              <Skeleton variant="text" width={100} height={32} />
            )}
          </Box>
        </Box>

        <Divider />

        <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Recent sales
          </Typography>
          {!sales.isLoading && sales.rows.length === 0 ? (
            <EmptyState message="No sales yet" />
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Udhaar</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sales.rows.map((s: SaleOut) => (
                      <TableRow key={s._id}>
                        <TableCell sx={{ fontFamily: monoFamily }}>{s.invoiceNo}</TableCell>
                        <TableCell>{dateFmt(s.date)}</TableCell>
                        <TableCell align="right">
                          <MoneyText value={s.total} />
                        </TableCell>
                        <TableCell align="right">
                          <MoneyText value={s.udhaarAmount} udhaar={s.udhaarAmount > 0} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <ListPager page={salesPage} total={sales.total} onChange={setSalesPage} />
            </>
          )}

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Payments
          </Typography>
          {!payments.isLoading && payments.rows.length === 0 ? (
            <EmptyState message="No payments yet" />
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Mode</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.rows.map((p: PaymentOut) => (
                      <TableRow key={p._id}>
                        <TableCell>{dateFmt(p.date)}</TableCell>
                        <TableCell align="right">
                          <MoneyText value={p.amount} />
                        </TableCell>
                        <TableCell>{enumLabel(p.paymentMode)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <ListPager page={paymentsPage} total={payments.total} onChange={setPaymentsPage} />
            </>
          )}
        </Box>

        <Divider />

        <Box sx={{ px: 3, py: 2 }}>
          <Button variant="contained" fullWidth onClick={() => setPayOpen(true)}>
            Take payment
          </Button>
        </Box>
      </Box>

      {payOpen && (
        <TakePaymentDialog
          open
          customerId={customerId}
          owed={owed}
          onClose={() => setPayOpen(false)}
        />
      )}
    </Drawer>
  );
}
