import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

// Public landing route: a plain server component so this page stays statically prerendered (no
// auth check, no data fetching here). All interactivity - the GSAP entrance animation and the
// scroll-triggered features stagger - lives in the client component it renders.
export const metadata: Metadata = {
  title: 'Gym Khata - stock, sales and udhaar, one honest ledger',
  description: "Your gym's stock, sales and udhaar - one honest ledger. Built for the shop counter.",
};

export default function Page() {
  return <LandingPage />;
}
