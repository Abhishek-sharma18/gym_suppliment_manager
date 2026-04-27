'use client';

import { useEffect, useRef } from 'react';
import NextLink from 'next/link';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { KHATA } from '@/lib/theme';
import { LedgerHero } from './LedgerHero';

// The rupee sign, written as an escape so the source file itself stays ASCII-only.
const RUPEE = '\u20B9';

const TOTAL = 8500;

// Minimal local shape for gsap's matchMedia callback argument - deliberately narrower than
// gsap's own (richer) Context type so this file doesn't depend on its exact shape.
type MatchMediaContext = { conditions: { isMobile: boolean; reduceMotion: boolean } };

function formatTotal(value: number): string {
  return `${RUPEE}${Math.round(value).toLocaleString('en-IN')}`;
}

const FEATURES = [
  {
    icon: <MenuBookOutlinedIcon />,
    title: 'Immutable stock ledger',
    body: "Every movement is a permanent entry - nothing is ever quietly edited.",
  },
  {
    icon: <PointOfSaleOutlinedIcon />,
    title: 'Fast counter sales',
    body: 'Ring up a sale in seconds, cash or udhaar, from any phone.',
  },
  {
    icon: <AccountBalanceWalletOutlinedIcon />,
    title: 'Udhaar khata',
    body: 'Track what every customer owes, and settle it with one tap.',
  },
  {
    icon: <TrendingUpOutlinedIcon />,
    title: 'Profit you can trust',
    body: 'Costs, margins and expenses computed straight from the ledger.',
  },
] as const;

/**
 * The public landing page. Static, no auth, no API calls - the GSAP entrance sequence (the
 * "ledger that writes itself" hero) and the scroll-triggered features stagger are the only
 * dynamic behaviour, both driven by a single client-side effect. `gsap` and `ScrollTrigger` are
 * dynamically imported inside that effect so neither ships in, nor executes during, server
 * rendering - the plugin is registered only once JS actually runs in the browser.
 */
export function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const featuresRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ctx: { revert: () => void } | undefined;

    (async () => {
      const [gsapModule, scrollTriggerModule] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (cancelled) return;

      const gsap = gsapModule.gsap ?? gsapModule.default;
      const { ScrollTrigger } = scrollTriggerModule;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        mm.add(
          {
            isMobile: '(max-width: 599.95px)',
            reduceMotion: '(prefers-reduced-motion: reduce)',
          },
          (context: MatchMediaContext) => {
            const { isMobile, reduceMotion } = context.conditions;

            const lines = gsap.utils.toArray('.ledger-rule') as SVGLineElement[];
            const doubleRule = gsap.utils.toArray('.ledger-double-rule') as SVGLineElement[];
            const rows = gsap.utils.toArray('.ledger-entry') as HTMLElement[];
            const totalEl = rootRef.current?.querySelector<HTMLElement>('.ledger-total') ?? null;
            const cursorEl = rootRef.current?.querySelector<HTMLElement>('.ledger-cursor') ?? null;
            const featureItems = gsap.utils.toArray('.feature-item') as HTMLElement[];

            if (reduceMotion) {
              // Reduced motion: every end-state rendered immediately, nothing animates or loops.
              gsap.set(lines, { strokeDashoffset: 0 });
              gsap.set(doubleRule, { strokeDashoffset: 0 });
              gsap.set(rows, { opacity: 1, y: 0 });
              gsap.set(featureItems, { opacity: 1, y: 0 });
              if (totalEl) totalEl.textContent = formatTotal(TOTAL);
              if (cursorEl) gsap.set(cursorEl, { opacity: 0 });
              return;
            }

            const scale = isMobile ? 0.7 : 1;
            const counter = { value: 0 };

            const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
            tl.to(lines, { strokeDashoffset: 0, duration: 0.5 * scale, stagger: 0.12 * scale })
              .to(rows, { opacity: 1, y: 0, duration: 0.35 * scale, stagger: 0.3 * scale }, '-=0.15')
              .to(
                counter,
                {
                  value: TOTAL,
                  duration: 0.7 * scale,
                  ease: 'power2.out',
                  onUpdate: () => {
                    if (totalEl) totalEl.textContent = formatTotal(counter.value);
                  },
                },
                '-=0.1',
              )
              .to(doubleRule, { strokeDashoffset: 0, duration: 0.4 * scale }, '-=0.1')
              .add(() => {
                if (cursorEl) {
                  gsap.set(cursorEl, { opacity: 1 });
                  gsap.to(cursorEl, { opacity: 0, duration: 0.6, repeat: -1, yoyo: true, ease: 'steps(1)' });
                }
              });

            gsap.from(featureItems, {
              opacity: 0,
              y: 16,
              duration: 0.5,
              stagger: 0.15,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: featuresRef.current,
                start: 'top 85%',
              },
            });
          },
        );
      }, rootRef);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <Box ref={rootRef} sx={{ bgcolor: KHATA.paper, color: KHATA.ink, minHeight: '100vh', overflowX: 'hidden' }}>
      <Container maxWidth="lg">
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', py: { xs: 2, sm: 2.5 } }}>
          <Typography component="div" variant="h6" sx={{ color: KHATA.ink }}>
            Gym Khata
          </Typography>
          <Button component={NextLink} href="/login" variant="text" sx={{ color: KHATA.ink }}>
            Log in
          </Button>
        </Stack>
      </Container>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 7 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'center',
            gap: { xs: 5, md: 8 },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h2"
              component="h1"
              sx={{ fontSize: { xs: '2.1rem', sm: '2.6rem', md: '3.25rem' }, lineHeight: 1.1, mb: 2 }}
            >
              Gym Khata
            </Typography>
            <Typography
              variant="h6"
              component="p"
              sx={{ fontWeight: 400, color: 'text.secondary', mb: 3, maxWidth: 440 }}
            >
              Your gym&apos;s stock, sales and udhaar - one honest ledger.
            </Typography>
            <Button component={NextLink} href="/login" variant="contained" color="primary" size="large">
              Get started
            </Button>
          </Box>

          <Box sx={{ flex: 1, width: '100%', maxWidth: { xs: 360, md: 440 }, mx: { xs: 'auto', md: 0 } }}>
            <LedgerHero />
          </Box>
        </Box>
      </Container>

      <Box ref={featuresRef} sx={{ borderTop: `1px solid ${KHATA.line}`, py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap', gap: { xs: 3, sm: 4 } }}>
            {FEATURES.map((feature) => (
              <Box key={feature.title} className="feature-item" sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Box sx={{ color: KHATA.red, display: 'flex', mb: 1 }}>{feature.icon}</Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      <Box component="footer" sx={{ borderTop: `1px solid ${KHATA.line}`, py: 3 }}>
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
          >
            <Typography variant="caption" color="text.secondary">
              Built for the shop counter - works on your phone.
            </Typography>
            <Typography variant="caption">
              <NextLink href="/login" style={{ color: KHATA.ink }}>
                Log in
              </NextLink>
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
