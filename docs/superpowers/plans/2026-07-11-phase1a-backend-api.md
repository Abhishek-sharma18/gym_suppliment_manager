# Phase 1a: Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete Express API for the gym inventory system: cookie-JWT auth, RBAC with field-stripping serializers, the immutable stock ledger (`postMovement()` in Mongo transactions), purchasing with moving-average costing, production with cost snapshots, sales with udhaar, payments, expenses, reports, recount, and a seed script — all TDD-tested with supertest against an in-memory Mongo replica set.

**Architecture:** `createApp()` (app.ts) mounts routers over a service layer; ALL stock changes flow through `services/ledger.ts#postMovement()` inside `mongoose.connection.transaction(...)`. Request/response shapes come exclusively from `@gym/shared`. Role-aware serializers strip admin-only fields server-side. Tests run against `mongodb-memory-server` in replica-set mode so transactions are exercised for real.

**Tech Stack:** Express 5, Mongoose 9, zod 4 (via @gym/shared), jsonwebtoken, bcryptjs, cookie-parser, vitest 4 + supertest + mongodb-memory-server.

**Read first:** `CLAUDE.md` (12 non-negotiables) and spec `docs/superpowers/specs/2026-07-11-gym-inventory-design.md`.

## Global Constraints

- Branch: `phase1a-backend`. Working dir: repo root `C:\Users\abhis\OneDrive\Desktop\gym project` (quote the path — it contains a space). Shell: PowerShell for anything that touches the network (npm; the FIRST backend test run downloads a ~100MB mongod binary for mongodb-memory-server — allow up to 10 minutes; later runs are fast).
- Code blocks are VERBATIM requirements. All request/response schemas are imported from `@gym/shared` — never redefine a shape.
- CLAUDE.md non-negotiables bind every task. In particular: `postMovement()` is the ONLY writer of `stock_movements` and the ONLY code that touches cached `currentQty`; no update/delete endpoints for movements; corrections are ADJUSTMENT movements; RBAC enforced via `requireRole` + serializers; responses `{ data }` / `{ error: { code, message, fields? } }`; lists `{ data, page, limit, total }`; audit fields on every doc.
- Money rounding: derived TOTALS (line totals, sale totals, udhaar, expenses sums) round to 2 decimals via `round2`. Per-useUnit COSTS (`avgCost`, `costPerUseUnit`, `unitCost`, `avgUnitCost`) round to 4 decimals via `round4` — at Rs-per-gram scale, 2 decimals loses real money.
- Express 5 notes: async handler/middleware rejections auto-forward to the error handler (no wrapper needed); `req.query` is read-only — validated values live in `res.locals`. Conventions: `res.locals.user` (authed user doc), `res.locals.body` (validated body), `res.locals.query` (validated query).
- "Own entries" rule: on list/get of purchases, production, sales, and payments, STAFF see only docs where `createdBy` is themselves; admin sees all.
- Interpretation (flag to user, do not silently change): STAFF may create payments (udhaar collection at the counter) — the spec's staff-create list names sales/production/purchases only, but payments are the same class of counter operation.
- TDD per task: failing test → RED run → implement → GREEN run → commit. Run the FOCUSED test file while iterating (`npx vitest run src/tests/<file> --root backend` or `npm test --workspace backend -- <file>`); full backend suite once before each commit.
- ASCII only in new code and comments (no unicode symbols).
- Commit after every task; messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never commit or print `backend/.env` contents.

## Contract amendments made by this plan (shared package)

Three additive changes to `@gym/shared`, each in the task that needs it: purchaseOut cost fields become optional (staff-stripped) — Task 7; saleOut returns entries gain `udhaarReduced` — Task 9; recountOut gains `customersFixed` — Task 11.

---

### Task 1: API skeleton + test harness

**Files:**
- Create: `backend/src/lib/round.ts`, `backend/src/lib/errors.ts`, `backend/src/lib/respond.ts`, `backend/src/middleware/validate.ts`, `backend/src/app.ts`, `backend/vitest.config.ts`, `backend/src/tests/globalSetup.ts`, `backend/src/tests/helpers/db.ts`, `backend/src/tests/health.test.ts`
- Modify: `backend/src/server.ts` (use createApp), `backend/package.json` (test script)

**Interfaces:**
- Produces (later tasks import these EXACT names): `createApp(): express.Express`; `ApiError(status, code, message, fields?)` + `errorHandler`; `ok(res, data, status = 200)`; `listOk(res, { data, page, limit, total })`; `round2(n)`, `round4(n)`; `validateBody(schema)`, `validateQuery(schema)` (parse into `res.locals.body` / `res.locals.query`); test helpers `setupSuite(dbName)`.

- [ ] **Step 1: Install dependencies**

```powershell
npm install --workspace backend cookie-parser jsonwebtoken bcryptjs
npm install --save-dev --workspace backend supertest mongodb-memory-server "@types/cookie-parser" "@types/jsonwebtoken" "@types/bcryptjs" "@types/supertest"
```

- [ ] **Step 2: Create the test harness**

`backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './src/tests/globalSetup.ts',
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
```

`backend/src/tests/globalSetup.ts`:

```ts
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet;

export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_TEST_URI = replSet.getUri();
  process.env.JWT_SECRET = 'test-secret';
}

export async function teardown(): Promise<void> {
  await replSet.stop();
}
```

`backend/src/tests/helpers/db.ts`:

```ts
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

export function setupSuite(dbName: string): void {
  beforeAll(async () => {
    const uri = process.env.MONGO_TEST_URI;
    if (!uri) throw new Error('MONGO_TEST_URI not set - globalSetup did not run');
    await mongoose.connect(uri, { dbName });
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}
```

- [ ] **Step 3: Write the failing test** — `backend/src/tests/health.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

describe('health', () => {
  it('responds ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Gym API is running' });
  });

  it('404s unknown routes with the error envelope', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 4: Add the test script and see RED** — in `backend/package.json` scripts add `"test": "vitest run"`. Run `npm test --workspace backend` (PowerShell; first run downloads mongod — be patient) → FAIL (cannot resolve `../app`).

- [ ] **Step 5: Create `backend/src/lib/round.ts`**

```ts
// Derived money TOTALS use round2; per-useUnit COSTS use round4 (Rs-per-gram scale).
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;
```

- [ ] **Step 6: Create `backend/src/lib/errors.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', fields } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid id format' } });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
```

- [ ] **Step 7: Create `backend/src/lib/respond.ts`**

```ts
import type { Response } from 'express';

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function listOk(res: Response, payload: { data: unknown[]; page: number; limit: number; total: number }): void {
  res.json(payload);
}
```

- [ ] **Step 8: Create `backend/src/middleware/validate.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export const validateBody = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.body = schema.parse(req.body); // throws ZodError -> errorHandler
    next();
  };

export const validateQuery = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.query = schema.parse(req.query);
    next();
  };
```

- [ ] **Step 9: Create `backend/src/app.ts`**

```ts
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './lib/errors';

export function createApp(): express.Express {
  const app = express();

  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Gym API is running' });
  });

  // ROUTER MOUNTS (later tasks insert routers here, above the 404 handler)

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 10: Replace `backend/src/server.ts`**

```ts
import dotenv from 'dotenv';
dotenv.config();

import connectDB from './config/db';
import { createApp } from './app';

const app = createApp();
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void connectDB();
});
```

- [ ] **Step 11: GREEN** — `npm test --workspace backend` → 2 tests pass. `npm run typecheck --workspace backend` → clean.

- [ ] **Step 12: Commit** — `git add -A; git commit -m "feat(api): app skeleton, error envelope, validation middleware, test harness"` (+ footer).

---

### Task 2: Mongoose models + immutable stock_movements guard

**Files:**
- Create: `backend/src/models/common.ts`, `User.ts`, `Material.ts`, `Product.ts`, `Supplier.ts`, `Customer.ts`, `Purchase.ts`, `ProductionBatch.ts`, `Sale.ts`, `Payment.ts`, `Expense.ts`, `StockMovement.ts`, `Counter.ts`, `index.ts` (all under `backend/src/models/`)
- Create: `backend/src/tests/models.test.ts`

**Interfaces:**
- Produces: models `User, Material, Product, Supplier, Customer, Purchase, ProductionBatch, Sale, Payment, Expense, StockMovement, Counter` re-exported from `../models`. Collections use the spec's names (`raw_materials`, `production_batches`, `stock_movements`, etc.). Any update/delete on `StockMovement` throws `ApiError(400, 'IMMUTABLE', ...)`.

- [ ] **Step 1: Write the failing test** — `backend/src/tests/models.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setupSuite } from './helpers/db';
import { Material, StockMovement } from '../models';

setupSuite('models');

describe('stock_movements immutability', () => {
  it('allows insert but rejects update and delete', async () => {
    const m = await Material.create({ name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000 });
    const mv = await StockMovement.create({
      type: 'ADJUSTMENT', itemKind: 'RAW', itemId: m._id, qty: 5, refType: 'ADJUSTMENT', note: 'test',
    });
    await expect(StockMovement.updateOne({ _id: mv._id }, { qty: 99 })).rejects.toThrow(/immutable/i);
    await expect(StockMovement.deleteOne({ _id: mv._id })).rejects.toThrow(/immutable/i);
    mv.qty = 42;
    await expect(mv.save()).rejects.toThrow(/immutable/i);
    expect((await StockMovement.findById(mv._id))!.qty).toBe(5);
  });
});

describe('defaults', () => {
  it('material starts at zero stock and zero avgCost, not deleted', async () => {
    const m = await Material.create({ name: 'Sugar', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000 });
    expect(m.currentQty).toBe(0);
    expect(m.avgCost).toBe(0);
    expect(m.isDeleted).toBe(false);
  });
});
```

- [ ] **Step 2: RED** — `npm test --workspace backend` → FAIL (cannot resolve `../models`).

- [ ] **Step 3: Create `backend/src/models/common.ts`**

