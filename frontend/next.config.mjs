/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gym/shared'],
  // The E2E suite runs its own `next dev` alongside a real dev server that may already be
  // running in this same directory (port 3000). Next's dev lock file lives under distDir,
  // keyed by directory rather than port, so without a separate distDir the two collide with
  // "Another next dev server is already running". Playwright's webServer sets E2E_DIST_DIR;
  // normal dev (`npm run dev:web`) never sets it, so this is a no-op outside E2E.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
};

export default nextConfig;
