import dns from 'node:dns';
import mongoose from 'mongoose';
import { getE2eMongoUri } from './env.mjs';

dns.setServers(['8.8.8.8', '1.1.1.1']);

export default async function globalTeardown(): Promise<void> {
  const mongoUri = getE2eMongoUri();

  if (!mongoUri.includes('/gymdb_e2e')) {
    throw new Error('Refusing to run E2E global teardown: derived URI does not target gymdb_e2e.');
  }

  console.log('[e2e] Dropping gymdb_e2e (teardown)...');
  await mongoose.connect(mongoUri);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