```ts
import { Schema } from 'mongoose';

export const auditFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
} as const;
```

- [ ] **Step 4: Create `backend/src/models/User.ts`**

```ts
import { Schema, model } from 'mongoose';
import type { Role } from '@gym/shared';
import { ROLES } from '@gym/shared';
import { auditFields } from './common';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
}

const schema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  isActive: { type: Boolean, default: true },
  ...auditFields,
}, { timestamps: true, collection: 'users' });

export const User = model<IUser>('User', schema);
```

- [ ] **Step 5: Create `backend/src/models/Material.ts`**

```ts
import { Schema, model } from 'mongoose';
import { auditFields } from './common';

export interface IMaterial {
  name: string;
  buyUnit: string;
  useUnit: string;
  conversionFactor: number;
  reorderLevel: number;
  currentQty: number;
  avgCost: number;
  isDeleted: boolean;
}

const schema = new Schema<IMaterial>({
  name: { type: String, required: true, trim: true },
  buyUnit: { type: String, required: true },
  useUnit: { type: String, required: true },
  conversionFactor: { type: Number, required: true, min: 0 },
  reorderLevel: { type: Number, default: 0 },
  currentQty: { type: Number, default: 0 }, // cache - written ONLY by postMovement()/recount
  avgCost: { type: Number, default: 0 },    // Rs per useUnit, 4dp - written only by purchase service/recount
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'raw_materials' });

export const Material = model<IMaterial>('Material', schema);
```

- [ ] **Step 6: Create `backend/src/models/Product.ts`**

```ts
import { Schema, model, Types } from 'mongoose';
import { auditFields } from './common';

export interface IProduct {
  name: string;
  variant?: string;
  sku?: string;
  sellingPrice: number;
  packagingCostPerUnit: number;
  bom: { materialId: Types.ObjectId; qtyPerUnit: number }[];
  reorderLevel: number;
  currentQty: number;
  avgUnitCost: number;
  isDeleted: boolean;
}

const schema = new Schema<IProduct>({
  name: { type: String, required: true, trim: true },
  variant: String,
  sku: String,
  sellingPrice: { type: Number, required: true, min: 0 },
  packagingCostPerUnit: { type: Number, default: 0 },
  bom: [{
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    qtyPerUnit: { type: Number, required: true, min: 0 },
  }],
  reorderLevel: { type: Number, default: 0 },
  currentQty: { type: Number, default: 0 },  // cache - postMovement()/recount only
  avgUnitCost: { type: Number, default: 0 }, // 4dp - production service/recount only
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'products' });

export const Product = model<IProduct>('Product', schema);
```

- [ ] **Step 7: Create `backend/src/models/Supplier.ts` and `Customer.ts`**

```ts
// Supplier.ts
import { Schema, model } from 'mongoose';
import { auditFields } from './common';

export interface ISupplier {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isDeleted: boolean;
}

const schema = new Schema<ISupplier>({
  name: { type: String, required: true, trim: true },
  phone: String,
  address: String,
  notes: String,
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'suppliers' });

export const Supplier = model<ISupplier>('Supplier', schema);
```

```ts
// Customer.ts
import { Schema, model } from 'mongoose';
import { auditFields } from './common';

export interface ICustomer {
  name: string;
  phone?: string;
  udhaarBalance: number;
  isDeleted: boolean;
}

const schema = new Schema<ICustomer>({
  name: { type: String, required: true, trim: true },
  phone: String,
  udhaarBalance: { type: Number, default: 0 }, // cache - sale/payment/return services + recount only
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'customers' });

export const Customer = model<ICustomer>('Customer', schema);
```

- [ ] **Step 8: Create `backend/src/models/Purchase.ts`**

```ts
import { Schema, model, Types } from 'mongoose';
import { PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { auditFields } from './common';

export interface IPurchase {
  supplierId: Types.ObjectId;
  invoiceNo?: string;
  date: Date;
  paymentMode: PaymentMode;
  items: { materialId: Types.ObjectId; qtyBuyUnit: number; costPerBuyUnit: number; lineTotal: number }[];
  totalAmount: number;
}

const schema = new Schema<IPurchase>({
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  invoiceNo: String,
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
  items: [{
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    qtyBuyUnit: { type: Number, required: true },
    costPerBuyUnit: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  ...auditFields,
}, { timestamps: true, collection: 'purchases' });

export const Purchase = model<IPurchase>('Purchase', schema);
```

- [ ] **Step 9: Create `backend/src/models/ProductionBatch.ts`**

```ts
import { Schema, model, Types } from 'mongoose';
import { auditFields } from './common';

export interface IProductionBatch {
  batchNo: string;
  productId: Types.ObjectId;
  qtyProduced: number;
  date: Date;
  expiryDate?: Date;
  materialsConsumed: {
    materialId: Types.ObjectId; plannedQty: number; actualQty: number; wastageQty: number; costPerUseUnit: number;
  }[];
  costSnapshot: { materialCost: number; packagingCost: number; totalCost: number; unitCost: number };
}

const schema = new Schema<IProductionBatch>({
  batchNo: { type: String, required: true, unique: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  qtyProduced: { type: Number, required: true },
  date: { type: Date, required: true },
  expiryDate: Date,
  materialsConsumed: [{
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    plannedQty: { type: Number, required: true },
    actualQty: { type: Number, required: true },
    wastageQty: { type: Number, required: true },
    costPerUseUnit: { type: Number, required: true },
  }],
  costSnapshot: {
    materialCost: { type: Number, required: true },
    packagingCost: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  ...auditFields,
}, { timestamps: true, collection: 'production_batches' });

export const ProductionBatch = model<IProductionBatch>('ProductionBatch', schema);
```

- [ ] **Step 10: Create `backend/src/models/Sale.ts`**

```ts
import { Schema, model, Types } from 'mongoose';
import { PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { auditFields } from './common';

export interface ISale {
  invoiceNo: string;
  customerId?: Types.ObjectId;
  date: Date;
  paymentMode: PaymentMode;
  items: { productId: Types.ObjectId; qty: number; unitPrice: number; unitCostAtSale: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  udhaarAmount: number;
  returns: {
    date: Date;
    items: { productId: Types.ObjectId; qty: number }[];
    refundNote?: string;
    udhaarReduced?: number;
    createdBy?: Types.ObjectId;
  }[];
}

const schema = new Schema<ISale>({
  invoiceNo: { type: String, required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    unitCostAtSale: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  amountPaid: { type: Number, required: true },
  udhaarAmount: { type: Number, required: true },
  returns: [{
    date: { type: Date, required: true },
    items: [{
      productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      qty: { type: Number, required: true },
    }],
    refundNote: String,
    udhaarReduced: Number,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  }],
  ...auditFields,
}, { timestamps: true, collection: 'sales' });

export const Sale = model<ISale>('Sale', schema);
```

- [ ] **Step 11: Create `backend/src/models/Payment.ts` and `Expense.ts`**

```ts
// Payment.ts
import { Schema, model, Types } from 'mongoose';
import { PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { auditFields } from './common';

export interface IPayment {
  customerId: Types.ObjectId;
  amount: number;
  date: Date;
  paymentMode: PaymentMode;
  notes?: string;
}

const schema = new Schema<IPayment>({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
  notes: String,
  ...auditFields,
}, { timestamps: true, collection: 'payments' });

export const Payment = model<IPayment>('Payment', schema);
```

```ts
// Expense.ts
import { Schema, model } from 'mongoose';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@gym/shared';
import { auditFields } from './common';

export interface IExpense {
  category: ExpenseCategory;
  amount: number;
  date: Date;
  notes?: string;
}

const schema = new Schema<IExpense>({
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  notes: String,
  ...auditFields,
}, { timestamps: true, collection: 'expenses' });

export const Expense = model<IExpense>('Expense', schema);
```

- [ ] **Step 12: Create `backend/src/models/StockMovement.ts`** (the immutability guard)

```ts
import { Schema, model, Types } from 'mongoose';
import {
  ITEM_KINDS, MOVEMENT_TYPES, REF_TYPES,
  type ItemKind, type MovementType, type RefType,
} from '@gym/shared';
import { ApiError } from '../lib/errors';

export interface IStockMovement {
  type: MovementType;
  itemKind: ItemKind;
  itemId: Types.ObjectId;
  qty: number;
  unitCost?: number;
  refType: RefType;
  refId?: Types.ObjectId;
  note?: string;
  createdBy?: Types.ObjectId;
}

const schema = new Schema<IStockMovement>({
  type: { type: String, enum: MOVEMENT_TYPES, required: true },
  itemKind: { type: String, enum: ITEM_KINDS, required: true },
  itemId: { type: Schema.Types.ObjectId, required: true, index: true },
  qty: { type: Number, required: true },
  unitCost: Number,
  refType: { type: String, enum: REF_TYPES, required: true },
  refId: Schema.Types.ObjectId,
  note: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'stock_movements' });

const IMMUTABLE = (): never => {
  throw new ApiError(400, 'IMMUTABLE', 'stock_movements are immutable - corrections are new ADJUSTMENT movements');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  schema.pre(op as 'updateOne', IMMUTABLE);
}
schema.pre('save', function () {
  if (!this.isNew) IMMUTABLE();
});

export const StockMovement = model<IStockMovement>('StockMovement', schema);
```

- [ ] **Step 13: Create `backend/src/models/Counter.ts` and `backend/src/models/index.ts`**

```ts
// Counter.ts
import { Schema, model } from 'mongoose';

export interface ICounter { _id: string; seq: number }

const schema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { collection: 'counters' });

export const Counter = model<ICounter>('Counter', schema);
```

