import { defineConfig, devices } from '@playwright/test';
import { getE2eMongoUri, E2E_API_PORT, E2E_WEB_PORT, E2E_API_URL, E2E_WEB_URL } from './e2e/env.mjs';

// Derived once at config-load time from backend/.env (never printed - see e2e/env.mjs).
// Passed to the API's webServer entry below so dotenv (which never overrides an
// already-set env var) leaves it alone: the E2E API always talks to gymdb_e2e, never
// the real gymdb.
const mongoUri = getE2eMongoUri();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Generous: Next dev compiles each route on first visit, and this is a cold start.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: 'backend',
      url: `${E2E_API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        MONGO_URI: mongoUri,
        PORT: String(E2E_API_PORT),
        CLIENT_URL: E2E_WEB_URL,
      },
    },
    {
      // `next dev` reads NEXT_PUBLIC_API_URL at startup (unlike a prod build, which
      // bakes it in at build time), so this env override takes effect with no rebuild.
      command: `npx next dev -p ${E2E_WEB_PORT}`,
      cwd: 'frontend',
      url: E2E_WEB_URL,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        NEXT_PUBLIC_API_URL: `${E2E_API_URL}/api`,
        // Keeps this dev server's lock file separate from any real `next dev` (port 3000)
        // already running in the same frontend/ directory - see next.config.mjs.
        E2E_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
