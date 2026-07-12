'use client';

import { useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useMe } from '@/lib/auth';
import { useProfit, useStockValue, useUdhaarReport, useSalesSummary } from '@/lib/useReports';
import { enumLabel, inr, localDateValue, monthValue, EM_DASH } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';

function SectionPaper({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}
      >

        <Typography variant="h5" component="h3">
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

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
        <Stack direction="row" spacing={2}>
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

export default function ReportsPage() {
  usePageTitle('Reports');
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  return (
    <>
      <PageHeader title="Reports" />
      <Stack spacing={3}>
        {isAdmin && <ProfitSection />}
        {isAdmin && <StockValueSection />}
        {isAdmin && <UdhaarSection />}
        <SalesSummarySection />
      </Stack>
    </>
  );
}
