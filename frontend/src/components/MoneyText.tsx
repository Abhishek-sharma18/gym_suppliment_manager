'use client';

import Box from '@mui/material/Box';
import { inr } from '@/lib/fmt';
import { monoFamily, KHATA } from '@/lib/theme';

export interface MoneyTextProps {
  value?: number;
  variant?: 'plain' | 'total';
  udhaar?: boolean;
}

/**
 * Renders an amount in en-IN currency formatting, always in the khata mono family.
 * variant="total" adds the signature hand-ruled double underline used for sale totals,
 * udhaar balances and report money KPIs. udhaar renders the figure in khata red.
 * An undefined value (a staff-stripped admin-only field) renders as a muted em-dash.
 */
export function MoneyText({ value, variant = 'plain', udhaar = false }: MoneyTextProps) {
  const isMissing = value === undefined;

  return (
    <Box
      component="span"
      sx={{
        fontFamily: monoFamily,
        color: isMissing ? 'text.secondary' : udhaar ? KHATA.red : 'inherit',
        fontWeight: udhaar && !isMissing ? 500 : 400,
        ...(variant === 'total'
          ? { display: 'inline-block', borderBottom: '3px double', borderColor: 'text.primary', pb: 0.25 }
          : {}),
      }}
    >
      {inr(value)}
    </Box>
  );
}
