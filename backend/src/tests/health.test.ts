import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

describe('health', () => {
  it('responds ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Gym API is running' });
  });

  it('404s unknown routes with the error envelope', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
