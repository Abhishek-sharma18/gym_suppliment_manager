import dns from 'node:dns';
import path from 'node:path';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { getE2eMongoUri } from './env.mjs';

// Same fix as backend/src/config/db.ts: this machine's Node resolver can't do the
// mongodb+srv SRV lookup, so route DNS through public resolvers instead.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// playwright.config.ts lives at the repo root, and Playwright always resolves
// globalSetup relative to the config file's directory / runs with that as cwd.
const BACKEND_DIR = path.resolve(process.cwd(), 'backend');

function runSeed(mongoUri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'src/seed.ts'], {
      cwd: BACKEND_DIR,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, MONGO_URI: mongoUri },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`E2E seed script exited with code ${code}`));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  const mongoUri = getE2eMongoUri();

  console.log('[e2e] Dropping gymdb_e2e (fresh slate for this run)...');
  await mongoose.connect(mongoUri);
  // Defense in depth: assert the ACTUAL connected database name (as the driver parsed the
  // URI), not a substring check on the URI string - never drop anything but the dedicated
  // E2E database, even if getE2eMongoUri's derivation logic ever regresses.
  if (mongoose.connection.name !== 'gymdb_e2e') {
    await mongoose.disconnect();
    throw new Error('Refusing to run E2E global setup: connected database is not gymdb_e2e.');
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log('[e2e] Seeding gymdb_e2e...');
  await runSeed(mongoUri);
}
