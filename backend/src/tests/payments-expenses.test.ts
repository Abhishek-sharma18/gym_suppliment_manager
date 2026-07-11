import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';
import { Customer, Expense, Payment } from '../models';

setupSuite('payments-expenses');
const app = createApp();
beforeEach(seedUsers);

describe('payments', () => {
  it('staff records a payment for an udhaar customer and the balance drops', async () => {
    const customer = await Customer.create({ name: 'Ravi', phone: '9999999999', udhaarBalance: 2000 });
    const staff = await loginAgent(app, STAFF);

    const res = await staff.post('/api/payments').send({
      customerId: String(customer._id), amount: 500, date: '2026-07-11', paymentMode: 'CASH',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(500);
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(1500);
  });

  it('payment above the balance is rejected with 400 OVERPAY and nothing changes', async () => {
    const customer = await Customer.create({ name: 'Ravi', phone: '9999999999', udhaarBalance: 2000 });
    const staff = await loginAgent(app, STAFF);

    const res = await staff.post('/api/payments').send({
      customerId: String(customer._id), amount: 2500, date: '2026-07-11', paymentMode: 'CASH',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OVERPAY');
    expect((await Customer.findById(customer._id))!.udhaarBalance).toBe(2000);
    expect(await Payment.countDocuments()).toBe(0);
  });

  it('staff payments list shows own entries only', async () => {
    const customer = await Customer.create({ name: 'Ravi', phone: '9999999999', udhaarBalance: 2000 });
    const admin = await loginAgent(app, ADMIN);
    const staff = await loginAgent(app, STAFF);

    await admin.post('/api/payments').send({
      customerId: String(customer._id), amount: 200, date: '2026-07-11', paymentMode: 'CASH',
    });
    await staff.post('/api/payments').send({
      customerId: String(customer._id), amount: 300, date: '2026-07-11', paymentMode: 'UPI',
    });

    const staffList = await staff.get('/api/payments');
    expect(staffList.body.total).toBe(1);
    expect(staffList.body.data[0].amount).toBe(300);

    const adminList = await admin.get('/api/payments');
    expect(adminList.body.total).toBe(2);
  });
});

describe('expenses', () => {
  it('staff gets 403 on every /api/expenses verb including GET', async () => {
    const staff = await loginAgent(app, STAFF);
    expect((await staff.get('/api/expenses')).status).toBe(403);
    expect((await staff.post('/api/expenses').send({
      category: 'RENT', amount: 100, date: '2026-07-11',
    })).status).toBe(403);
    expect((await staff.get('/api/expenses/64b7f3a2c9e77a0012345678')).status).toBe(403);
    expect((await staff.patch('/api/expenses/64b7f3a2c9e77a0012345678').send({ amount: 50 })).status).toBe(403);
    expect((await staff.delete('/api/expenses/64b7f3a2c9e77a0012345678')).status).toBe(403);
  });

  it('admin expense CRUD works; list filters by category; PATCH updates amount; DELETE removes the doc', async () => {
    const admin = await loginAgent(app, ADMIN);

    const rent = await admin.post('/api/expenses').send({
      category: 'RENT', amount: 15000, date: '2026-07-01', notes: 'July rent',
    });
    expect(rent.status).toBe(201);
    expect(rent.body.data.amount).toBe(15000);

    await admin.post('/api/expenses').send({
      category: 'ELECTRICITY', amount: 2000, date: '2026-07-05',
    });

    const filtered = await admin.get('/api/expenses').query({ category: 'RENT' });
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.data[0].category).toBe('RENT');

    const expenseId = rent.body.data._id;
    const got = await admin.get(`/api/expenses/${expenseId}`);
    expect(got.status).toBe(200);
    expect(got.body.data.category).toBe('RENT');

    const patched = await admin.patch(`/api/expenses/${expenseId}`).send({ amount: 16000 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.amount).toBe(16000);

    const del = await admin.delete(`/api/expenses/${expenseId}`);
    expect(del.status).toBe(200);
    expect(await Expense.findById(expenseId)).toBeNull();
    expect(await Expense.countDocuments()).toBe(1); // only the electricity one remains
  });
});
