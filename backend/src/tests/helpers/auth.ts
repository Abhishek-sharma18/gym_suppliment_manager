import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { User } from '../../models';

export const ADMIN = { name: 'Owner', email: 'admin@test.local', password: 'admin-pass-123', role: 'admin' as const };
export const STAFF = { name: 'Counter', email: 'staff@test.local', password: 'staff-pass-123', role: 'staff' as const };

export async function seedUsers(): Promise<void> {
  for (const u of [ADMIN, STAFF]) {
    await User.create({ name: u.name, email: u.email, passwordHash: await bcrypt.hash(u.password, 4), role: u.role });
  }
}

export async function loginAgent(app: Express, who: { email: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: who.email, password: who.password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
