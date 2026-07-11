import mongoose from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Material, StockMovement, User } from '../models';
import { postMovement } from '../services/ledger';

setupSuite('ledger');
const app = createApp();
beforeEach(seedUsers);

async function makeMaterial(qty = 0) {
  return Material.create({ name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000, currentQty: qty });
}

describe('postMovement', () => {
  it('writes the movement and updates the cache atomically', async () => {
    const m = await makeMaterial(0);
    const admin = (await User.findOne({ email: ADMIN.email }))!;
    await mongoose.connection.transaction(async (session) => {
      const { newQty } = await postMovement({
        type: 'PURCHASE_IN', itemKind: 'RAW', itemId: m._id, qty: 500,
        unitCost: 0.35, refType: 'PURCHASE', userId: admin._id,
      }, session);
      expect(newQty).toBe(500);
    });
    expect((await Material.findById(m._id))!.currentQty).toBe(500);
    expect(await StockMovement.countDocuments({ itemId: m._id })).toBe(1);
  });

  it('rejects overdraw with 409 and persists NOTHING (transaction rolls back)', async () => {
    const m = await makeMaterial(100);
    const admin = (await User.findOne({ email: ADMIN.email }))!;
    await expect(mongoose.connection.transaction(async (session) => {
      await postMovement({
        type: 'SALE_OUT', itemKind: 'RAW', itemId: m._id, qty: -50, refType: 'SALE', userId: admin._id,
      }, session);
      await postMovement({
        type: 'SALE_OUT', itemKind: 'RAW', itemId: m._id, qty: -80, refType: 'SALE', userId: admin._id,
      }, session);
    })).rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
    expect((await Material.findById(m._id))!.currentQty).toBe(100);
    expect(await StockMovement.countDocuments({ itemId: m._id })).toBe(0);
  });

  it('rejects zero qty', async () => {
    const m = await makeMaterial(10);
    const admin = (await User.findOne({ email: ADMIN.email }))!;
    await expect(mongoose.connection.transaction(async (session) =>
      postMovement({ type: 'ADJUSTMENT', itemKind: 'RAW', itemId: m._id, qty: 0, refType: 'ADJUSTMENT', userId: admin._id }, session),
    )).rejects.toMatchObject({ status: 400 });
  });
});

describe('adjustment + movements routes', () => {
  it('staff cannot adjust; admin can; movements list shows it (staff without unitCost)', async () => {
    const m = await makeMaterial(40);
    const staff = await loginAgent(app, STAFF);
    const body = { itemKind: 'RAW', itemId: String(m._id), qty: -5, note: 'recount: 5 jars short' };
    expect((await staff.post('/api/movements/adjustments').send(body)).status).toBe(403);

    const admin = await loginAgent(app, ADMIN);
    const res = await admin.post('/api/movements/adjustments').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.newQty).toBe(35);

    const adminList = await admin.get(`/api/movements?itemId=${m._id}&type=ADJUSTMENT`);
    expect(adminList.body.total).toBe(1);
    expect(adminList.body.data[0].qty).toBe(-5);

    const staffList = await staff.get(`/api/movements?itemId=${m._id}`);
    expect(staffList.body.data[0]).not.toHaveProperty('unitCost');
  });
});
