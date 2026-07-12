'use client';

import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { LineChart, ChartsReferenceLine, type AxisValueFormatterContext } from '@mui/x-charts';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { recountOut } from '@gym/shared';
import { postJson, ApiClientError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import {
  useProfit, useStockValue, useUdhaarReport, useSalesSummary, useTrends, type TrendsOut,
} from '@/lib/useReports';
import { enumLabel, inr, compactInr, localDateValue, monthValue, EM_DASH } from '@/lib/fmt';
import { monthGrowth, trendMonthLabel } from '@/lib/trends';
import { monoFamily } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';

// Categorical palette for the Trends chart, fixed order revenue -> expenses -> net profit.
// Validated with the dataviz skill's checker (light mode, chart surface #FFFFFF):
//   node validate_palette.js "#9B272D,#A87900,#2EA4A7" --mode light --surface "#FFFFFF"
//   -> lightness band PASS, chroma floor PASS, CVD separation PASS (worst adjacent
//      deltaE 33.0), contrast vs surface PASS (all >= 3:1) -- ALL CHECKS PASS.
// (Candidates started from khata red #7B1F24 / brass #A87900 / teal #1F6E70; red and teal
// were lightened, hue held, until both checks cleared -- brass already passed unchanged.)
const TREND_COLORS = { revenue: '#9B272D', expenses: '#A87900', netProfit: '#2EA4A7' } as const;

// Not exported from @gym/shared as a named *Out type (same as the rest of this page's report
// shapes) — inferred locally from the schema.
type RecountOut = z.infer<typeof recountOut>;

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
 * Latest month's revenue vs the previous month — a stat tile (value + delta), not a
 * mini-chart, per the viz method. previous === 0 has no defined percentage, so it renders
 * "New" instead of Infinity%. Direction is a status signal (good/bad), so it wears the
 * theme's success/error tokens, never a chart series color.
 */
function GrowthStatTile({ data }: { data: TrendsOut }) {
  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const { pct, delta } = monthGrowth(latest.revenue, previous.revenue);
  const isUp = delta >= 0;
  const deltaLabel = `${delta >= 0 ? '+' : '-'}${inr(Math.abs(delta))}`;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        Revenue vs previous month
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        {pct === null ? (
          <Box component="span" sx={{ fontFamily: monoFamily, fontSize: '1.25rem', fontWeight: 600 }}>
            New
          </Box>
        ) : (
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: 'center', color: isUp ? 'success.main' : 'error.main' }}
          >
            {isUp ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
            <Box component="span" sx={{ fontFamily: monoFamily, fontSize: '1.25rem', fontWeight: 600 }}>
              {Math.abs(pct).toFixed(1)}%
            </Box>
          </Stack>
        )}
        <Box component="span" sx={{ fontFamily: monoFamily, color: 'text.secondary' }}>
          ({deltaLabel})
        </Box>
      </Stack>
    </Box>
  );
}

/**
 * Monthly Revenue / Expenses / Net profit over the trailing year — the only chart on this
 * page. One shared ₹ y-axis (never dual-axis), fixed categorical colors per TREND_COLORS
 * (validated above), zero-line via ChartsReferenceLine since net profit can go negative.
 * Empty until the shop has at least one month of real activity (every point would
 * otherwise be a flat zero line, which reads as "no data" rather than "all quiet").
 */
function TrendsSection() {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down(400));
  const { data, isLoading } = useTrends(12);
  const hasActivity = (data ?? []).some((p) => p.revenue !== 0 || p.expenses !== 0 || p.unitsSold !== 0);

  return (
    <SectionPaper title="Trends">
      {isLoading || !data ? (
        <Skeleton variant="rounded" height={280} />
      ) : !hasActivity ? (
        <EmptyState message="Not enough history yet — trends appear after your first full month" />
      ) : (
        <Stack spacing={2}>
          <GrowthStatTile data={data} />
          <Box sx={{ width: '100%', height: 280 }}>
            <LineChart
              dataset={data}
              height={280}
              grid={{ horizontal: true }}
              xAxis={[{
                id: 'month',
                dataKey: 'month',
                scaleType: 'point',
                valueFormatter: (value: string) => trendMonthLabel(value, value === data[0]?.month),
                tickInterval: isNarrow ? (_value: string, index: number) => index % 3 === 0 : 'auto',
              }]}
              yAxis={[{
                id: 'inr',
                min: Math.min(0, ...data.flatMap((p) => [p.revenue, p.expenses, p.netProfit])),
                valueFormatter: (value: number, context: AxisValueFormatterContext<'linear'>) => (
                  context.location === 'tick' ? compactInr(value) : inr(value)
                ),
              }]}
              series={[
                {
                  id: 'revenue', dataKey: 'revenue', label: 'Revenue', color: TREND_COLORS.revenue, showMark: false,
                },
                {
                  id: 'expenses', dataKey: 'expenses', label: 'Expenses', color: TREND_COLORS.expenses, showMark: false,
                },
                {
                  id: 'netProfit', dataKey: 'netProfit', label: 'Net profit', color: TREND_COLORS.netProfit, showMark: false,
                },
              ]}
            >
              <ChartsReferenceLine y={0} lineStyle={{ stroke: theme.palette.divider, strokeWidth: 1 }} />
            </LineChart>
          </Box>
        </Stack>
      )}
    </SectionPaper>
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
