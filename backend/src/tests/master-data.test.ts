import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';

setupSuite('master-data');
const app = createApp();
beforeEach(seedUsers);

describe('master data RBAC and shape', () => {
  it('admin creates a material; staff can read it but never sees avgCost', async () => {
    const admin = await loginAgent(app, ADMIN);
    const created = await admin.post('/api/materials').send({
      name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000, reorderLevel: 500,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toHaveProperty('avgCost');

    const staff = await loginAgent(app, STAFF);
    const list = await staff.get('/api/materials');
    expect(list.status).toBe(200);
    expect(list.body.data[0]).not.toHaveProperty('avgCost');
    const one = await staff.get(`/api/materials/${created.body.data._id}`);
    expect(one.body.data).not.toHaveProperty('avgCost');
  });

  it('staff cannot create/edit/delete master data', async () => {
    const staff = await loginAgent(app, STAFF);
    expect((await staff.post('/api/suppliers').send({ name: 'X' })).status).toBe(403);
    expect((await staff.patch('/api/suppliers/64b7f3a2c9e77a0012345678').send({ name: 'X' })).status).toBe(403);
    expect((await staff.delete('/api/suppliers/64b7f3a2c9e77a0012345678')).status).toBe(403);
  });

  it('product with BoM round-trips; staff never sees avgUnitCost', async () => {
    const admin = await loginAgent(app, ADMIN);
    const mat = await admin.post('/api/materials').send({ name: 'Sugar', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000 });
    const prod = await admin.post('/api/products').send({
      name: 'Protein Jar', variant: '1kg', sellingPrice: 2500,
      packagingCostPerUnit: 30, bom: [{ materialId: mat.body.data._id, qtyPerUnit: 900 }],
    });
    expect(prod.status).toBe(201);
    expect(prod.body.data.bom).toHaveLength(1);

    const staff = await loginAgent(app, STAFF);
    const seen = await staff.get(`/api/products/${prod.body.data._id}`);
    expect(seen.body.data).not.toHaveProperty('avgUnitCost');
    expect(seen.body.data).not.toHaveProperty('packagingCostPerUnit');
  });

  it('soft delete hides from list and get', async () => {
    const admin = await loginAgent(app, ADMIN);
    const c = await admin.post('/api/customers').send({ name: 'Ravi', phone: '9999999999' });
    await admin.delete(`/api/customers/${c.body.data._id}`);
    expect((await admin.get(`/api/customers/${c.body.data._id}`)).status).toBe(404);
    expect((await admin.get('/api/customers')).body.total).toBe(0);
  });

  it('invalid id returns 400 INVALID_ID', async () => {
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.get('/api/materials/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});
