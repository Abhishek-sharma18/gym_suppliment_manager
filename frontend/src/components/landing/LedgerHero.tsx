import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { KHATA, monoFamily } from '@/lib/theme';

/**
 * The purely visual markup for the "ledger that writes itself" hero moment: a hand-ruled khata
 * page (SVG rule lines + a hand-ruled double rule under the total) with mono entry rows written
 * on top. No animation logic lives here - LandingPage's GSAP effect finds these elements by
 * className (scoped to its root ref) and drives them. The initial (pre-JS / SSR) state is baked
 * into the markup itself (rule lines undrawn via stroke-dashoffset, rows/total transparent) so
 * there is no hydration mismatch: JS simply animates from exactly what was already painted.
 */

// Straight horizontal lines - the dash length is just (x2 - x1), no DOM measurement needed, so
// the "undrawn" starting state can be computed at render time and matches on server and client.
const RULE_X1 = 8;
const RULE_X2 = 392;
const RULE_LENGTH = RULE_X2 - RULE_X1;

const ENTRIES = [
  { label: 'PURCHASE_IN', detail: '+10,000 g' },
  { label: 'SALE_OUT', detail: '-2 jars' },
  { label: 'PAYMENT', detail: '\u20B91,500' },
] as const;

// Vertical layout: four ~18%-tall "slots" (three entries + total), each entry row sits just above
// its rule line; the double rule closes the block underneath the total.
const ROW_TOP = ['6%', '30%', '54%'] as const;
const RULE_Y = [66, 128, 190] as const;
const TOTAL_TOP = '76%';
const DOUBLE_RULE_Y = [244, 254] as const;

export function LedgerHero() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        bgcolor: '#FFFFFF',
        border: `1px solid ${KHATA.line}`,
        borderRadius: 1.5,
        p: { xs: 2, sm: 3 },
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {RULE_Y.map((y) => (
          <line
            key={y}
            className="ledger-rule"
            x1={RULE_X1}
            y1={y}
            x2={RULE_X2}
            y2={y}
            stroke={KHATA.line}
            strokeWidth={1.5}
            strokeDasharray={RULE_LENGTH}
            strokeDashoffset={RULE_LENGTH}
          />
        ))}
        {DOUBLE_RULE_Y.map((y) => (
          <line
            key={y}
            className="ledger-double-rule"
            x1={RULE_X1}
            y1={y}
            x2={RULE_X2}
            y2={y}
            stroke={KHATA.ink}
            strokeWidth={3}
            strokeDasharray={RULE_LENGTH}
            strokeDashoffset={RULE_LENGTH}
          />
        ))}
      </svg>

      {ENTRIES.map((entry, i) => (
        <Box
          key={entry.label}
          className="ledger-entry"
          sx={{
            position: 'absolute',
            top: ROW_TOP[i],
            left: '2%',
            right: '2%',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
            opacity: 0,
            transform: 'translateY(8px)',
            fontFamily: monoFamily,
            fontSize: { xs: '0.7rem', sm: '0.8rem' },
            color: KHATA.inkMuted,
          }}
        >
          <span>{entry.label}</span>
          <span>{entry.detail}</span>
        </Box>
      ))}

      <Box
        className="ledger-entry"
        sx={{
          position: 'absolute',
          top: TOTAL_TOP,
          left: '2%',
          right: '2%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 1,
          opacity: 0,
          transform: 'translateY(8px)',
        }}
      >
        <Typography
          component="span"
          sx={{ fontFamily: monoFamily, fontSize: { xs: '0.7rem', sm: '0.8rem' }, color: KHATA.inkMuted }}
        >
          BALANCE
        </Typography>
        <Typography
          component="span"
          className="ledger-total"
          sx={{ fontFamily: monoFamily, fontWeight: 500, fontSize: { xs: '1.15rem', sm: '1.4rem' }, color: KHATA.ink }}
        >
          {'\u20B90'}
        </Typography>
        <Box
          component="span"
          className="ledger-cursor"
          sx={{
            fontFamily: monoFamily,
            fontSize: { xs: '1.15rem', sm: '1.4rem' },
            color: KHATA.red,
            opacity: 0,
          }}
          aria-hidden="true"
        >
          _
        </Box>
      </Box>
    </Box>
  );
}
