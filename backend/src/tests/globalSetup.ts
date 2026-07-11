import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet;

export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_TEST_URI = replSet.getUri();
  process.env.JWT_SECRET = 'test-secret';
}

export async function teardown(): Promise<void> {
  await replSet.stop();
}
