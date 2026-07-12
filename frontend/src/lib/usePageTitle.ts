'use client';

import { useEffect } from 'react';

/**
 * Sets document.title to "{title} — Gym Khata" for the lifetime of the calling page.
 * Client-side only (App Router pages here are 'use client'); Next's <Metadata> export
 * isn't available in client components, so this is the per-page equivalent.
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} — Gym Khata`;
  }, [title]);
}
