// Derives the E2E MongoDB URI from backend/.env WITHOUT ever printing it.
//
// dotenv (used by backend/src/server.ts and backend/src/seed.ts) never overrides an
// env var that is already set on process.env before dotenv.config() runs. So: read
// backend/.env here, swap the "/gymdb" database path segment for "/gymdb_e2e", and
// hand that string to child processes via their spawn `env` — the real gymdb is
// never touched by the E2E suite.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Resolved relative to the Playwright run's cwd (the repo root, where playwright.config.ts
// lives) rather than import.meta.url - Playwright's own config loader transforms this file
// through a pipeline that doesn't support import.meta in every code path.
const BACKEND_ENV_PATH = path.resolve(process.cwd(), 'backend', '.env');

/** Reads backend/.env and returns the MONGO_URI value with /gymdb -> /gymdb_e2e. Never logs it. */
export function getE2eMongoUri() {
  let raw;
  try {
    raw = readFileSync(BACKEND_ENV_PATH, 'utf8');
  } catch {
    throw new Error(`Could not read backend/.env at ${BACKEND_ENV_PATH} - is it set up?`);
  }

  const line = raw.split(/\r?\n/).find((l) => l.startsWith('MONGO_URI='));
  if (!line) {
    throw new Error('MONGO_URI is not set in backend/.env - cannot derive an E2E database URI.');
  }

  const uri = line.slice('MONGO_URI='.length).trim();
  if (!uri || uri.includes('your_mongodb_connection_string')) {
    throw new Error('MONGO_URI in backend/.env is a placeholder - cannot run E2E tests without a real Atlas URI.');
  }

  // Anchored: only replace "/gymdb" when it is the entire database path segment (i.e.
  // followed by another "/", the "?" query string, or end of string) - never a prefix of a
  // longer db name (/gymdb_prod) or an incidental substring elsewhere in the URI.
  const e2eUri = uri.replace(/\/gymdb(?=[/?]|$)/, '/gymdb_e2e');
  if (e2eUri === uri) {
    throw new Error('backend/.env MONGO_URI does not contain a /gymdb database segment - cannot derive e2e database');
  }

  return e2eUri;
}

export const E2E_API_PORT = 5001;
export const E2E_WEB_PORT = 3001;
export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;