```ts
// index.ts
export { User, type IUser } from './User';
export { Material, type IMaterial } from './Material';
export { Product, type IProduct } from './Product';
export { Supplier, type ISupplier } from './Supplier';
export { Customer, type ICustomer } from './Customer';
export { Purchase, type IPurchase } from './Purchase';
export { ProductionBatch, type IProductionBatch } from './ProductionBatch';
export { Sale, type ISale } from './Sale';
export { Payment, type IPayment } from './Payment';
export { Expense, type IExpense } from './Expense';
export { StockMovement, type IStockMovement } from './StockMovement';
export { Counter, type ICounter } from './Counter';
```

- [ ] **Step 14: GREEN** — `npm test --workspace backend` → all pass (health + models). Typecheck clean.

- [ ] **Step 15: Commit** — `git add -A; git commit -m "feat(api): mongoose models with immutable stock_movements guard"` (+ footer).

---

### Task 3: Auth — login/logout/me, cookie JWT, role middleware

**Files:**
- Create: `backend/src/middleware/auth.ts`, `backend/src/serializers/index.ts`, `backend/src/routes/auth.ts`, `backend/src/tests/helpers/auth.ts`, `backend/src/tests/auth.test.ts`
- Modify: `backend/src/app.ts` (mount), `backend/.env` (append JWT_SECRET), `backend/.env.example`

**Interfaces:**
- Produces: `requireAuth` (async; sets `res.locals.user` to the User doc), `requireRole(...roles)`; `serializeUser(doc, role)` and `baseDoc(doc)` from `../serializers`; test helpers `ADMIN`, `STAFF`, `seedUsers()`, `loginAgent(app, { email, password })` (returns a cookie-bearing supertest agent).

- [ ] **Step 1: Secrets** — append a JWT secret to `backend/.env` WITHOUT printing it, and a placeholder to `.env.example`:

```powershell
Add-Content -Path "backend\.env" -Value "`nJWT_SECRET=$([guid]::NewGuid().ToString('N'))$([guid]::NewGuid().ToString('N'))"
Add-Content -Path "backend\.env.example" -Value "`n# Secret used to sign login tokens - any long random string`nJWT_SECRET=change_me_to_a_long_random_string"
```

- [ ] **Step 2: Write failing tests** — `backend/src/tests/helpers/auth.ts`:

```ts
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
```

`backend/src/tests/auth.test.ts`:

```ts
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';

setupSuite('auth');
const app = createApp();

beforeEach(seedUsers);

describe('auth', () => {
  it('logs in with correct credentials, sets an httpOnly cookie, returns user without passwordHash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/token=.*HttpOnly/i);
    expect(res.body.data.email).toBe(ADMIN.email);
    expect(res.body.data.role).toBe('admin');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'nope-nope-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });

  it('GET /me requires auth and returns the logged-in user', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const agent = await loginAgent(app, STAFF);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(STAFF.email);
  });

  it('logout clears the session', async () => {
    const agent = await loginAgent(app, ADMIN);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
```

- [ ] **Step 3: RED** — run the focused file → FAIL (route not mounted / modules missing).

- [ ] **Step 4: Create `backend/src/middleware/auth.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new ApiError(500, 'CONFIG', 'JWT_SECRET is not set');
  return s;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.token;
  if (typeof token !== 'string' || !token) throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  let payload: { sub?: string };
  try {
    payload = jwt.verify(token, jwtSecret()) as { sub?: string };
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired or invalid - please login again');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found or disabled');
  res.locals.user = user;
  next();
}

export const requireRole = (...roles: Role[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user;
    if (!user || !roles.includes(user.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    next();
  };
```

- [ ] **Step 5: Create `backend/src/serializers/index.ts`** (extended by later tasks)

```ts
import type { Role } from '@gym/shared';

type AnyDoc = { toObject(): Record<string, unknown> } | Record<string, unknown>;

export function baseDoc(doc: AnyDoc): Record<string, unknown> {
  const obj = typeof (doc as { toObject?: () => Record<string, unknown> }).toObject === 'function'
    ? (doc as { toObject: () => Record<string, unknown> }).toObject()
    : { ...(doc as Record<string, unknown>) };
  const { _id, __v, ...rest } = obj;
  return { _id: String(_id), ...rest };
}

export function serializeUser(doc: AnyDoc, _role: Role): Record<string, unknown> {
  const { passwordHash, ...rest } = baseDoc(doc);
  return rest;
}
```

- [ ] **Step 6: Create `backend/src/routes/auth.ts`**

```ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginRequest, type LoginRequest } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';
import { ok } from '../lib/respond';
import { validateBody } from '../middleware/validate';
import { jwtSecret, requireAuth } from '../middleware/auth';
import { serializeUser } from '../serializers';

const COOKIE = 'token';
export const authRouter = Router();

authRouter.post('/login', validateBody(loginRequest), async (_req, res) => {
  const { email, password } = res.locals.body as LoginRequest;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret(), { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  ok(res, serializeUser(user, user.role));
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  ok(res, { loggedOut: true });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  ok(res, serializeUser(res.locals.user, res.locals.user.role));
});
```

- [ ] **Step 7: Mount in `backend/src/app.ts`** — under the `// ROUTER MOUNTS` comment add:

```ts
app.use('/api/auth', authRouter);
```

(with `import { authRouter } from './routes/auth';` at the top.)

- [ ] **Step 8: GREEN** — focused file passes; then full `npm test --workspace backend` + typecheck clean.

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat(api): cookie-JWT auth with role middleware"` (+ footer; verify `git status --short` shows no `.env`).

---

### Task 4: List helpers + users admin CRUD

**Files:**
- Create: `backend/src/lib/paginate.ts`, `backend/src/routes/users.ts`, `backend/src/tests/users.test.ts`
- Modify: `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: `paginate(model, filter, q, sort?)` returning `{ data, page, limit, total }`; `searchFilter(search, fields)`; users routes at `/api/users` (ALL admin-only).

- [ ] **Step 1: Write failing tests** — `backend/src/tests/users.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupSuite } from './helpers/db';
import { ADMIN, STAFF, loginAgent, seedUsers } from './helpers/auth';

setupSuite('users');
const app = createApp();
beforeEach(seedUsers);

describe('users admin CRUD', () => {
  it('blocks staff entirely', async () => {
    const staff = await loginAgent(app, STAFF);
    expect((await staff.get('/api/users')).status).toBe(403);
    expect((await staff.post('/api/users').send({})).status).toBe(403);
  });

  it('admin creates a user; passwordHash never leaks; new user can login', async () => {
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.post('/api/users').send({
      name: 'New Staff', email: 'new@test.local', password: 'password-123', role: 'staff',
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    await loginAgent(app, { email: 'new@test.local', password: 'password-123' });
  });

  it('lists with pagination envelope and search', async () => {
    const admin = await loginAgent(app, ADMIN);
    const res = await admin.get('/api/users?search=counter');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(res.body.data[0].email).toBe(STAFF.email);
  });

  it('deactivating a user blocks their login; admin cannot deactivate self', async () => {
    const admin = await loginAgent(app, ADMIN);
    const list = await admin.get('/api/users?search=counter');
    const staffId = list.body.data[0]._id;
    expect((await admin.delete(`/api/users/${staffId}`)).status).toBe(200);
    const relogin = await (await import('supertest')).default(app)
      .post('/api/auth/login').send({ email: STAFF.email, password: STAFF.password });
    expect(relogin.status).toBe(401);

    const me = await admin.get('/api/auth/me');
    expect((await admin.delete(`/api/users/${me.body.data._id}`)).status).toBe(400);
  });
});
```

- [ ] **Step 2: RED** — focused run fails (no `/api/users`).

- [ ] **Step 3: Create `backend/src/lib/paginate.ts`**

```ts
import type { FilterQuery, Model } from 'mongoose';
import type { ListQuery } from '@gym/shared';

export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  q: ListQuery,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
): Promise<{ data: unknown[]; page: number; limit: number; total: number }> {
  const total = await model.countDocuments(filter);
  const data = await model.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit);
  return { data, page: q.page, limit: q.limit, total };
}

export function searchFilter(search: string | undefined, fields: string[]): Record<string, unknown> {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}
```

- [ ] **Step 4: Create `backend/src/routes/users.ts`**

```ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { listQuery, userCreate, userUpdate, type ListQuery } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate, searchFilter } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { serializeUser } from '../serializers';

export const usersRouter = Router();

usersRouter.get('/', validateQuery(listQuery), async (_req, res) => {
  const q = res.locals.query as ListQuery;
  const page = await paginate(User, searchFilter(q.search, ['name', 'email']), q);
  listOk(res, { ...page, data: page.data.map((u) => serializeUser(u as never, 'admin')) });
});

usersRouter.post('/', validateBody(userCreate), async (_req, res) => {
  const { password, ...rest } = res.locals.body;
  const user = await User.create({
    ...rest,
    passwordHash: await bcrypt.hash(password, 10),
    createdBy: res.locals.user._id,
  });
  ok(res, serializeUser(user, 'admin'), 201);
});

usersRouter.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  ok(res, serializeUser(user, 'admin'));
});

usersRouter.patch('/:id', validateBody(userUpdate), async (req, res) => {
  const { password, ...rest } = res.locals.body;
  const update: Record<string, unknown> = { ...rest, updatedBy: res.locals.user._id };
  if (password) update.passwordHash = await bcrypt.hash(password, 10);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  ok(res, serializeUser(user, 'admin'));
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.params.id === String(res.locals.user._id)) {
    throw new ApiError(400, 'SELF_DEACTIVATE', 'You cannot deactivate your own account');
  }
  const user = await User.findByIdAndUpdate(req.params.id,
    { $set: { isActive: false, updatedBy: res.locals.user._id } }, { new: true });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  ok(res, { deactivated: true });
});
```

- [ ] **Step 5: Mount in app.ts** (admin-gated at the mount):

```ts
app.use('/api/users', requireAuth, requireRole('admin'), usersRouter);
```

(imports: `requireAuth`, `requireRole` from `./middleware/auth`, `usersRouter` from `./routes/users`.)

- [ ] **Step 6: GREEN** — focused pass, full suite pass, typecheck clean.

- [ ] **Step 7: Commit** — `git add -A; git commit -m "feat(api): pagination helpers and admin users CRUD"` (+ footer).

---

### Task 5: Master-data CRUD (materials, products, suppliers, customers)

**Files:**
- Create: `backend/src/routes/crudFactory.ts`, `backend/src/routes/masterData.ts`, `backend/src/tests/master-data.test.ts`
- Modify: `backend/src/serializers/index.ts` (add 4 serializers), `backend/src/app.ts` (mounts)

**Interfaces:**
- Produces: `masterDataRouter({ model, createSchema, updateSchema, serialize, searchFields })` — list/get for any authed user, create/patch/soft-delete admin-only; serializers `serializeMaterial` (staff: no `avgCost`), `serializeProduct` (staff: no `avgUnitCost`), `serializeSupplier`, `serializeCustomer`; routes at `/api/materials`, `/api/products`, `/api/suppliers`, `/api/customers`.

- [ ] **Step 1: Write failing tests** — `backend/src/tests/master-data.test.ts`:

```ts
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
```

- [ ] **Step 2: RED** — focused run fails.

- [ ] **Step 3: Create `backend/src/routes/crudFactory.ts`**

```ts
import { Router } from 'express';
import type { Model } from 'mongoose';
import type { Role } from '@gym/shared';
import { listQuery, type ListQuery } from '@gym/shared';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate, searchFilter } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';

