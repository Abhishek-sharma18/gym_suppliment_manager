import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Material, Product, ProductionBatch, StockMovement } from '../models';

setupSuite('production');
const app = createApp();
beforeEach(seedUsers);

async function seedFactory() {
  const whey = await Material.create({
    name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000, currentQty: 10000, avgCost: 0.35,
  });
  const jar = await Product.create({
    name: 'Protein Jar', variant: '1kg', sellingPrice: 2500, packagingCostPerUnit: 30,
    bom: [{ materialId: whey._id, qtyPerUnit: 900 }],
  });
  return { whey, jar };
}

describe('production', () => {
  it('produces a batch: movements, snapshot math, avgUnitCost, batchNo', async () => {
    const { whey, jar } = await seedFactory();
    const admin = await loginAgent(app, ADMIN);

    const res = await admin.post('/api/production').send({
      productId: String(jar._id), qtyProduced: 10, date: '2026-07-11', expiryDate: '2027-07-11',
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 9000, wastageQty: 100 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.batchNo).toMatch(/^B-\d{8}-\d+$/);
    expect(res.body.data.materialsConsumed[0].plannedQty).toBe(9000); // 900 * 10

    // snapshot: materialCost = (9000+100)*0.35 = 3185; packaging = 30*10 = 300; total 3485; unit 348.5
    expect(res.body.data.costSnapshot).toEqual({
      materialCost: 3185, packagingCost: 300, totalCost: 3485, unitCost: 348.5,
    });

    expect((await Material.findById(whey._id))!.currentQty).toBe(900); // 10000 - 9000 - 100
    const p = (await Product.findById(jar._id))!;
    expect(p.currentQty).toBe(10);
    expect(p.avgUnitCost).toBe(348.5);

    expect(await StockMovement.countDocuments({ type: 'PRODUCTION_CONSUME' })).toBe(1);
    expect(await StockMovement.countDocuments({ type: 'WASTAGE' })).toBe(1);
    expect(await StockMovement.countDocuments({ type: 'PRODUCTION_OUT' })).toBe(1);
  });

  it('rejects when materials are insufficient and persists nothing', async () => {
    const { whey, jar } = await seedFactory();
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.post('/api/production').send({
      productId: String(jar._id), qtyProduced: 20, date: '2026-07-11',
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 18000, wastageQty: 0 }],
    });
    expect(res.status).toBe(409);
    expect((await Material.findById(whey._id))!.currentQty).toBe(10000);
    expect(await ProductionBatch.countDocuments()).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);
  });

  it('rejects expiry before production date; rejects product without recipe', async () => {
    const { whey, jar } = await seedFactory();
    const bare = await Product.create({ name: 'No Recipe', sellingPrice: 100 });
    const admin = await loginAgent(app, ADMIN);
    expect((await admin.post('/api/production').send({
      productId: String(jar._id), qtyProduced: 1, date: '2026-07-11', expiryDate: '2026-01-01',
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 900 }],
    })).status).toBe(400);
    expect((await admin.post('/api/production').send({
      productId: String(bare._id), qtyProduced: 1, date: '2026-07-11',
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 900 }],
    })).status).toBe(400);
  });

  it('staff create ok but responses drop costSnapshot and costPerUseUnit; staff list scoped to own', async () => {
    const { whey, jar } = await seedFactory();
    const staff = await loginAgent(app, STAFF);
    const res = await staff.post('/api/production').send({
      productId: String(jar._id), qtyProduced: 2, date: '2026-07-11',
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 1800 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty('costSnapshot');
    expect(res.body.data.materialsConsumed[0]).not.toHaveProperty('costPerUseUnit');

    const admin = await loginAgent(app, ADMIN);
    await admin.post('/api/production').send({
      productId: String(jar._id), qtyProduced: 1, date: '2026-07-11',
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 900 }],
    });
    expect((await staff.get('/api/production')).body.total).toBe(1);
    expect((await admin.get('/api/production')).body.total).toBe(2);
  });
});
