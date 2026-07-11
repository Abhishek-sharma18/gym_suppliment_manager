import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Material, StockMovement, Supplier } from '../models';

setupSuite('purchases');
const app = createApp();
beforeEach(seedUsers);

async function seedMasterData() {
  const supplier = await Supplier.create({ name: 'Raw Traders' });
  const whey = await Material.create({ name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000 });
  return { supplier, whey };
}

describe('purchases', () => {
  it('creates PURCHASE_IN movements, converts units, and computes moving average', async () => {
    const { supplier, whey } = await seedMasterData();
    const admin = await loginAgent(app, ADMIN);

    const p1 = await admin.post('/api/purchases').send({
      supplierId: String(supplier._id), date: '2026-07-11', paymentMode: 'CASH',
      items: [{ materialId: String(whey._id), qtyBuyUnit: 10, costPerBuyUnit: 300 }],
    });
    expect(p1.status).toBe(201);
    expect(p1.body.data.totalAmount).toBe(3000);

    let m = (await Material.findById(whey._id))!;
    expect(m.currentQty).toBe(10000); // 10 kg -> 10000 g
    expect(m.avgCost).toBe(0.3);      // 300/kg -> 0.3/g

    await admin.post('/api/purchases').send({
      supplierId: String(supplier._id), date: '2026-07-11', paymentMode: 'UPI',
      items: [{ materialId: String(whey._id), qtyBuyUnit: 10, costPerBuyUnit: 400 }],
    });
    m = (await Material.findById(whey._id))!;
    expect(m.currentQty).toBe(20000);
    expect(m.avgCost).toBe(0.35); // (10000*0.3 + 10000*0.4) / 20000

    expect(await StockMovement.countDocuments({ itemId: whey._id, type: 'PURCHASE_IN' })).toBe(2);
  });

  it('staff can create but their reads are cost-stripped and scoped to own entries', async () => {
    const { supplier, whey } = await seedMasterData();
    const staff = await loginAgent(app, STAFF);
    const admin = await loginAgent(app, ADMIN);

    await admin.post('/api/purchases').send({
      supplierId: String(supplier._id), date: '2026-07-11', paymentMode: 'CASH',
      items: [{ materialId: String(whey._id), qtyBuyUnit: 1, costPerBuyUnit: 500 }],
    });
    const created = await staff.post('/api/purchases').send({
      supplierId: String(supplier._id), date: '2026-07-11', paymentMode: 'CASH',
      items: [{ materialId: String(whey._id), qtyBuyUnit: 2, costPerBuyUnit: 450 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).not.toHaveProperty('totalAmount');
    expect(created.body.data.items[0]).not.toHaveProperty('costPerBuyUnit');

    const staffList = await staff.get('/api/purchases');
    expect(staffList.body.total).toBe(1); // own entry only
    const adminList = await admin.get('/api/purchases');
    expect(adminList.body.total).toBe(2);
    expect(adminList.body.data[0].totalAmount).toBeDefined();
  });

  it('rejects a purchase for an unknown material and rolls everything back', async () => {
    const { supplier, whey } = await seedMasterData();
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.post('/api/purchases').send({
      supplierId: String(supplier._id), date: '2026-07-11', paymentMode: 'CASH',
      items: [
        { materialId: String(whey._id), qtyBuyUnit: 5, costPerBuyUnit: 300 },
        { materialId: '64b7f3a2c9e77a0012345678', qtyBuyUnit: 1, costPerBuyUnit: 100 },
      ],
    });
    expect(res.status).toBe(404);
    expect((await Material.findById(whey._id))!.currentQty).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);
  });
});
