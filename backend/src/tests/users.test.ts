import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';

setupSuite('users');
const app = createApp();
beforeEach(seedUsers);

describe('users admin CRUD', () => {
  it('blocks staff entirely', async () => {
    const staff = await loginAgent(app, STAFF);
    expect((await staff.get('/api/users')).status).toBe(403);
    expect((await staff.post('/api/users').send({})).status).toBe(403);
  });

  it('admin creates a user; passwordHash never leaks; new user can login', async () => {
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.post('/api/users').send({
      name: 'New Staff', email: 'new@test.local', password: 'password-123', role: 'staff',
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    await loginAgent(app, { email: 'new@test.local', password: 'password-123' });
  });

  it('lists with pagination envelope and search', async () => {
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.get('/api/users?search=counter');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(res.body.data[0].email).toBe(STAFF.email);
  });

  it('deactivating a user blocks their login; admin cannot deactivate self', async () => {
    const admin = await loginAgent(app, ADMIN);
    const list = await admin.get('/api/users?search=counter');
    const staffId = list.body.data[0]._id;
    expect((await admin.delete(`/api/users/${staffId}`)).status).toBe(200);
    const relogin = await (await import('supertest')).default(app)
      .post('/api/auth/login').send({ email: STAFF.email, password: STAFF.password });
    expect(relogin.status).toBe(401);

    const me = await admin.get('/api/auth/me');
    expect((await admin.delete(`/api/users/${me.body.data._id}`)).status).toBe(400);
  });
});
