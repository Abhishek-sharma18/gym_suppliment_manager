import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';

setupSuite('auth');
const app = createApp();

beforeEach(seedUsers);

describe('auth', () => {
  it('logs in with correct credentials, sets an httpOnly cookie, returns user without passwordHash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/token=.*HttpOnly/i);
    expect(res.body.data.email).toBe(ADMIN.email);
    expect(res.body.data.role).toBe('admin');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'nope-nope-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });

  it('rejects an unknown email with the same 401 envelope (no account-existence leak)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.local', password: 'whatever-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });

  it('GET /me requires auth and returns the logged-in user', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const agent = await loginAgent(app, STAFF);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(STAFF.email);
  });

  it('logout clears the session', async () => {
    const agent = await loginAgent(app, ADMIN);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
