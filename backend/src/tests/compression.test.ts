import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, loginAgent, seedUsers } from './helpers/auth';

setupSuite('compression');
const app = createApp();
beforeEach(seedUsers);

describe('response compression', () => {
  it('gzips a JSON list response over the configured threshold when the client accepts it', async () => {
    const admin = await loginAgent(app, ADMIN);

    // compression() is configured with threshold: 512 (see app.ts) so tiny responses like
    // /api/health are skipped. Seed enough materials that the serialized list body clears
    // that threshold, so this test actually exercises the gzip path rather than the
    // below-threshold no-op path.
    for (let i = 0; i < 20; i += 1) {
      const res = await admin.post('/api/materials').send({
        name: `Compression Test Material ${i}`,
        buyUnit: 'kg',
        useUnit: 'g',
        conversionFactor: 1000,
        reorderLevel: 500,
      });
      expect(res.status).toBe(201);
    }

    // supertest/superagent doesn't auto-negotiate encoding, so set it explicitly.
    const res = await admin.get('/api/materials').set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.data.length).toBe(20);
  });

  it('does not set content-encoding on a below-threshold response like health', async () => {
    const res = await request(createApp()).get('/api/health').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
