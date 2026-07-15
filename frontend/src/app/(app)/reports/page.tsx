'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { recountOut } from '@gym/shared';
import { postJson, ApiClientError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import {
  useProfit, useStockValue, useUdhaarReport, useSalesSummary,
} from '@/lib/useReports';
import { enumLabel, inr, localDateValue, monthValue, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';
import { SectionPaper } from './SectionPaper';

// Not exported from @gym/shared as a named *Out type (same as the rest of this page's report
// shapes) — inferred locally from the schema.
type RecountOut = z.infer<typeof recountOut>;

// Loaded on demand, client-side only: @mui/x-charts (the LineChart + reference line used by
// the Trends section) is the single heaviest dependency this route pulls in, and it's only
// ever rendered for admins. next/dynamic with ssr: false moves it into its own chunk that
// downloads after mount instead of shipping in the route's shared/first-load bundle, so
// staff (who never see this section — it stays inside the same `isAdmin &&` gate as before)
// and the initial paint for everyone never pay for it. The loading fallback mirrors the
// in-component skeleton so there's no layout jump once the chunk arrives.
const TrendsSection = dynamic(
  () => import('./TrendsSection').then((m) => m.TrendsSection),
  {
    ssr: false,
    loading: () => (
      <SectionPaper title="Trends">
        <Skeleton variant="rounded" height={280} />
      </SectionPaper>
    ),
  },
);

/**
 * The owner's number — mini P&L in mono, given the most visual weight of any report:
 * net profit renders as MoneyText variant="total" and turns khata red when the month lost
 * money, same signature treatment sale totals and udhaar balances get.
 */
function ProfitSection() {
  const [month, setMonth] = useState(() => monthValue(new Date()));
  const { data, isLoading } = useProfit(month);

  return (
    <SectionPaper
      title="Profit"
      action={
        <TextField
          label="Month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      }
    >
      {isLoading || !data ? (
        <Skeleton variant="rounded" height={220} />
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>Revenue</TableCell>
                  <TableCell align="right">
                    <MoneyText value={data.revenue} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cost of goods sold</TableCell>
                  <TableCell align="right">
                    <MoneyText value={data.costOfGoodsSold} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Gross profit</TableCell>
                  <TableCell align="right">
                    <Box
                      component="span"
                      sx={{ fontFamily: monoFamily, color: data.grossProfit < 0 ? 'error.main' : 'inherit' }}
                    >
                      {inr(data.grossProfit)}
                    </Box>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Overhead</TableCell>
                  <TableCell align="right">
                    <MoneyText value={data.overhead} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Overhead / unit</TableCell>
                  <TableCell align="right">
                    <MoneyText value={data.overheadPerUnit} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '1.1rem' }}>Net profit</TableCell>
                  <TableCell align="right" sx={{ fontSize: '1.1rem' }}>
                    <MoneyText value={data.netProfit} variant="total" udhaar={data.netProfit < 0} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {data.unitsProduced} units produced &middot; {data.unitsSold} units sold
          </Typography>
        </>
      )}
    </SectionPaper>
  );
}

function StockValueSection() {
  const { data, isLoading } = useStockValue();

  return (
    <SectionPaper title="Stock value">
      {isLoading || !data ? (
        <Skeleton variant="rounded" height={100} />
      ) : (
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography color="text.secondary">Raw materials</Typography>
            <MoneyText value={data.rawValue} />
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography color="text.secondary">Finished goods</Typography>
            <MoneyText value={data.finishedValue} />
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography sx={{ fontWeight: 600 }}>Total</Typography>
            <MoneyText value={data.totalValue} variant="total" />
          </Stack>
        </Stack>
      )}
    </SectionPaper>
  );
}

function UdhaarSection() {
  const { data, isLoading } = useUdhaarReport();
  const total = (data ?? []).reduce((sum, entry) => sum + entry.balance, 0);

  return (
    <SectionPaper title="Udhaar outstanding">
      {isLoading || !data ? (
        <Skeleton variant="rounded" height={160} />
      ) : data.length === 0 ? (
        <EmptyState message="Nothing outstanding — every khata is clear" />
      ) : (
        <>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((entry) => (
                  <TableRow key={entry.customerId}>
                    <TableCell>{entry.name}</TableCell>
                    <TableCell>{entry.phone ?? EM_DASH}</TableCell>
                    <TableCell align="right">
                      <MoneyText value={entry.balance} udhaar />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1, mt: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>Total owed</Typography>
            <MoneyText value={total} variant="total" udhaar />
          </Box>
        </>
      )}
    </SectionPaper>
  );
}

/**
 * Visible to both roles. The staff response omits `revenue` and every byPaymentMode
 * entry's `total` — those columns/KPIs render only when the field is present in the
 * parsed response, never as an empty placeholder.
 */
function SalesSummarySection() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(() => localDateValue(firstOfMonth));
  const [to, setTo] = useState(() => localDateValue(today));
  const { data, isLoading } = useSalesSummary(from, to);
  const hasRevenue = data?.revenue !== undefined;

  return (
    <SectionPaper
      title="Sales summary"
      action={
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="From"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      }
    >
      {isLoading || !data ? (
        <Skeleton variant="rounded" height={160} />
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Sales count
              </Typography>
              <Box sx={{ fontFamily: monoFamily, fontSize: '1.25rem' }}>{data.count}</Box>
            </Box>
            {hasRevenue && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Revenue
                </Typography>
                <MoneyText value={data.revenue} variant="total" />
              </Box>
            )}
          </Stack>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mode</TableCell>
                  <TableCell align="right">Count</TableCell>
                  {hasRevenue && <TableCell align="right">Total</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.byPaymentMode.map((mode) => (
                  <TableRow key={mode.mode}>
                    <TableCell>{enumLabel(mode.mode)}</TableCell>
                    <TableCell align="right">{mode.count}</TableCell>
                    {hasRevenue && (
                      <TableCell align="right">
                        <MoneyText value={mode.total} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </SectionPaper>
  );
}

/**
 * Admin-only maintenance action: rebuilds the cached stock (Material/Product currentQty)
 * and customer udhaarBalance fields from the StockMovement/Sale/Payment ledger. Not
 * transactional against concurrent writes (see backend/src/services/recount.ts), so this
 * is gated behind a ConfirmDialog and meant to be run when the shop is idle. Renders the
 * result inline (stat lines + a drift-details table) rather than only a toast, so an admin
 * can see exactly what was off before trusting the "fixed" claim.
 */
function RecountSection() {
  const notify = useNotify();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<RecountOut | null>(null);

  const recount = useMutation({
    mutationFn: async () => {
      const res = await postJson<{ data: unknown }>('/admin/recount', {});
      return recountOut.parse(res.data);
    },
    onSuccess: (data) => {
      setResult(data);
      notify(`Recount complete - ${data.driftsFound} drifts fixed, ${data.customersFixed} customers fixed`);
    },
    onError: (err: unknown) => {
      notify(err instanceof ApiClientError ? err.message : 'Recount failed', 'error');
    },
  });

  return (
    <SectionPaper title="Recount stock caches">
      <Stack spacing={2}>
        <Typography color="text.secondary">
          Rebuilds cached stock and udhaar balances from the ledger. Run when the shop is idle.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => setConfirmOpen(true)}
          disabled={recount.isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          {recount.isPending ? 'Recounting…' : 'Recount stock caches'}
        </Button>

        {result && (
          <>
            <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Drifts found
                </Typography>
                <Box sx={{ fontFamily: monoFamily, fontSize: '1.25rem' }}>{result.driftsFound}</Box>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Customers fixed
                </Typography>
                <Box sx={{ fontFamily: monoFamily, fontSize: '1.25rem' }}>{result.customersFixed}</Box>
              </Box>
            </Stack>

            {result.details.length > 0 && (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Kind</TableCell>
                      <TableCell align="right">Cached</TableCell>
                      <TableCell align="right">Ledger</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.details.map((d) => (
                      <TableRow key={`${d.itemKind}:${d.itemId}`}>
                        <TableCell>{d.name}</TableCell>
                        <TableCell>{enumLabel(d.itemKind)}</TableCell>
                        <TableCell align="right">
                          <Box component="span" sx={{ fontFamily: monoFamily }}>
                            {d.cachedQty}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box component="span" sx={{ fontFamily: monoFamily }}>
                            {d.ledgerQty}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        title="Recount stock caches"
        body="Rebuilds cached stock and udhaar balances from the ledger. Run when the shop is idle. Continue?"
        confirmLabel="Recount"
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await recount.mutateAsync();
          setConfirmOpen(false);
        }}
      />
    </SectionPaper>
  );
}

export default function ReportsPage() {
  usePageTitle('Reports');
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  return (
    <>
      <PageHeader title="Reports" />
      <Stack spacing={3}>
        {isAdmin && <TrendsSection />}
        {isAdmin && <ProfitSection />}
        {isAdmin && <StockValueSection />}
        {isAdmin && <UdhaarSection />}
        <SalesSummarySection />
        {isAdmin && <RecountSection />}
      </Stack>
    </>
  );
}