export function masterDataRouter(opts: {
  model: Model<never>;
  createSchema: ZodType;
  updateSchema: ZodType;
  serialize: (doc: unknown, role: Role) => unknown;
  searchFields: string[];
}): Router {
  const r = Router();
  const model = opts.model as Model<{ isDeleted: boolean }>;

  r.get('/', validateQuery(listQuery), async (_req, res) => {
    const q = res.locals.query as ListQuery;
    const role = res.locals.user.role as Role;
    const filter = { isDeleted: false, ...searchFilter(q.search, opts.searchFields) };
    const page = await paginate(model, filter, q);
    listOk(res, { ...page, data: page.data.map((d) => opts.serialize(d, role)) });
  });

  r.get('/:id', async (req, res) => {
    const doc = await model.findOne({ _id: req.params.id, isDeleted: false });
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    ok(res, opts.serialize(doc, res.locals.user.role));
  });

  r.post('/', requireRole('admin'), validateBody(opts.createSchema), async (_req, res) => {
    const doc = await model.create({ ...res.locals.body, createdBy: res.locals.user._id });
    ok(res, opts.serialize(doc, res.locals.user.role), 201);
  });

  r.patch('/:id', requireRole('admin'), validateBody(opts.updateSchema), async (req, res) => {
    const doc = await model.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { ...res.locals.body, updatedBy: res.locals.user._id } },
      { new: true, runValidators: true },
    );
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    ok(res, opts.serialize(doc, res.locals.user.role));
  });

  r.delete('/:id', requireRole('admin'), async (req, res) => {
    const doc = await model.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { isDeleted: true, updatedBy: res.locals.user._id } },
      { new: true },
    );
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    ok(res, { deleted: true });
  });

  return r;
}
```

- [ ] **Step 4: Extend `backend/src/serializers/index.ts`** — append:

```ts
export function serializeMaterial(doc: AnyDoc, role: Role): Record<string, unknown> {
  const o = baseDoc(doc);
  if (role !== 'admin') delete o.avgCost;
  return o;
}

export function serializeProduct(doc: AnyDoc, role: Role): Record<string, unknown> {
  const o = baseDoc(doc);
  if (role !== 'admin') delete o.avgUnitCost;
  return o;
}

export function serializeSupplier(doc: AnyDoc, _role: Role): Record<string, unknown> {
  return baseDoc(doc);
}

export function serializeCustomer(doc: AnyDoc, _role: Role): Record<string, unknown> {
  return baseDoc(doc);
}
```

- [ ] **Step 5: Create `backend/src/routes/masterData.ts`**

```ts
import {
  customerCreate, customerUpdate, materialCreate, materialUpdate,
  productCreate, productUpdate, supplierCreate, supplierUpdate,
} from '@gym/shared';
import { Customer, Material, Product, Supplier } from '../models';
import { masterDataRouter } from './crudFactory';
import { serializeCustomer, serializeMaterial, serializeProduct, serializeSupplier } from '../serializers';

