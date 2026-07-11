import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Customer, Product, StockMovement } from '../models';

setupSuite('sales');
const app = createApp();
beforeEach(seedUsers);

async function seedShop() {
  const jar = await Product.create({
    name: 'Protein Jar', sellingPrice: 2500, currentQty: 20, avgUnitCost: 348.5,
    bom: [],
  });
  const customer = await Customer.create({ name: 'Ravi', phone: '9999999999' });
  return { jar, customer };
}

describe('sales', () => {
  it('cash sale: stock out, invoice number, totals, unitCostAtSale snapshot', async () => {
    const { jar } = await seedShop();
    const staff = await loginAgent(app, STAFF);
    const res = await staff.post('/api/sales').send({
      date: '2026-07-11', paymentMode: 'CASH', amountPaid: 4900, discount: 100,
      items: [{ productId: String(jar._id), qty: 2, unitPrice: 2500 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.invoiceNo).toMatch(/^S-\d{8}-\d+$/);
    expect(res.body.data.subtotal).toBe(5000);
    expect(res.body.data.total).toBe(4900);
    expect(res.body.data.udhaarAmount).toBe(0);
    expect(res.body.data.items[0]).not.toHaveProperty('unitCostAtSale'); // staff-stripped

    expect((await Product.findById(jar._id))!.currentQty).toBe(18);
    expect(await StockMovement.countDocuments({ type: 'SALE_OUT' })).toBe(1);

    const admin = await loginAgent(app, ADMIN);
    const adminView = await admin.get(`/api/sales/${res.body.data._id}`);
    expect(adminView.body.data.items[0].unitCostAtSale).toBe(348.5);
  });

  it('udhaar sale bumps the customer balance; udhaar without customer is rejected', async () => {
    const { jar, customer } = await seedShop();
    const staff = await loginAgent(app, STAFF);

    expect((await staff.post('/api/sales').send({
      date: '2026-07-11', paymentMode: 'CASH', amountPaid: 1000,
      items: [{ productId: String(jar._id), qty: 1, unitPrice: 2500 }],
    })).status).toBe(400); // zod: customerId required for udhaar

    const res = await staff.post('/api/sales').send({
      customerId: String(customer._id), date: '2026-07-11', paymentMode: 'CASH', amountPaid: 1000,
      items: [{ productId: String(jar._id), qty: 1, unitPrice: 2500 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.udhaarAmount).toBe(1500);
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(1500);
  });

  it('insufficient stock returns 409 and rolls back', async () => {
    const { jar } = await seedShop();
    const staff = await loginAgent(app, STAFF);
    const res = await staff.post('/api/sales').send({
      date: '2026-07-11', paymentMode: 'CASH', amountPaid: 0, customerId: undefined,
      items: [{ productId: String(jar._id), qty: 25, unitPrice: 2500 }],
    });
    expect([400, 409]).toContain(res.status); // zod needs customer for the big udhaar OR ledger 409 - assert precisely below
    const res2 = await staff.post('/api/sales').send({
      date: '2026-07-11', paymentMode: 'CASH', amountPaid: 62500,
      items: [{ productId: String(jar._id), qty: 25, unitPrice: 2500 }],
    });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await Product.findById(jar._id))!.currentQty).toBe(20);
  });

  it('returns: admin-only, restocks, reduces udhaar, appends to returns[]', async () => {
    const { jar, customer } = await seedShop();
    const staff = await loginAgent(app, STAFF);
    const sale = await staff.post('/api/sales').send({
      customerId: String(customer._id), date: '2026-07-11', paymentMode: 'CASH', amountPaid: 0,
      items: [{ productId: String(jar._id), qty: 2, unitPrice: 2500 }],
    });
    const saleId = sale.body.data._id;

    expect((await staff.post(`/api/sales/${saleId}/return`).send({
      items: [{ productId: String(jar._id), qty: 1 }],
    })).status).toBe(403);

    const admin = await loginAgent(app, ADMIN);
    const ret = await admin.post(`/api/sales/${saleId}/return`).send({
      items: [{ productId: String(jar._id), qty: 1 }], refundNote: 'damaged seal',
    });
    expect(ret.status).toBe(200);
    expect((await Product.findById(jar._id))!.currentQty).toBe(19);
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(2500); // 5000 - 2500
    expect(ret.body.data.returns).toHaveLength(1);
    expect(ret.body.data.returns[0].udhaarReduced).toBe(2500);
    expect(ret.body.data.returns[0].returnValue).toBe(2500);
    expect(ret.body.data.returns[0].returnCogs).toBe(348.5);
    expect(await StockMovement.countDocuments({ type: 'SALE_RETURN_IN' })).toBe(1);

    expect((await admin.post(`/api/sales/${saleId}/return`).send({
      items: [{ productId: String(jar._id), qty: 2 }],
    })).status).toBe(400); // only 1 left un-returned
  });

  it('return with duplicate productId lines gets 400 and persists nothing', async () => {
    const { jar, customer } = await seedShop();
    const staff = await loginAgent(app, STAFF);
    const sale = await staff.post('/api/sales').send({
      customerId: String(customer._id), date: '2026-07-11', paymentMode: 'CASH', amountPaid: 0,
      items: [{ productId: String(jar._id), qty: 2, unitPrice: 2500 }],
    });
    const saleId = sale.body.data._id;

    const admin = await loginAgent(app, ADMIN);
    const ret = await admin.post(`/api/sales/${saleId}/return`).send({
      items: [
        { productId: String(jar._id), qty: 1 },
        { productId: String(jar._id), qty: 1 },
      ],
    });
    expect(ret.status).toBe(400);
    expect(ret.body.error.code).toBe('DUPLICATE_LINES');
    expect((await Product.findById(jar._id))!.currentQty).toBe(18); // unchanged since the sale
    expect(await StockMovement.countDocuments({ type: 'SALE_RETURN_IN' })).toBe(0);
    const fresh = await admin.get(`/api/sales/${saleId}`);
    expect(fresh.body.data.returns).toHaveLength(0);
  });

  it('multi-line sale of the same product: return aggregates at the weighted average', async () => {
    const { jar, customer } = await seedShop();
    const staff = await loginAgent(app, STAFF);
    const sale = await staff.post('/api/sales').send({
      customerId: String(customer._id), date: '2026-07-11', paymentMode: 'CASH', amountPaid: 0,
      items: [
        { productId: String(jar._id), qty: 1, unitPrice: 2500 },
        { productId: String(jar._id), qty: 1, unitPrice: 2000 },
      ],
    });
    expect(sale.status).toBe(201);
    const saleId = sale.body.data._id;
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(4500);

    const admin = await loginAgent(app, ADMIN);

    // 3 exceeds the 2 sold across both lines
    const over = await admin.post(`/api/sales/${saleId}/return`).send({
      items: [{ productId: String(jar._id), qty: 3 }],
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('OVER_RETURN');

    // returning both units values them at the weighted average (2250 each)
    const ret = await admin.post(`/api/sales/${saleId}/return`).send({
      items: [{ productId: String(jar._id), qty: 2 }],
    });
    expect(ret.status).toBe(200);
    expect(ret.body.data.returns[0].udhaarReduced).toBe(4500); // 2 x 2250
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(0);
    expect((await Product.findById(jar._id))!.currentQty).toBe(20);
  });

  it('float rounding: 3 x 33.33 with full payment', async () => {
    const { jar } = await seedShop();
    const staff = await loginAgent(app, STAFF);
    const res = await staff.post('/api/sales').send({
      date: '2026-07-11', paymentMode: 'UPI', amountPaid: 99.99,
      items: [{ productId: String(jar._id), qty: 3, unitPrice: 33.33 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(99.99);
    expect(res.body.data.udhaarAmount).toBe(0);
  });
});
