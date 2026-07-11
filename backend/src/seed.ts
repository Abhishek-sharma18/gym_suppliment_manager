import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { purchaseCreate, productionCreate, saleCreate, paymentCreate, expenseCreate } from '@gym/shared';
import connectDB from './config/db';
import { User, Material, Product, Supplier, Customer, Expense } from './models';
import { createPurchase } from './services/purchases';
import { createProductionBatch } from './services/production';
import { createSale } from './services/sales';
import { createPayment } from './services/payments';

async function exitClean(code: number): Promise<never> {
  await mongoose.disconnect().catch(() => undefined);
  process.exit(code);
}

async function main() {
  if (!process.env.MONGO_URI || process.env.MONGO_URI.includes('your_mongodb_connection_string')) {
    console.error('MONGO_URI is not set in backend/.env - cannot seed. Aborting.');
    await exitClean(1);
  }

  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error('Could not connect to MongoDB - aborting seed.');
    await exitClean(1);
  }

  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    console.log('Database already has users - seed skipped');
    await exitClean(0);
  }

  // --- Users ---
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@gym.local',
    passwordHash: await bcrypt.hash('Admin@123!', 10),
    role: 'admin',
    isActive: true,
  });
  await User.updateOne({ _id: admin._id }, { $set: { createdBy: admin._id } });
  const userId = admin._id;

  const staff = await User.create({
    name: 'Staff',
    email: 'staff@gym.local',
    passwordHash: await bcrypt.hash('Staff@123!', 10),
    role: 'staff',
    isActive: true,
  });
  await User.updateOne({ _id: staff._id }, { $set: { createdBy: userId } });

  // --- Suppliers / Customers ---
  // Note: the IMaterial/IProduct/ISupplier/ICustomer TS interfaces (backend/src/models/*.ts) don't
  // declare createdBy/updatedBy even though the schemas do (auditFields spread) - the crudFactory route
  // sidesteps this via a loosely-typed Model<{isDeleted:boolean}>. Here we create then set createdBy via
  // $set, the same pattern already used by routes/users.ts (updatedBy) - proven to typecheck cleanly.
  const supplier = await Supplier.create({ name: 'Fresh Farms Supplies', phone: '9876543210', address: 'Sector 12, Delhi' });
  await Supplier.updateOne({ _id: supplier._id }, { $set: { createdBy: userId } });

  const customer1 = await Customer.create({ name: 'Ramesh Kumar', phone: '9123456780' });
  await Customer.updateOne({ _id: customer1._id }, { $set: { createdBy: userId } });
  const customer2 = await Customer.create({ name: 'Priya Singh', phone: '9123456781' });
  await Customer.updateOne({ _id: customer2._id }, { $set: { createdBy: userId } });

  // --- Materials ---
  const whey = await Material.create({
    name: 'Whey Protein Powder', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000, reorderLevel: 2000,
  });
  await Material.updateOne({ _id: whey._id }, { $set: { createdBy: userId } });
  const cocoa = await Material.create({
    name: 'Cocoa Powder', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000, reorderLevel: 500,
  });
  await Material.updateOne({ _id: cocoa._id }, { $set: { createdBy: userId } });
  const wrapper = await Material.create({
    name: 'Packaging Wrapper', buyUnit: 'pack of 100', useUnit: 'pcs', conversionFactor: 100, reorderLevel: 200,
  });
  await Material.updateOne({ _id: wrapper._id }, { $set: { createdBy: userId } });

  // --- Products with BoM ---
  const barChocolate = await Product.create({
    name: 'Protein Bar', variant: 'Chocolate', sku: 'PB-CHOC', sellingPrice: 60, packagingCostPerUnit: 2,
    bom: [
      { materialId: whey._id, qtyPerUnit: 25 },
      { materialId: cocoa._id, qtyPerUnit: 5 },
      { materialId: wrapper._id, qtyPerUnit: 1 },
    ],
    reorderLevel: 20,
  });
  await Product.updateOne({ _id: barChocolate._id }, { $set: { createdBy: userId } });
  const barVanilla = await Product.create({
    name: 'Protein Bar', variant: 'Vanilla', sku: 'PB-VAN', sellingPrice: 55, packagingCostPerUnit: 2,
    bom: [
      { materialId: whey._id, qtyPerUnit: 30 },
      { materialId: wrapper._id, qtyPerUnit: 1 },
    ],
    reorderLevel: 20,
  });
  await Product.updateOne({ _id: barVanilla._id }, { $set: { createdBy: userId } });

  // --- Purchase (all 3 materials, so avgCost is set before production) ---
  const purchaseInput = purchaseCreate.parse({
    supplierId: supplier._id.toString(),
    invoiceNo: 'INV-SEED-001',
    date: new Date(),
    paymentMode: 'UPI',
    items: [
      { materialId: whey._id.toString(), qtyBuyUnit: 20, costPerBuyUnit: 800 },
      { materialId: cocoa._id.toString(), qtyBuyUnit: 5, costPerBuyUnit: 600 },
      { materialId: wrapper._id.toString(), qtyBuyUnit: 10, costPerBuyUnit: 250 },
    ],
  });
  const purchase = await createPurchase(purchaseInput, userId);

  // --- Production batch (Protein Bar - Chocolate, qty 100) ---
  const productionInput = productionCreate.parse({
    productId: barChocolate._id.toString(),
    qtyProduced: 100,
    date: new Date(),
    materialsConsumed: [
      { materialId: whey._id.toString(), actualQty: 2500, wastageQty: 50 },
      { materialId: cocoa._id.toString(), actualQty: 500, wastageQty: 10 },
      { materialId: wrapper._id.toString(), actualQty: 100, wastageQty: 0 },
    ],
  });
  const batch = await createProductionBatch(productionInput, userId);

  // --- Cash sale (no customer) ---
  const cashSaleInput = saleCreate.parse({
    date: new Date(),
    paymentMode: 'CASH',
    discount: 0,
    amountPaid: 600,
    items: [{ productId: barChocolate._id.toString(), qty: 10, unitPrice: 60 }],
  });
  const cashSale = await createSale(cashSaleInput, userId);

  // --- Udhaar sale (partial payment, rest on credit) ---
  const udhaarSaleInput = saleCreate.parse({
    customerId: customer1._id.toString(),
    date: new Date(),
    paymentMode: 'CASH',
    discount: 0,
    amountPaid: 100,
    items: [{ productId: barChocolate._id.toString(), qty: 5, unitPrice: 60 }],
  });
  const udhaarSale = await createSale(udhaarSaleInput, userId);

  // --- Payment (customer1 pays down part of their udhaar) ---
  const paymentInput = paymentCreate.parse({
    customerId: customer1._id.toString(),
    amount: 150,
    date: new Date(),
    paymentMode: 'CASH',
    notes: 'Partial udhaar collection',
  });
  const payment = await createPayment(paymentInput, userId);

  // --- Expenses (not ledger-touching, no service exists - matches routes/expenses.ts pattern) ---
  const rentInput = expenseCreate.parse({ category: 'RENT', amount: 8000, date: new Date() });
  const rent = await Expense.create({ ...rentInput, createdBy: userId });
  const electricityInput = expenseCreate.parse({ category: 'ELECTRICITY', amount: 1500, date: new Date() });
  const electricity = await Expense.create({ ...electricityInput, createdBy: userId });

  // --- Summary ---
  console.log('');
  console.log('Seed complete. Created:');
  console.log('-------------------------------------------------------------');
  console.log(`Users        : 2  (${admin.email}, ${staff.email})`);
  console.log(`Suppliers    : 1  (${supplier.name})`);
  console.log(`Customers    : 2  (${customer1.name}, ${customer2.name})`);
  console.log(`Materials    : 3  (${whey.name}, ${cocoa.name}, ${wrapper.name})`);
  console.log(`Products     : 2  (${barChocolate.name} - ${barChocolate.variant}, ${barVanilla.name} - ${barVanilla.variant})`);
  console.log(`Purchase     : 1  ${purchaseInput.invoiceNo} total Rs ${purchase.totalAmount}`);
  console.log(`Production   : 1  batch ${batch.batchNo} qty ${batch.qtyProduced} unitCost Rs ${batch.costSnapshot.unitCost}`);
  console.log(`Sales        : 2  cash ${cashSale.invoiceNo} (Rs ${cashSale.total}), udhaar ${udhaarSale.invoiceNo} (Rs ${udhaarSale.total}, udhaar Rs ${udhaarSale.udhaarAmount})`);
  console.log(`Payments     : 1  Rs ${payment.amount} from ${customer1.name}`);
  console.log(`Expenses     : 2  ${rent.category} Rs ${rent.amount}, ${electricity.category} Rs ${electricity.amount}`);
  console.log('-------------------------------------------------------------');
  console.log('');
  console.log('Demo logins:');
  console.log('  admin@gym.local / Admin@123!  (role: admin)');
  console.log('  staff@gym.local / Staff@123!  (role: staff)');
  console.log('');

  await exitClean(0);
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await exitClean(1);
});
