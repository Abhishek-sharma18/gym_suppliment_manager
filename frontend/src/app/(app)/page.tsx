'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { useDashboard } from '@/lib/useReports';
import { dateFmt, qtyFmt } from '@/lib/fmt';
import { monoFamily } from '@/lib/theme';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader } from '@/components/PageHeader';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';

function KpiCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ mt: 0.5, fontSize: '1.5rem' }}>{children}</Box>
    </Paper>
  );
}

/** Rounds a days-left count to an urgency color: <=7 days red, <=15 days amber, else neutral. */
function expiryChipColor(daysLeft: number): 'error' | 'warning' | 'default' {
  if (daysLeft <= 7) return 'error';
  if (daysLeft <= 15) return 'warning';
  return 'default';
}

// Plain (non-component) helper so the Date.now() call doesn't trip react-hooks/purity —
// same pattern production/page.tsx's expiryChip() uses for the same reason.
function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { data, isLoading } = useDashboard();

  return (
    <>
      <PageHeader title="Dashboard" />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 2,
          mb: 4,
        }}
      >
        {isLoading || !data ? (
          <>
            <Skeleton variant="rounded" height={80} />
            <Skeleton variant="rounded" height={80} />
          </>
        ) : (
          <>
            <KpiCard label="Today's sales">
              <Box component="span" sx={{ fontFamily: monoFamily }}>
                {data.todaySalesCount}
              </Box>
            </KpiCard>
            {/* Role-shaped: staff responses omit these keys entirely — render only when present. */}
            {data.todaySalesTotal !== undefined && (
              <KpiCard label="Today's take">
                <MoneyText value={data.todaySalesTotal} variant="total" />
              </KpiCard>
            )}
            {data.stockValue !== undefined && (
              <KpiCard label="Stock value">
                <MoneyText value={data.stockValue} variant="total" />
              </KpiCard>
            )}
            {data.udhaarOutstanding !== undefined && (
              <KpiCard label="Udhaar outstanding">
                <MoneyText value={data.udhaarOutstanding} variant="total" udhaar />
              </KpiCard>
            )}
          </>
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
            Low stock
          </Typography>
          {isLoading || !data ? (
            <Skeleton variant="rounded" height={120} />
          ) : data.lowStock.length === 0 ? (
            <EmptyState message="Nothing low on stock" />
          ) : (
            <List disablePadding>
              {data.lowStock.map((item) => (
                <ListItem
                  key={`${item.itemKind}-${item.itemId}`}
                  disableGutters
                  secondaryAction={
                    <Box component="span" sx={{ fontFamily: monoFamily }}>
                      {qtyFmt(item.currentQty, item.unit)} / {qtyFmt(item.reorderLevel, item.unit)}
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Link href={item.itemKind === 'RAW' ? '/materials' : '/products'} style={{ color: 'inherit' }}>
                        {item.name}
                      </Link>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
            Expiring soon
          </Typography>
          {isLoading || !data ? (
            <Skeleton variant="rounded" height={120} />
          ) : data.expiringSoon.length === 0 ? (
            <EmptyState message="Nothing expiring in the next 30 days" />
          ) : (
            <List disablePadding>
              {data.expiringSoon.map((batch) => {
                const daysLeft = daysUntil(batch.expiryDate);
                return (
                  <ListItem
                    key={batch.batchNo}
                    disableGutters
                    secondaryAction={
                      <Chip
                        label={daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                        size="small"
                        color={expiryChipColor(daysLeft)}
                        variant={expiryChipColor(daysLeft) === 'default' ? 'outlined' : 'filled'}
                      />
                    }
                  >
                    <ListItemText
                      primary={
                        <Link href={`/products`} style={{ color: 'inherit' }}>
                          <Box component="span" sx={{ fontFamily: monoFamily, mr: 1 }}>
                            {batch.batchNo}
                          </Box>
                          {batch.productName}
                        </Link>
                      }
                      secondary={dateFmt(batch.expiryDate)}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Paper>
      </Box>
    </>
  );
}
