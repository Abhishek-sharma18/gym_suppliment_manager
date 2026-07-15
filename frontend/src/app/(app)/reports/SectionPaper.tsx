'use client';

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';

// Shared by every Reports section, including the dynamically-imported TrendsSection (see
// ./TrendsSection.tsx) — factored out of page.tsx so that dynamic import doesn't have to
// pull the whole page module back into the lazy chart chunk.
export function SectionPaper({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
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
