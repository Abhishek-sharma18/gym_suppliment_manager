import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Customer, Material, Product, Supplier } from '../models';

setupSuite('reports');
const app = createApp();
beforeEach(seedUsers);

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe('reports', () => {
  it('runs a full purchase -> production -> sales -> expense flow and reports on it', async () => {
    const today = new Date();
    const todayStr = isoDay(today);
    const month = today.toISOString().slice(0, 7);
    const oneYearOut = new Date(today);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    const expiryStr = isoDay(oneYearOut);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const admin = await loginAgent(app, ADMIN);
    const staff = await loginAgent(app, STAFF);

    const supplier = await Supplier.create({ name: 'Raw Traders' });
    const whey = await Material.create({
      name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000,
    });
    const jar = await Product.create({
      name: 'Protein Jar', sellingPrice: 2500, packagingCostPerUnit: 30,
      bom: [{ materialId: whey._id, qtyPerUnit: 900 }],
    });
    const customer = await Customer.create({ name: 'Ravi', phone: '9999999999' });

    // Purchase 10kg whey at Rs 350/kg -> avgCost 0.35/g. NOTE: the task brief's prose says "@300",
    // but tracing the brief's own downstream numbers (rawValue=315=900*0.35, unitCost=348.5, which
    // needs materialCost=3185=9100*0.35, costOfGoodsSold=1045.5=3*348.5) only holds together at
    // avgCost=0.35, i.e. a purchase price of 350/kg. 300/kg would give avgCost 0.3 and every one of
    // those numbers would come out different. Using 350/kg here so the specified expected numbers
    // (the actual acceptance criteria) hold exactly; flagged in the task report.
    const purchase = await admin.post('/api/purchases').send({
      supplierId: String(supplier._id), date: todayStr, paymentMode: 'CASH',
      items: [{ materialId: String(whey._id), qtyBuyUnit: 10, costPerBuyUnit: 350 }],
    });
    expect(purchase.status).toBe(201);
    expect((await Material.findById(whey._id))!.avgCost).toBe(0.35);

    const batch = await admin.post('/api/production').send({
      productId: String(jar._id), qtyProduced: 10, date: todayStr, expiryDate: expiryStr,
      materialsConsumed: [{ materialId: String(whey._id), actualQty: 9000, wastageQty: 100 }],
    });
    expect(batch.status).toBe(201);
    expect(batch.body.data.costSnapshot.unitCost).toBe(348.5);

    const sale1 = await admin.post('/api/sales').send({
      date: todayStr, paymentMode: 'CASH', amountPaid: 4900, discount: 100,
      items: [{ productId: String(jar._id), qty: 2, unitPrice: 2500 }],
    });
    expect(sale1.status).toBe(201);
    expect(sale1.body.data.total).toBe(4900);

    const sale2 = await admin.post('/api/sales').send({
      customerId: String(customer._id), date: todayStr, paymentMode: 'CASH', amountPaid: 0,
      items: [{ productId: String(jar._id), qty: 1, unitPrice: 2500 }],
    });
    expect(sale2.status).toBe(201);
    expect(sale2.body.data.udhaarAmount).toBe(2500);

    const expense = await admin.post('/api/expenses').send({
      category: 'RENT', amount: 5000, date: todayStr,
    });
    expect(expense.status).toBe(201);

    // --- /api/reports/profit ---
    const profit = await admin.get('/api/reports/profit').query({ month });
    expect(profit.status).toBe(200);
    expect(profit.body.data).toMatchObject({
      month,
      revenue: 7400,
      costOfGoodsSold: 1045.5,
      grossProfit: 6354.5,
      overhead: 5000,
      unitsProduced: 10,
      unitsSold: 3,
      overheadPerUnit: 500,
      netProfit: 1354.5,
    });
    expect((await staff.get('/api/reports/profit').query({ month })).status).toBe(403);

    // --- /api/reports/stock-value ---
    const stockValue = await admin.get('/api/reports/stock-value');
    expect(stockValue.status).toBe(200);
    expect(stockValue.body.data).toEqual({ rawValue: 315, finishedValue: 2439.5, totalValue: 2754.5 });
    expect((await staff.get('/api/reports/stock-value')).status).toBe(403);

    // --- /api/reports/dashboard ---
    const dashAdmin = await admin.get('/api/reports/dashboard');
    expect(dashAdmin.status).toBe(200);
    expect(dashAdmin.body.data.todaySalesCount).toBe(2);
    expect(dashAdmin.body.data.todaySalesTotal).toBe(7400);
    expect(dashAdmin.body.data.stockValue).toBe(2754.5);
    expect(dashAdmin.body.data.udhaarOutstanding).toBe(2500);

    const dashStaff = await staff.get('/api/reports/dashboard');
    expect(dashStaff.status).toBe(200);
    expect(dashStaff.body.data).not.toHaveProperty('todaySalesTotal');
    expect(dashStaff.body.data).not.toHaveProperty('stockValue');
    expect(dashStaff.body.data).not.toHaveProperty('udhaarOutstanding');
    expect(dashStaff.body.data.todaySalesCount).toBe(2);
    expect(dashStaff.body.data).toHaveProperty('lowStock');
    expect(dashStaff.body.data).toHaveProperty('expiringSoon');

    // --- /api/reports/low-stock ---
    const patched = await admin.patch(`/api/materials/${whey._id}`).send({ reorderLevel: 1000 });
    expect(patched.status).toBe(200); // remaining qty 900 < reorderLevel 1000
    const lowStock = await admin.get('/api/reports/low-stock');
    expect(lowStock.status).toBe(200);
    expect(lowStock.body.data.some((i: { itemId: string }) => i.itemId === String(whey._id))).toBe(true);

    // --- /api/reports/expiring ---
    // days is capped at 365 by the shared expiringQuery schema; expiryDate is exactly one year out.
    const exp365 = await admin.get('/api/reports/expiring').query({ days: 365 });
    expect(exp365.status).toBe(200);
    expect(exp365.body.data.some((b: { batchNo: string }) => b.batchNo === batch.body.data.batchNo)).toBe(true);
    const exp5 = await admin.get('/api/reports/expiring').query({ days: 5 });
    expect(exp5.body.data.some((b: { batchNo: string }) => b.batchNo === batch.body.data.batchNo)).toBe(false);

    // --- /api/reports/udhaar ---
    const udhaar = await admin.get('/api/reports/udhaar');
    expect(udhaar.status).toBe(200);
    const entry = udhaar.body.data.find((e: { customerId: string }) => e.customerId === String(customer._id));
    expect(entry).toBeDefined();
    expect(entry.balance).toBe(2500);

    // --- /api/reports/sales-summary ---
    const query = { from: todayStr, to: isoDay(tomorrow) };
    const summaryStaff = await staff.get('/api/reports/sales-summary').query(query);
    expect(summaryStaff.status).toBe(200);
    expect(summaryStaff.body.data.count).toBe(2);
    expect(summaryStaff.body.data).not.toHaveProperty('revenue');
    for (const mode of summaryStaff.body.data.byPaymentMode) {
      expect(mode).toHaveProperty('count');
      expect(mode).not.toHaveProperty('total');
    }

    const summaryAdmin = await admin.get('/api/reports/sales-summary').query(query);
    expect(summaryAdmin.status).toBe(200);
    expect(summaryAdmin.body.data.count).toBe(2);
    expect(summaryAdmin.body.data.revenue).toBe(7400);
  });
});
