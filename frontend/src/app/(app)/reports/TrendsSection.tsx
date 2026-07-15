'use client';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { LineChart, ChartsReferenceLine, type AxisValueFormatterContext } from '@mui/x-charts';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useTrends, type TrendsOut } from '@/lib/useReports';
import { compactInr, inr } from '@/lib/fmt';
import { monthGrowth, trendMonthLabel } from '@/lib/trends';
import { monoFamily } from '@/lib/theme';
import { EmptyState } from '@/components/EmptyState';
import { SectionPaper } from './SectionPaper';

// This module is loaded via next/dynamic (ssr: false) from page.tsx so that @mui/x-charts —
// the heaviest dependency on the Reports route — leaves the route's shared/first-load
// bundle and only downloads for admins, on demand, once TrendsSection actually mounts.
// Keep chart-only concerns in here; anything the rest of the page needs (SectionPaper) lives
// in ./SectionPaper so importing it back doesn't drag this chunk's weight into page.tsx.

// Categorical palette for the Trends chart, fixed order revenue -> expenses -> net profit.
// Validated with the dataviz skill's checker (light mode, chart surface #FFFFFF):
//   node validate_palette.js "#9B272D,#A87900,#2EA4A7" --mode light --surface "#FFFFFF"
//   -> lightness band PASS, chroma floor PASS, CVD separation PASS (worst adjacent
//      deltaE 33.0), contrast vs surface PASS (all >= 3:1) -- ALL CHECKS PASS.
// (Candidates started from khata red #7B1F24 / brass #A87900 / teal #1F6E70; red and teal
// were lightened, hue held, until both checks cleared -- brass already passed unchanged.)
const TREND_COLORS = { revenue: '#9B272D', expenses: '#A87900', netProfit: '#2EA4A7' } as const;

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
export function TrendsSection() {
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
