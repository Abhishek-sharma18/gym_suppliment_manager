import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

export function setupSuite(dbName: string): void {
  beforeAll(async () => {
    const uri = process.env.MONGO_TEST_URI;
    if (!uri) throw new Error('MONGO_TEST_URI not set - globalSetup did not run');
    await mongoose.connect(uri, { dbName });
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}
