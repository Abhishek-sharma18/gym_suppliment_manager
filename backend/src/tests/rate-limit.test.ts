import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, seedUsers } from './helpers/auth';

setupSuite('rate-limit');
const app = createApp();
beforeEach(seedUsers);

// The login rate limiter is disabled by default under NODE_ENV=test (so the
// other ~50 loginAgent() calls across the suite never trip it). It is forced
// on here via LOGIN_RATE_LIMIT, which the limiter's skip()/max() read live.
describe('login rate limiting', () => {
  afterEach(() => {
    delete process.env.LOGIN_RATE_LIMIT;
  });

  it('returns 429 with the RATE_LIMITED envelope on the 11th rapid login attempt from one IP', async () => {
    process.env.LOGIN_RATE_LIMIT = '10';
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong-pass' });
      expect(res.status).toBe(401);
    }
    const res11 = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong-pass' });
    expect(res11.status).toBe(429);
    expect(res11.body.error.code).toBe('RATE_LIMITED');
  });
});
