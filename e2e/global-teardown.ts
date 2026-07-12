import dns from 'node:dns';
import mongoose from 'mongoose';
import { getE2eMongoUri } from './env.mjs';

dns.setServers(['8.8.8.8', '1.1.1.1']);

export default async function globalTeardown(): Promise<void> {
  const mongoUri = getE2eMongoUri();

  console.log('[e2e] Dropping gymdb_e2e (teardown)...');
  await mongoose.connect(mongoUri);
  // Same exact-name guard as global-setup: assert the actual connected database name.
  if (mongoose.connection.name !== 'gymdb_e2e') {
    await mongoose.disconnect();
    throw new Error('Refusing to run E2E global teardown: connected database is not gymdb_e2e.');
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
