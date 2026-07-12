'use client';

import { createTheme } from '@mui/material/styles';
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700'] });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'] });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'] });

export const monoFamily = mono.style.fontFamily;

export const KHATA = {
  red: '#7B1F24',
  redDark: '#5E1519',
  brass: '#A87900',
  paper: '#FBFAF8',
  ink: '#1F1B18',
  inkMuted: '#6B6259',
  line: '#E7E1D8',
} as const;

const displayHeading = { fontFamily: display.style.fontFamily, fontWeight: 700 };

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: KHATA.red, dark: KHATA.redDark },
    secondary: { main: KHATA.brass },
    background: { default: KHATA.paper, paper: '#FFFFFF' },
    text: { primary: KHATA.ink, secondary: KHATA.inkMuted },
    divider: KHATA.line,
    error: { main: '#B3261E' },
    success: { main: '#2E6B34' },
  },
  typography: {
    fontFamily: body.style.fontFamily,
    h1: displayHeading,
    h2: displayHeading,
    h3: displayHeading,
    h4: { ...displayHeading, fontWeight: 600 },
    h5: { ...displayHeading, fontWeight: 600 },
    h6: { ...displayHeading, fontWeight: 600 },
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: { backgroundColor: '#FFFFFF', borderBottom: `1px solid ${KHATA.line}` },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
