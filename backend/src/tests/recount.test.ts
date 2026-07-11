import mongoose from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Customer, Material, Product, User } from '../models';
import { postMovement } from '../services/ledger';

setupSuite('recount');
const app = createApp();
beforeEach(seedUsers);

async function seedShop() {
  const material = await Material.create({
    name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000, currentQty: 0,
  });
  const product = await Product.create({
    name: 'Protein Jar', sellingPrice: 2500, currentQty: 0, avgUnitCost: 348.5, bom: [],
  });
  const customer = await Customer.create({ name: 'Ravi', phone: '9999999999' });
  const admin = (await User.findOne({ email: ADMIN.email }))!;

  await mongoose.connection.transaction(async (session) => {
    await postMovement({
      type: 'PURCHASE_IN', itemKind: 'RAW', itemId: material._id, qty: 500,
      unitCost: 0.35, refType: 'PURCHASE', userId: admin._id,
    }, session);
  });
  await mongoose.connection.transaction(async (session) => {
    await postMovement({
      type: 'PRODUCTION_OUT', itemKind: 'FINISHED', itemId: product._id, qty: 10,
      unitCost: 348.5, refType: 'PRODUCTION', userId: admin._id,
    }, session);
  });

  return { material, product, customer };
}

describe('admin recount', () => {
  it('rejects staff with 403', async () => {
    await seedShop();
    const staff = await loginAgent(app, STAFF);
    const res = await staff.post('/api/admin/recount');
    expect(res.status).toBe(403);
  });

  it('rebuilds drifted stock caches and udhaar caches from the ledger; second run finds nothing', async () => {
    const { material, product, customer } = await seedShop();

    // Create a real udhaar sale through the API first (product cache: 10 -> 9).
    const staff = await loginAgent(app, STAFF);
    const sale = await staff.post('/api/sales').send({
      customerId: String(customer._id), date: '2026-07-11', paymentMode: 'CASH', amountPaid: 1000,
      items: [{ productId: String(product._id), qty: 1, unitPrice: 2500 }],
    });
    expect(sale.status).toBe(201);
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(1500);

    // Deliberately corrupt caches with direct model updates (tests only) to simulate drift.
    await Material.updateOne({ _id: material._id }, { currentQty: 999 });
    await Product.updateOne({ _id: product._id }, { currentQty: 999 });
    await Customer.updateOne({ _id: customer._id }, { udhaarBalance: 42 });

    const admin = await loginAgent(app, ADMIN);
    const res = await admin.post('/api/admin/recount');
    expect(res.status).toBe(200);
    expect(res.body.data.driftsFound).toBe(2);

    const materialDrift = res.body.data.details.find((d: { itemKind: string }) => d.itemKind === 'RAW');
    expect(materialDrift).toMatchObject({
      itemId: String(material._id), name: 'Whey', cachedQty: 999, ledgerQty: 500,
    });
    const productDrift = res.body.data.details.find((d: { itemKind: string }) => d.itemKind === 'FINISHED');
    expect(productDrift).toMatchObject({
      itemId: String(product._id), name: 'Protein Jar', cachedQty: 999, ledgerQty: 9,
    });

    expect(res.body.data.customersFixed).toBe(1);

    // Caches now match the ledger.
    expect((await Material.findById(material._id))!.currentQty).toBe(500);
    expect((await Product.findById(product._id))!.currentQty).toBe(9);
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(1500);

    // A second recount finds nothing left to fix.
    const res2 = await admin.post('/api/admin/recount');
    expect(res2.status).toBe(200);
    expect(res2.body.data.driftsFound).toBe(0);
    expect(res2.body.data.details).toEqual([]);
    expect(res2.body.data.customersFixed).toBe(0);
  });
});