export const materialsRouter = masterDataRouter({
  model: Material as never, createSchema: materialCreate, updateSchema: materialUpdate,
  serialize: serializeMaterial as never, searchFields: ['name'],
});
export const productsRouter = masterDataRouter({
  model: Product as never, createSchema: productCreate, updateSchema: productUpdate,
  serialize: serializeProduct as never, searchFields: ['name', 'variant', 'sku'],
});
export const suppliersRouter = masterDataRouter({
  model: Supplier as never, createSchema: supplierCreate, updateSchema: supplierUpdate,
  serialize: serializeSupplier as never, searchFields: ['name', 'phone'],
});
export const customersRouter = masterDataRouter({
  model: Customer as never, createSchema: customerCreate, updateSchema: customerUpdate,
  serialize: serializeCustomer as never, searchFields: ['name', 'phone'],
});
```

- [ ] **Step 6: Mount in app.ts** (all behind `requireAuth`):

```ts
app.use('/api/materials', requireAuth, materialsRouter);
app.use('/api/products', requireAuth, productsRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/customers', requireAuth, customersRouter);
```

- [ ] **Step 7: GREEN** — focused pass, full suite pass, typecheck clean.

- [ ] **Step 8: Commit** — `git add -A; git commit -m "feat(api): master-data CRUD with soft delete and staff field-stripping"` (+ footer).

---

### Task 6: Ledger core — postMovement, counters, movements + adjustment routes

**Files:**
- Create: `backend/src/services/ledger.ts`, `backend/src/services/counters.ts`, `backend/src/routes/movements.ts`, `backend/src/tests/ledger.test.ts`
- Modify: `backend/src/serializers/index.ts` (serializeMovement), `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: `postMovement(input: PostMovementInput, session: ClientSession): Promise<{ newQty: number }>` — THE only stock writer; `PostMovementInput = { type, itemKind, itemId, qty (signed, non-zero), unitCost?, refType, refId?, note?, userId }`; `nextSeq(key, session): Promise<number>`; `yyyymmdd(date): string`; routes `GET /api/movements` (authed; staff responses lack `unitCost`) and `POST /api/movements/adjustments` (admin; body = `adjustmentCreate`; returns `{ newQty }`).

- [ ] **Step 1: Write failing tests** — `backend/src/tests/ledger.test.ts`:

```ts
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
```

- [ ] **Step 2: RED** — focused run fails.

- [ ] **Step 3: Create `backend/src/services/ledger.ts`**

```ts
import type { ClientSession, Types } from 'mongoose';
import type { ItemKind, MovementType, RefType } from '@gym/shared';
import { Material, Product, StockMovement } from '../models';
import { ApiError } from '../lib/errors';
import { round2 } from '../lib/round';

const QTY_EPS = 1e-9;

export interface PostMovementInput {
  type: MovementType;
  itemKind: ItemKind;
  itemId: Types.ObjectId | string;
  qty: number; // signed: positive = stock in, negative = stock out
  unitCost?: number;
  refType: RefType;
  refId?: Types.ObjectId | string;
  note?: string;
  userId: Types.ObjectId | string;
}

// CLAUDE.md rule 1: the ONLY code path that writes stock_movements and touches cached currentQty.
export async function postMovement(input: PostMovementInput, session: ClientSession): Promise<{ newQty: number }> {
  if (!Number.isFinite(input.qty) || input.qty === 0) {
    throw new ApiError(400, 'BAD_MOVEMENT', 'Movement qty must be a non-zero number');
  }
  const model = input.itemKind === 'RAW' ? Material : Product;
  const item = await (model as typeof Material).findOne({ _id: input.itemId }).session(session);
  if (!item || item.isDeleted) {
    throw new ApiError(404, 'NOT_FOUND', `${input.itemKind === 'RAW' ? 'Material' : 'Product'} not found`);
  }

  const newQty = round2(item.currentQty + input.qty);
  if (newQty < -QTY_EPS) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK',
      `Not enough stock of "${item.name}": available ${item.currentQty}, requested ${Math.abs(input.qty)}`);
  }

  await StockMovement.create([{
    type: input.type,
    itemKind: input.itemKind,
    itemId: input.itemId,
    qty: input.qty,
    unitCost: input.unitCost,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    createdBy: input.userId,
  }], { session });

  item.currentQty = newQty;
  await item.save({ session });
  return { newQty };
}
```

- [ ] **Step 4: Create `backend/src/services/counters.ts`**

```ts
import type { ClientSession } from 'mongoose';
import { Counter } from '../models';

export async function nextSeq(key: string, session: ClientSession): Promise<number> {
  const c = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
  return c!.seq;
}

export function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
```

- [ ] **Step 5: Add `serializeMovement` to serializers**

```ts
export function serializeMovement(doc: AnyDoc, role: Role): Record<string, unknown> {
  const o = baseDoc(doc);
  if (role !== 'admin') delete o.unitCost;
  return o;
}
```

- [ ] **Step 6: Create `backend/src/routes/movements.ts`**

```ts
import { Router } from 'express';
import mongoose from 'mongoose';
import { adjustmentCreate, movementQuery } from '@gym/shared';
import { StockMovement } from '../models';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';
import { postMovement } from '../services/ledger';
import { serializeMovement } from '../serializers';

export const movementsRouter = Router();

movementsRouter.get('/', validateQuery(movementQuery), async (_req, res) => {
  const q = res.locals.query;
  const filter: Record<string, unknown> = {};
  if (q.itemKind) filter.itemKind = q.itemKind;
  if (q.itemId) filter.itemId = q.itemId;
  if (q.type) filter.type = q.type;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(StockMovement, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeMovement(d as never, res.locals.user.role)) });
});

movementsRouter.post('/adjustments', requireRole('admin'), validateBody(adjustmentCreate), async (_req, res) => {
  const body = res.locals.body;
  const result = await mongoose.connection.transaction(async (session) =>
    postMovement({
      type: 'ADJUSTMENT', itemKind: body.itemKind, itemId: body.itemId, qty: body.qty,
      refType: 'ADJUSTMENT', note: body.note, userId: res.locals.user._id,
    }, session),
  );
  ok(res, result, 201);
});
```

- [ ] **Step 7: Mount in app.ts:**

```ts
app.use('/api/movements', requireAuth, movementsRouter);
```

- [ ] **Step 8: GREEN** — focused pass, full suite, typecheck.

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat(api): postMovement ledger core, counters, movements and adjustment routes"` (+ footer).

---

### Task 7: Purchases with moving-average costing

**Files:**
- Create: `backend/src/services/purchases.ts`, `backend/src/routes/purchases.ts`, `backend/src/tests/purchases.test.ts`
- Modify: `shared/src/purchases.ts` (contract amendment), `shared/src/schemas.test.ts` (append), `backend/src/serializers/index.ts` (serializePurchase), `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: `createPurchase(input, userId): Promise<purchase doc>` (opens its own transaction); routes `POST /api/purchases` (staff + admin), `GET /api/purchases` (`purchaseQuery`; staff see own only), `GET /api/purchases/:id` (staff own only). No PATCH/DELETE — purchases are history; corrections are adjustments. `serializePurchase(doc, role)`: staff lose `totalAmount`, `items[].costPerBuyUnit`, `items[].lineTotal`.

- [ ] **Step 1: Contract amendment** — in `shared/src/purchases.ts` replace the `purchaseOut` definition with:

```ts
export const purchaseOut = z.object({
  _id: objectId,
  supplierId: objectId,
  invoiceNo: z.string().optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(z.object({
    materialId: objectId,
    qtyBuyUnit: z.number().positive(),
    costPerBuyUnit: money.optional(), // admin only - stripped for staff
    lineTotal: money.optional(),      // admin only - stripped for staff
  })),
  totalAmount: money.optional(),      // admin only - stripped for staff
}).extend(audit.shape);
```

Append to `shared/src/schemas.test.ts` (inside a new `describe('purchase output', ...)`):

```ts
describe('purchase output', () => {
  it('parses a staff-stripped purchase (no cost fields)', () => {
    expect(purchaseOut.safeParse({
      _id: '64b7f3a2c9e77a0012345678', supplierId: '64b7f3a2c9e77a0012345678',
      date: '2026-07-11', paymentMode: 'CASH',
      items: [{ materialId: '64b7f3a2c9e77a0012345678', qtyBuyUnit: 10 }],
      createdAt: '2026-07-11', updatedAt: '2026-07-11',
    }).success).toBe(true);
  });
});
```

(add `import { purchaseOut } from './purchases';` with the other imports). Run `npm test --workspace shared` → PASS.

- [ ] **Step 2: Write failing backend tests** — `backend/src/tests/purchases.test.ts`:

```ts
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
```

- [ ] **Step 3: RED** — focused run fails.

- [ ] **Step 4: Create `backend/src/services/purchases.ts`**

```ts
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { purchaseCreate } from '@gym/shared';
import { Material, Purchase, Supplier, type IPurchase } from '../models';
import { ApiError } from '../lib/errors';
import { round2, round4 } from '../lib/round';
import { postMovement } from './ledger';

type PurchaseInput = z.infer<typeof purchaseCreate>;

export async function createPurchase(input: PurchaseInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const supplier = await Supplier.findOne({ _id: input.supplierId, isDeleted: false }).session(session);
    if (!supplier) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found');

    const items: IPurchase['items'] = [];
    let totalAmount = 0;

    for (const line of input.items) {
      const material = await Material.findOne({ _id: line.materialId, isDeleted: false }).session(session);
      if (!material) throw new ApiError(404, 'NOT_FOUND', `Material not found: ${line.materialId}`);

      const qtyUse = round2(line.qtyBuyUnit * material.conversionFactor);
      const costPerUse = line.costPerBuyUnit / material.conversionFactor;
      const prevQty = material.currentQty;
      const prevAvg = material.avgCost;

      await postMovement({
        type: 'PURCHASE_IN', itemKind: 'RAW', itemId: material._id, qty: qtyUse,
        unitCost: round4(costPerUse), refType: 'PURCHASE', userId,
      }, session);

      const newQty = prevQty + qtyUse;
      const newAvg = newQty > 0 ? round4((prevQty * prevAvg + qtyUse * costPerUse) / newQty) : round4(costPerUse);
      await Material.updateOne({ _id: material._id }, { $set: { avgCost: newAvg } }, { session });

      const lineTotal = round2(line.qtyBuyUnit * line.costPerBuyUnit);
      totalAmount = round2(totalAmount + lineTotal);
      items.push({ materialId: material._id, qtyBuyUnit: line.qtyBuyUnit, costPerBuyUnit: line.costPerBuyUnit, lineTotal });
    }

    const [purchase] = await Purchase.create([{
      supplierId: input.supplierId, invoiceNo: input.invoiceNo, date: input.date,
      paymentMode: input.paymentMode, items, totalAmount, createdBy: userId,
    }], { session });
    return purchase;
  });
}
```

- [ ] **Step 5: Add `serializePurchase` to serializers**

```ts
export function serializePurchase(doc: AnyDoc, role: Role): Record<string, unknown> {
  const o = baseDoc(doc);
  if (role !== 'admin') {
    delete o.totalAmount;
    o.items = (o.items as Record<string, unknown>[]).map((i) => {
      const { costPerBuyUnit, lineTotal, ...rest } = i;
      return rest;
    });
  }
  return o;
}
```

- [ ] **Step 6: Create `backend/src/routes/purchases.ts`**

```ts
import { Router } from 'express';
import { purchaseCreate, purchaseQuery } from '@gym/shared';
import { Purchase } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { createPurchase } from '../services/purchases';
import { serializePurchase } from '../serializers';

export const purchasesRouter = Router();

purchasesRouter.post('/', validateBody(purchaseCreate), async (_req, res) => {
  const purchase = await createPurchase(res.locals.body, res.locals.user._id);
  ok(res, serializePurchase(purchase, res.locals.user.role), 201);
});

purchasesRouter.get('/', validateQuery(purchaseQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id; // staff: own entries only
  if (q.supplierId) filter.supplierId = q.supplierId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(Purchase, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializePurchase(d as never, user.role)) });
});

purchasesRouter.get('/:id', async (req, res) => {
  const user = res.locals.user;
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role !== 'admin') filter.createdBy = user._id;
  const purchase = await Purchase.findOne(filter);
  if (!purchase) throw new ApiError(404, 'NOT_FOUND', 'Purchase not found');
  ok(res, serializePurchase(purchase, user.role));
});
```

- [ ] **Step 7: Mount** — `app.use('/api/purchases', requireAuth, purchasesRouter);`

- [ ] **Step 8: GREEN** — focused pass, full backend suite, `npm test --workspace shared` (amendment test), typecheck all.

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat(api): purchases with unit conversion and moving-average costing"` (+ footer).

---

### Task 8: Production batches with cost snapshots

**Files:**
- Create: `backend/src/services/production.ts`, `backend/src/routes/production.ts`, `backend/src/tests/production.test.ts`
- Modify: `backend/src/serializers/index.ts` (serializeProduction), `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: `createProductionBatch(input, userId)` (own transaction; returns batch doc); routes `POST /api/production` (staff + admin), `GET /api/production` (`productionQuery`; staff own only), `GET /api/production/:id` (staff own only). `serializeProduction(doc, role)`: staff lose `costSnapshot` and each `materialsConsumed[].costPerUseUnit`. Batch numbers `B-YYYYMMDD-<seq>` via counter key `batch-<YYYYMMDD>`.

- [ ] **Step 1: Write failing tests** — `backend/src/tests/production.test.ts`:

```ts
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
```

- [ ] **Step 2: RED** — focused run fails.

- [ ] **Step 3: Create `backend/src/services/production.ts`**

```ts
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { productionCreate } from '@gym/shared';
import { Material, Product, ProductionBatch, type IProductionBatch } from '../models';
import { ApiError } from '../lib/errors';
import { round2, round4 } from '../lib/round';
import { postMovement } from './ledger';
import { nextSeq, yyyymmdd } from './counters';

type ProductionInput = z.infer<typeof productionCreate>;

export async function createProductionBatch(input: ProductionInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const product = await Product.findOne({ _id: input.productId, isDeleted: false }).session(session);
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    if (product.bom.length === 0) {
      throw new ApiError(400, 'NO_RECIPE', `"${product.name}" has no recipe (BoM) - add one on the product first`);
    }
    if (input.expiryDate && input.expiryDate < input.date) {
      throw new ApiError(400, 'BAD_EXPIRY', 'Expiry date cannot be before the production date');
    }

    const planned = new Map(product.bom.map((b) => [String(b.materialId), round2(b.qtyPerUnit * input.qtyProduced)]));

    const consumed: IProductionBatch['materialsConsumed'] = [];
    let materialCost = 0;
    for (const line of input.materialsConsumed) {
      const material = await Material.findOne({ _id: line.materialId, isDeleted: false }).session(session);
      if (!material) throw new ApiError(404, 'NOT_FOUND', `Material not found: ${line.materialId}`);
      const costPerUseUnit = material.avgCost;

      if (line.actualQty > 0) {
        await postMovement({
          type: 'PRODUCTION_CONSUME', itemKind: 'RAW', itemId: material._id, qty: -line.actualQty,
          unitCost: costPerUseUnit, refType: 'PRODUCTION', userId,
        }, session);
      }
      if (line.wastageQty > 0) {
        await postMovement({
          type: 'WASTAGE', itemKind: 'RAW', itemId: material._id, qty: -line.wastageQty,
          unitCost: costPerUseUnit, refType: 'PRODUCTION', note: 'production wastage', userId,
        }, session);
      }

      materialCost += (line.actualQty + line.wastageQty) * costPerUseUnit;
      consumed.push({
        materialId: material._id,
        plannedQty: planned.get(String(material._id)) ?? 0,
        actualQty: line.actualQty,
        wastageQty: line.wastageQty,
        costPerUseUnit,
      });
    }

    materialCost = round2(materialCost);
    const packagingCost = round2(product.packagingCostPerUnit * input.qtyProduced);
    const totalCost = round2(materialCost + packagingCost);
    const unitCost = round4(totalCost / input.qtyProduced);

    const prevQty = product.currentQty;
    const prevAvg = product.avgUnitCost;
    await postMovement({
      type: 'PRODUCTION_OUT', itemKind: 'FINISHED', itemId: product._id, qty: input.qtyProduced,
      unitCost, refType: 'PRODUCTION', userId,
    }, session);
    const newQty = prevQty + input.qtyProduced;
    const newAvg = newQty > 0 ? round4((prevQty * prevAvg + input.qtyProduced * unitCost) / newQty) : unitCost;
    await Product.updateOne({ _id: product._id }, { $set: { avgUnitCost: newAvg } }, { session });

    const seq = await nextSeq(`batch-${yyyymmdd(input.date)}`, session);
    const [batch] = await ProductionBatch.create([{
      batchNo: `B-${yyyymmdd(input.date)}-${seq}`,
      productId: product._id,
      qtyProduced: input.qtyProduced,
      date: input.date,
      expiryDate: input.expiryDate,
      materialsConsumed: consumed,
      costSnapshot: { materialCost, packagingCost, totalCost, unitCost },
      createdBy: userId,
    }], { session });
    return batch;
  });
}
```

- [ ] **Step 4: Add `serializeProduction` to serializers**

```ts
export function serializeProduction(doc: AnyDoc, role: Role): Record<string, unknown> {
  const o = baseDoc(doc);
  if (role !== 'admin') {
    delete o.costSnapshot;
    o.materialsConsumed = (o.materialsConsumed as Record<string, unknown>[]).map((l) => {
      const { costPerUseUnit, ...rest } = l;
      return rest;
    });
  }
  return o;
}
```

- [ ] **Step 5: Create `backend/src/routes/production.ts`** — same pattern as purchases: `POST /` with `validateBody(productionCreate)` calling `createProductionBatch`; `GET /` with `validateQuery(productionQuery)` filtering `productId`/`from`–`to` on `date` and `createdBy` for staff; `GET /:id` with staff own-only filter. Serialize with `serializeProduction`. Full code:

```ts
import { Router } from 'express';
import { productionCreate, productionQuery } from '@gym/shared';
import { ProductionBatch } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { createProductionBatch } from '../services/production';
import { serializeProduction } from '../serializers';

export const productionRouter = Router();

productionRouter.post('/', validateBody(productionCreate), async (_req, res) => {
  const batch = await createProductionBatch(res.locals.body, res.locals.user._id);
  ok(res, serializeProduction(batch, res.locals.user.role), 201);
});

productionRouter.get('/', validateQuery(productionQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id;
  if (q.productId) filter.productId = q.productId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(ProductionBatch, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeProduction(d as never, user.role)) });
});

productionRouter.get('/:id', async (req, res) => {
  const user = res.locals.user;
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role !== 'admin') filter.createdBy = user._id;
  const batch = await ProductionBatch.findOne(filter);
  if (!batch) throw new ApiError(404, 'NOT_FOUND', 'Batch not found');
  ok(res, serializeProduction(batch, user.role));
});
```

- [ ] **Step 6: Mount** — `app.use('/api/production', requireAuth, productionRouter);`

- [ ] **Step 7: GREEN** — focused, full suite, typecheck.

- [ ] **Step 8: Commit** — `git add -A; git commit -m "feat(api): production batches with BoM prefill, wastage, and immutable cost snapshots"` (+ footer).

---

### Task 9: Sales + returns

**Files:**
- Create: `backend/src/services/sales.ts`, `backend/src/routes/sales.ts`, `backend/src/tests/sales.test.ts`
- Modify: `shared/src/sales.ts` (returns entries gain `udhaarReduced: money.optional()`), `backend/src/serializers/index.ts` (serializeSale), `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: `createSale(input, userId)`, `createSaleReturn(saleId, input, userId)` (own transactions); routes `POST /api/sales` (staff + admin), `GET /api/sales` (`saleQuery`; staff own), `GET /api/sales/:id`, `POST /api/sales/:id/return` (ADMIN only, body `saleReturnCreate`). Invoice `S-YYYYMMDD-<seq>` via counter key `sale-<YYYYMMDD>`. `serializeSale(doc, role)`: staff lose ONLY `items[].unitCostAtSale` (selling prices and totals are staff-visible).

- [ ] **Step 1: Contract amendment** — in `shared/src/sales.ts`, inside `saleOut.returns` items object, add after `refundNote`:

```ts
    udhaarReduced: money.optional(),
```

Run `npm test --workspace shared` → still green.

- [ ] **Step 2: Write failing tests** — `backend/src/tests/sales.test.ts`:

```ts
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
    expect(await StockMovement.countDocuments({ type: 'SALE_RETURN_IN' })).toBe(1);

    expect((await admin.post(`/api/sales/${saleId}/return`).send({
      items: [{ productId: String(jar._id), qty: 2 }],
    })).status).toBe(400); // only 1 left un-returned
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
```

- [ ] **Step 3: RED** — focused run fails.

- [ ] **Step 4: Create `backend/src/services/sales.ts`**

```ts
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { saleCreate, saleReturnCreate } from '@gym/shared';
import { Customer, Product, Sale, type ISale } from '../models';
import { ApiError } from '../lib/errors';
import { round2 } from '../lib/round';
import { postMovement } from './ledger';
import { nextSeq, yyyymmdd } from './counters';

type SaleInput = z.infer<typeof saleCreate>;
type ReturnInput = z.infer<typeof saleReturnCreate>;

export async function createSale(input: SaleInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const items: ISale['items'] = [];
    let subtotal = 0;

    for (const line of input.items) {
      const product = await Product.findOne({ _id: line.productId, isDeleted: false }).session(session);
      if (!product) throw new ApiError(404, 'NOT_FOUND', `Product not found: ${line.productId}`);

      const lineTotal = round2(line.qty * line.unitPrice);
      subtotal = round2(subtotal + lineTotal);

      await postMovement({
        type: 'SALE_OUT', itemKind: 'FINISHED', itemId: product._id, qty: -line.qty,
        unitCost: product.avgUnitCost, refType: 'SALE', userId,
      }, session);

      items.push({
        productId: product._id, qty: line.qty, unitPrice: line.unitPrice,
        unitCostAtSale: product.avgUnitCost, lineTotal,
      });
    }

    const total = round2(subtotal - input.discount);
    if (total < 0) throw new ApiError(400, 'BAD_DISCOUNT', 'Discount exceeds subtotal');
    const udhaarAmount = Math.max(0, round2(total - input.amountPaid));

    if (udhaarAmount > 0) {
      if (!input.customerId) throw new ApiError(400, 'CUSTOMER_REQUIRED', 'Udhaar sale needs a customer');
      const customer = await Customer.findOne({ _id: input.customerId, isDeleted: false }).session(session);
      if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
      await Customer.updateOne({ _id: customer._id },
        { $set: { udhaarBalance: round2(customer.udhaarBalance + udhaarAmount) } }, { session });
    }

    const seq = await nextSeq(`sale-${yyyymmdd(input.date)}`, session);
    const [sale] = await Sale.create([{
      invoiceNo: `S-${yyyymmdd(input.date)}-${seq}`,
      customerId: input.customerId, date: input.date, paymentMode: input.paymentMode,
      items, subtotal, discount: input.discount, total,
      amountPaid: input.amountPaid, udhaarAmount, returns: [], createdBy: userId,
    }], { session });
    return sale;
  });
}

export async function createSaleReturn(saleId: string, input: ReturnInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) throw new ApiError(404, 'NOT_FOUND', 'Sale not found');

    let returnValue = 0;
    for (const line of input.items) {
      const soldLine = sale.items.find((i) => String(i.productId) === line.productId);
      if (!soldLine) throw new ApiError(400, 'NOT_IN_SALE', `Product ${line.productId} is not on this sale`);
      const alreadyReturned = sale.returns
        .flatMap((r) => r.items)
        .filter((i) => String(i.productId) === line.productId)
        .reduce((sum, i) => sum + i.qty, 0);
      if (line.qty > soldLine.qty - alreadyReturned) {
        throw new ApiError(400, 'OVER_RETURN',
          `Cannot return ${line.qty} of this product - only ${soldLine.qty - alreadyReturned} left un-returned`);
      }
      await postMovement({
        type: 'SALE_RETURN_IN', itemKind: 'FINISHED', itemId: soldLine.productId, qty: line.qty,
        unitCost: soldLine.unitCostAtSale, refType: 'SALE', refId: sale._id, userId,
      }, session);
      returnValue = round2(returnValue + line.qty * soldLine.unitPrice);
    }

    let udhaarReduced = 0;
    if (sale.customerId) {
      const customer = await Customer.findById(sale.customerId).session(session);
      if (customer) {
        udhaarReduced = round2(Math.min(returnValue, customer.udhaarBalance));
        if (udhaarReduced > 0) {
          await Customer.updateOne({ _id: customer._id },
            { $set: { udhaarBalance: round2(customer.udhaarBalance - udhaarReduced) } }, { session });
        }
      }
    }

    sale.returns.push({
      date: new Date(),
      items: input.items.map((i) => ({ productId: new mongoose.Types.ObjectId(i.productId), qty: i.qty })),
      refundNote: input.refundNote,
      udhaarReduced,
      createdBy: userId as Types.ObjectId,
    });
    await sale.save({ session });
    return sale;
  });
}
```

- [ ] **Step 5: Add `serializeSale` to serializers**

```ts
export function serializeSale(doc: AnyDoc, role: Role): Record<string, unknown> {
  const o = baseDoc(doc);
  if (role !== 'admin') {
    o.items = (o.items as Record<string, unknown>[]).map((i) => {
      const { unitCostAtSale, ...rest } = i;
      return rest;
    });
  }
  return o;
}
```

- [ ] **Step 6: Create `backend/src/routes/sales.ts`**

```ts
import { Router } from 'express';
import { saleCreate, saleQuery, saleReturnCreate } from '@gym/shared';
import { Sale } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';
import { createSale, createSaleReturn } from '../services/sales';
import { serializeSale } from '../serializers';

export const salesRouter = Router();

salesRouter.post('/', validateBody(saleCreate), async (_req, res) => {
  const sale = await createSale(res.locals.body, res.locals.user._id);
  ok(res, serializeSale(sale, res.locals.user.role), 201);
});

salesRouter.get('/', validateQuery(saleQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id;
  if (q.customerId) filter.customerId = q.customerId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(Sale, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeSale(d as never, user.role)) });
});

salesRouter.get('/:id', async (req, res) => {
  const user = res.locals.user;
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role !== 'admin') filter.createdBy = user._id;
  const sale = await Sale.findOne(filter);
  if (!sale) throw new ApiError(404, 'NOT_FOUND', 'Sale not found');
  ok(res, serializeSale(sale, user.role));
});

salesRouter.post('/:id/return', requireRole('admin'), validateBody(saleReturnCreate), async (req, res) => {
  const sale = await createSaleReturn(req.params.id, res.locals.body, res.locals.user._id);
  ok(res, serializeSale(sale, res.locals.user.role));
});
```

- [ ] **Step 7: Mount** — `app.use('/api/sales', requireAuth, salesRouter);`

- [ ] **Step 8: GREEN** — focused, full backend + shared suites, typecheck.

- [ ] **Step 9: Commit** — `git add -A; git commit -m "feat(api): sales with udhaar and admin-only returns"` (+ footer).

---

### Task 10: Payments + expenses

**Files:**
- Create: `backend/src/services/payments.ts`, `backend/src/routes/payments.ts`, `backend/src/routes/expenses.ts`, `backend/src/tests/payments-expenses.test.ts`
- Modify: `backend/src/serializers/index.ts` (serializePayment, serializeExpense), `backend/src/app.ts` (mounts)

**Interfaces:**
- Produces: `createPayment(input, userId)` (transaction; amount must be > 0 and <= customer's `udhaarBalance` + 0.001 else `ApiError(400, 'OVERPAY', ...)`); routes `POST/GET /api/payments` (staff + admin; staff lists own only — payments have no cost data so no stripping beyond that); `/api/expenses` mounted entirely behind `requireRole('admin')` with create/list (`expenseQuery` filters category/from/to)/get/patch/hard-delete. `serializePayment` = `baseDoc`; `serializeExpense` = `baseDoc`.

- [ ] **Step 1: Failing tests** — `backend/src/tests/payments-expenses.test.ts`: cover — staff records a payment for an udhaar customer and the balance drops (seed a Customer with `udhaarBalance: 2000` directly via the model); payment above the balance → 400 `OVERPAY`; staff payment list shows own entries only; staff gets 403 on every `/api/expenses` verb including GET; admin expense CRUD works and list filters by `category`; expense PATCH updates amount. Use the same structure as previous test files (setupSuite('payments-expenses'), seedUsers beforeEach, loginAgent). Write the concrete assertions in the style of Task 9's tests.

- [ ] **Step 2: RED.**

- [ ] **Step 3: `backend/src/services/payments.ts`**

```ts
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { paymentCreate } from '@gym/shared';
import { Customer, Payment } from '../models';
import { ApiError } from '../lib/errors';
import { round2 } from '../lib/round';

type PaymentInput = z.infer<typeof paymentCreate>;

export async function createPayment(input: PaymentInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const customer = await Customer.findOne({ _id: input.customerId, isDeleted: false }).session(session);
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
    if (input.amount > customer.udhaarBalance + 0.001) {
      throw new ApiError(400, 'OVERPAY',
        `Payment ${input.amount} exceeds outstanding udhaar ${customer.udhaarBalance}`);
    }
    await Customer.updateOne({ _id: customer._id },
      { $set: { udhaarBalance: round2(customer.udhaarBalance - input.amount) } }, { session });
    const [payment] = await Payment.create([{ ...input, createdBy: userId }], { session });
    return payment;
  });
}
```

- [ ] **Step 4: Routes.** `payments.ts`: POST (`validateBody(paymentCreate)` → `createPayment` → 201), GET (`validateQuery(paymentQuery)`, staff `createdBy` filter, `customerId`/date filters, serialize with `serializePayment`). `expenses.ts`: standard five handlers against the `Expense` model using `expenseCreate`/`expenseUpdate`/`expenseQuery` from shared (list filter: `category`, `date` range; hard `deleteOne`; every response through `serializeExpense`). Serializers: both are `baseDoc` passthroughs (write them as named exports for consistency). Mounts:

```ts
app.use('/api/payments', requireAuth, paymentsRouter);
app.use('/api/expenses', requireAuth, requireRole('admin'), expensesRouter);
```

- [ ] **Step 5: GREEN + typecheck.**

- [ ] **Step 6: Commit** — `git add -A; git commit -m "feat(api): udhaar payments and admin expenses"` (+ footer).

---

### Task 11: Recount — rebuild caches from the ledger (admin)

**Files:**
- Create: `backend/src/services/recount.ts`, `backend/src/routes/admin.ts`, `backend/src/tests/recount.test.ts`
- Modify: `shared/src/reports.ts` (recountOut gains `customersFixed`), `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: `runRecount(): Promise<{ driftsFound, details, customersFixed }>`; route `POST /api/admin/recount` (admin only).

- [ ] **Step 1: Contract amendment** — in `shared/src/reports.ts`, add to `recountOut` after `details`:

```ts
  customersFixed: z.number().int(), // customers whose udhaarBalance was rebuilt
```

`npm test --workspace shared` → green.

- [ ] **Step 2: Failing tests** — `backend/src/tests/recount.test.ts`: seed users + a material and product with movements posted through `postMovement` (inside `mongoose.connection.transaction`), then DELIBERATELY corrupt the caches with direct model updates (allowed in tests only — this simulates drift): `Material.updateOne({...}, { currentQty: 999 })`, similarly product; also corrupt a customer's `udhaarBalance` after creating a real udhaar sale via the API. Assert: staff 403; admin `POST /api/admin/recount` returns each drifted item in `details` with correct `cachedQty`/`ledgerQty`, caches now match the ledger, `customersFixed` counts the fixed customer, and a SECOND recount returns `driftsFound: 0, customersFixed: 0`.

- [ ] **Step 3: RED.**

- [ ] **Step 4: `backend/src/services/recount.ts`**

```ts
import { Customer, Material, Payment, Product, Sale, StockMovement } from '../models';
import { round2 } from '../lib/round';

interface Drift {
  itemKind: 'RAW' | 'FINISHED';
  itemId: string;
  name: string;
  cachedQty: number;
  ledgerQty: number;
}

export async function runRecount(): Promise<{ driftsFound: number; details: Drift[]; customersFixed: number }> {
  const sums = await StockMovement.aggregate<{ _id: { itemKind: string; itemId: unknown }; qty: number }>([
    { $group: { _id: { itemKind: '$itemKind', itemId: '$itemId' }, qty: { $sum: '$qty' } } },
  ]);
  const ledger = new Map(sums.map((s) => [`${s._id.itemKind}:${String(s._id.itemId)}`, round2(s.qty)]));

  const details: Drift[] = [];
  for (const [kind, model] of [['RAW', Material], ['FINISHED', Product]] as const) {
    for (const item of await model.find({})) {
      const ledgerQty = ledger.get(`${kind}:${String(item._id)}`) ?? 0;
      if (Math.abs(item.currentQty - ledgerQty) > 1e-9) {
        details.push({ itemKind: kind, itemId: String(item._id), name: item.name, cachedQty: item.currentQty, ledgerQty });
        await model.updateOne({ _id: item._id }, { $set: { currentQty: ledgerQty } });
      }
    }
  }

  let customersFixed = 0;
  for (const customer of await Customer.find({})) {
    const [saleAgg] = await Sale.aggregate<{ udhaar: number; reduced: number }>([
      { $match: { customerId: customer._id } },
      { $project: { udhaarAmount: 1, reduced: { $sum: '$returns.udhaarReduced' } } },
      { $group: { _id: null, udhaar: { $sum: '$udhaarAmount' }, reduced: { $sum: '$reduced' } } },
    ]);
    const [payAgg] = await Payment.aggregate<{ paid: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: null, paid: { $sum: '$amount' } } },
    ]);
    const expected = round2((saleAgg?.udhaar ?? 0) - (saleAgg?.reduced ?? 0) - (payAgg?.paid ?? 0));
    if (Math.abs(customer.udhaarBalance - expected) > 1e-9) {
      await Customer.updateOne({ _id: customer._id }, { $set: { udhaarBalance: expected } });
      customersFixed += 1;
    }
  }

  return { driftsFound: details.length, details, customersFixed };
}
```

- [ ] **Step 5: `backend/src/routes/admin.ts`** — router with `POST /recount` calling `runRecount()` → `ok(res, result)`. Mount: `app.use('/api/admin', requireAuth, requireRole('admin'), adminRouter);`

- [ ] **Step 6: GREEN + typecheck. Commit** — `git add -A; git commit -m "feat(api): admin recount rebuilds stock and udhaar caches from the ledger"` (+ footer).

---

### Task 12: Reports

**Files:**
- Create: `backend/src/services/reports.ts`, `backend/src/routes/reports.ts`, `backend/src/tests/reports.test.ts`
- Modify: `backend/src/app.ts` (mount)

**Interfaces:**
- Produces: service functions `dashboard(role)`, `stockValue()`, `profit(month)`, `lowStock()`, `expiring(days)`, `udhaarReport()`, `salesSummary(from, to, role)` — shapes matching the `@gym/shared` report schemas exactly. Routes (all under `requireAuth`): `GET /api/reports/dashboard` (role-aware: staff response has NO `todaySalesTotal`/`stockValue`/`udhaarOutstanding` keys), `/stock-value` + `/profit` admin-only, `/low-stock` + `/expiring` + `/udhaar` any role, `/sales-summary` role-aware (staff: no `revenue`, no per-mode `total`).

- [ ] **Step 1: Failing tests** — `backend/src/tests/reports.test.ts`: build one full business flow through the API as admin (purchase 10kg whey @300 → produce 10 jars consuming 9000g+100g wastage, packaging 30 → sell 2 jars @2500 with 100 discount fully paid + 1 jar on full udhaar to a customer → one RENT expense of 5000 dated this month), then assert:
  - `/api/reports/profit?month=<current YYYY-MM>`: `revenue = 7400` (4900 + 2500), `costOfGoodsSold = 1045.5` (3 x 348.5), `grossProfit = 6354.5`, `overhead = 5000`, `unitsProduced = 10`, `unitsSold = 3`, `overheadPerUnit = 500`, `netProfit = 1354.5`. Staff → 403.
  - `/api/reports/stock-value`: `rawValue = 315` (900g x 0.35), `finishedValue = 2439.5` (7 x 348.5), `totalValue = 2754.5`. Staff → 403.
  - `/api/reports/dashboard` as admin has the money keys; as staff the SAME request must not contain `todaySalesTotal`, `stockValue`, or `udhaarOutstanding` keys at all (use `not.toHaveProperty`), while `todaySalesCount`, `lowStock`, `expiringSoon` are present.
  - `/api/reports/low-stock`: set the material's reorderLevel above its remaining qty via PATCH and assert it appears; `/api/reports/expiring?days=400` includes the batch (expiry 1 year out), `days=5` does not.
  - `/api/reports/udhaar` lists the customer with balance 2500; `/api/reports/sales-summary?from=...&to=...` staff response has counts but no `revenue`.
  Compute the current month dynamically in the test (`new Date().toISOString().slice(0, 7)`) and use today's date for all docs so the month filter matches.

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement `backend/src/services/reports.ts`** — write each function with mongoose aggregations; formulas (all money via `round2`):
  - `dashboard(role)`: `todaySalesCount` = sales with `date` in [today 00:00, tomorrow); admin extras: `todaySalesTotal` = sum of `total`, `stockValue` = `stockValue().totalValue`, `udhaarOutstanding` = sum of customers' `udhaarBalance`; `lowStock` = materials then products where `isDeleted: false, reorderLevel > 0, $expr: { $lte: ['$currentQty', '$reorderLevel'] }` mapped to `lowStockItem` (`unit` = material `useUnit`, products `'unit'`); `expiringSoon` = `expiring(30)`. Return the staff variant WITHOUT the admin keys (build the object conditionally — do not set them to undefined and rely on JSON dropping them; be explicit).
  - `stockValue()`: aggregate `$multiply: ['$currentQty', '$avgCost']` over non-deleted materials; same with `avgUnitCost` for products.
  - `profit(month)`: date range = [first of month, first of next month); `revenue` = sum `total` of sales in range; `costOfGoodsSold` = sum over sales items of `qty * unitCostAtSale` (`$unwind` items); `overhead` = sum expenses in range; `unitsProduced` = sum `qtyProduced` of batches in range; `unitsSold` = sum items `qty`; `overheadPerUnit` = unitsProduced > 0 ? round2(overhead / unitsProduced) : 0; `grossProfit = round2(revenue - costOfGoodsSold)`; `netProfit = round2(grossProfit - overhead)`.
  - `expiring(days)`: batches with `expiryDate` in [now, now + days days], joined to product name (`$lookup` or a second query), mapped to `expiringBatch`.
  - `udhaarReport()`: non-deleted customers with `udhaarBalance > 0` sorted desc mapped to `udhaarEntry`.
  - `salesSummary(from, to, role)`: count + (admin) revenue + `byPaymentMode` group (`count` always; `total` admin-only, omitted for staff).
- [ ] **Step 4: `backend/src/routes/reports.ts`** — thin router: `validateQuery(profitQuery)` / `expiringQuery` / `salesSummaryQuery` where applicable; `requireRole('admin')` on `/stock-value` and `/profit`; pass `res.locals.user.role` into the role-aware services. Mount `app.use('/api/reports', requireAuth, reportsRouter);`

- [ ] **Step 5: GREEN + typecheck. Commit** — `git add -A; git commit -m "feat(api): dashboard and reports with role-aware money stripping"` (+ footer).

---

### Task 13: Seed script + whole-suite verification

**Files:**
- Create: `backend/src/seed.ts`
- Modify: `backend/package.json` (seed script), `README.md` (API + login section)

- [ ] **Step 1: Create `backend/src/seed.ts`** — idempotent demo seed for the REAL Atlas db: loads dotenv, connects via the same URI logic as `config/db.ts` (reuse `connectDB` then check `mongoose.connection.readyState`; exit with a clear message if MONGO_URI is unset); if ANY user already exists, print "Database already has users - seed skipped" and exit 0. Otherwise create: admin `admin@gym.local` / `Admin@123!` and staff `staff@gym.local` / `Staff@123!` (bcrypt 10); suppliers, customers; 3 materials, 2 products with BoMs; then — going through the SERVICES (`createPurchase`, `createProductionBatch`, `createSale`, `createPayment`), never raw models, so the ledger stays consistent — one purchase, one production batch, one cash sale, one udhaar sale, one payment, and 2 expenses. Print a summary table of what was created plus the two logins. `process.exit(0)` at the end. Add script `"seed": "tsx src/seed.ts"` to backend package.json.

- [ ] **Step 2: Full verification (all via PowerShell):**
  1. `npm test --workspace shared` and `npm test --workspace backend` → all green.
  2. `npm run typecheck` (root) → clean.
  3. `npm run seed --workspace backend` against Atlas → summary printed (run it twice: second run must skip).
  4. Start `npm run dev:api` in background; `Invoke-WebRequest -Method POST -Uri http://localhost:5000/api/auth/login -ContentType 'application/json' -Body '{"email":"admin@gym.local","password":"Admin@123!"}' -SessionVariable s` → 200; then `Invoke-WebRequest -Uri http://localhost:5000/api/materials -WebSession $s` → 200 with the seeded materials; stop the server, confirm port free.

- [ ] **Step 3: Update `README.md`** — after the "Running the app" section add a short "## API" section: base URL `http://localhost:5000/api`, seeded logins (admin@gym.local / Admin@123!, staff@gym.local / Staff@123!) with a note to change them, `npm run seed --workspace backend` to load demo data, and one line per route group (auth, users, materials, products, suppliers, customers, purchases, production, sales, payments, expenses, movements, reports, admin/recount).

- [ ] **Step 4: Commit** — `git add -A; git commit -m "feat(api): seed script and docs"` (+ footer).

---

## Follow-up (not in this plan)

- **Phase 1b — Frontend screens** (MUI shell + all pages against msw mocks of this API) — plan written after this one completes.
- **Phase 2 — Integration** (frontend against the real seeded API, end-to-end flows).
- Deferred minors from the Phase 0 review: `z.coerce.date()` accepts junk-typed query input (accepted); staff-payment permission interpretation to confirm with the user.

---

## Post-review amendments (2026-07-11, final whole-branch review)

1. Added `GET /api/payments/:id` (spec section 8 promised create+list+get).
2. `errorHandler` maps Mongo duplicate-key (11000) to 409 DUPLICATE.
3. `packagingCostPerUnit` stripped from staff product responses; `productOut` field now optional (staff-safe).
4. Hygiene: postMovement transaction-contract comment; `returnDocument: 'after'` swap; reports.ts types now z.infer of shared schemas; staff movement-strip test now exercises a movement with unitCost.

### Deferred to Phase 2 (explicit decisions needed)
- **Recount concurrency:** `runRecount()` aggregates then updates non-transactionally; concurrent traffic between aggregate and update can overwrite a fresh cache with a stale sum. Options: per-item transactional re-aggregate, or document "run when idle". Decide in Phase 2.
- **Returns in profit reports:** `/reports/profit` and `/reports/sales-summary` ignore `returns[]` - revenue/COGS/unitsSold are overstated after returns. Spec section 6 is silent. Decide the accounting treatment in Phase 2.
- Login timing side-channel, login rate-limiting, JWT_SECRET boot check, self-demotion via PATCH, ad-hoc response schemas ({ deleted: true } etc.), UTC day-boundary convention: recorded, low priority.

### Status (2026-07-12)
- **Recount concurrency:** kept as a documented run-when-idle decision, not rebuilt — see `docs/superpowers/plans/2026-07-12-phase2-completion.md` Task 1 item 5 (comment on `runRecount` + README API section note). Still non-transactional by design (2-user shop).
- **Returns in profit reports:** DONE — `backend/src/services/reports.ts` (`returnsInRange`) deducts returns from revenue/COGS/unitsSold in `/reports/profit`, `/reports/sales-summary`, and the dashboard. This was closed by the returns-accounting work that predates the Phase 2 completion plan, not by it.
- **Login timing, rate-limiting, JWT_SECRET boot check, self-demotion via PATCH:** DONE — see `docs/superpowers/plans/2026-07-12-phase2-completion.md` Task 1. Ad-hoc response schemas (`{ deleted: true }` etc.) and the UTC day-boundary convention remain open/low priority, out of Phase 2 scope.
