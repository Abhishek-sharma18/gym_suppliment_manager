# Phase 0: Contract & Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repo into a TypeScript npm-workspaces monorepo with a complete `@gym/shared` zod contract that Phase 1 backend and frontend work will build against.

**Architecture:** Three workspaces (`shared`, `backend`, `frontend`) under one root. `shared` exports TS source directly (no build step); backend runs it via `tsx`, frontend via Next.js `transpilePackages`. Both existing scaffolds are converted to TypeScript. All request/response validation shapes live in `shared` as zod schemas with inferred types.

**Tech Stack:** TypeScript 5 (strict), zod 4, Express 5, Mongoose 9, Next.js 16, tsx, vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-gym-inventory-design.md` — read it before starting.

## Global Constraints

- TypeScript everywhere, `strict: true`; ESM everywhere (`"type": "module"`).
- zod 4 syntax (`z.email()`, `z.record(keySchema, valueSchema)`); zod schemas in `@gym/shared` are the ONLY validation source (spec §12.5).
- Backend port 5000, frontend port 3000, currency ₹.
- Preserve the `dns.setServers(['8.8.8.8', '1.1.1.1'])` fix in the DB config (machine-specific, spec §2).
- Naming convention for schemas: `<entity>Create`, `<entity>Update`, `<entity>Out`, plus query schemas — exact names defined in tasks below; later phases import these names verbatim.
- Admin-only fields (`avgCost`, `avgUnitCost`, `costSnapshot`, `unitCostAtSale`) are `.optional()` in output schemas so staff-stripped responses still parse.
- Working directory for all commands: repo root `C:\Users\abhis\OneDrive\Desktop\gym project` (quote the path — it contains a space). Shell: PowerShell.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Root workspaces + shared package scaffold

**Files:**
- Create: `package.json` (repo root)
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`
- Modify: `backend/package.json` (add `@gym/shared` dep, workspace-friendly)
- Modify: `frontend/package.json` (add `@gym/shared` dep)
- Delete: `backend/package-lock.json`, `frontend/package-lock.json`, `backend/node_modules`, `frontend/node_modules`

**Interfaces:**
- Produces: workspace root; `@gym/shared` importable from both apps; single root lockfile.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "gym-project",
  "private": true,
  "workspaces": ["shared", "backend", "frontend"],
  "scripts": {
    "dev:api": "npm run dev --workspace backend",
    "dev:web": "npm run dev --workspace frontend",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Create `shared/package.json`**

```json
{
  "name": "@gym/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Create `shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `shared/src/index.ts`** (placeholder export so the package resolves; later tasks replace it)

```ts
export const SHARED_VERSION = '0.1.0';
```

- [ ] **Step 5: Add `@gym/shared` to both apps**

In `backend/package.json` dependencies add: `"@gym/shared": "*"`.
In `frontend/package.json` dependencies add: `"@gym/shared": "*"`.

- [ ] **Step 6: Remove per-package lockfiles/node_modules and install from root**

```powershell
Remove-Item "backend\package-lock.json", "frontend\package-lock.json" -Force
Remove-Item "backend\node_modules", "frontend\node_modules" -Recurse -Force
npm install
npm install --save-dev --workspace shared typescript zod vitest
```

Note: zod goes in `dependencies` of shared — after the install move `"zod"` from devDependencies to a `"dependencies"` block in `shared/package.json` if npm placed it in devDependencies (it will, with `--save-dev`); simplest is: `npm install --workspace shared zod` and `npm install --save-dev --workspace shared typescript vitest` as two commands.

- [ ] **Step 7: Verify workspace wiring**

Run: `node -e "console.log(require('./shared/package.json').name)"` → `@gym/shared`
Run: `npm ls @gym/shared` → shows it linked under gym-backend and frontend, no errors.
Run: `Test-Path "node_modules\@gym\shared"` → `True` (symlinked workspace).

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "chore: npm workspaces root + @gym/shared package scaffold"
```

---

### Task 2: CLAUDE.md with project non-negotiables

**Files:**
- Create: `CLAUDE.md` (repo root)

**Interfaces:**
- Produces: conventions doc every future agent/session inherits.

- [ ] **Step 1: Create `CLAUDE.md` with exactly this content**

```markdown
# Gym Inventory Project

Inventory, production, sales & udhaar management for a gym that produces its own products. Spec: `docs/superpowers/specs/2026-07-11-gym-inventory-design.md`. Plans: `docs/superpowers/plans/`.

## Layout & commands

npm workspaces: `shared/` (zod contract — schemas, enums, types), `backend/` (Express 5 + Mongoose 9, port 5000), `frontend/` (Next.js 16 + MUI, port 3000).

- `npm run dev:api` / `npm run dev:web` — start apps (from repo root)
- `npm run typecheck` / `npm test` — all workspaces
- DB: MongoDB Atlas, db `gymdb`, connection string in `backend/.env` (never commit)

## Non-negotiables

1. **Stock is never edited directly.** Every stock change is an immutable `stock_movements` doc written by `postMovement()` inside a Mongo transaction that also updates the item's cached `currentQty`. No other code path touches `currentQty`.
2. **History is never edited.** Corrections are new ADJUSTMENT movements (admin-only, mandatory note). No update/delete endpoints for movements.
3. **RBAC is enforced in the API**: `requireRole` on routes + role-aware serializers that strip `avgCost`, `avgUnitCost`, `costSnapshot`, `unitCostAtSale`, profit and expense data from staff responses. UI hiding is cosmetic.
4. **Batch cost snapshots are immutable**; overhead is computed only at report time.
5. **All validation via `@gym/shared` zod schemas** — no hand-rolled validation, no duplicated shapes.
6. **MUI-only UI, mobile-first.** TanStack Query for data fetching.
7. Every document carries `createdBy`/`updatedBy`.
8. Keep `dns.setServers(['8.8.8.8', '1.1.1.1'])` in the backend DB config (this machine's Node resolver is broken for SRV lookups).
9. API responses: `{ data: ... }` on success, `{ error: { code, message, fields? } }` on failure. Lists: `{ data, page, limit, total }`.
10. TypeScript strict, ESM, TDD (vitest + supertest on backend). Commit after each task.

## RBAC summary

staff may: create sales/production/purchases, view stock levels & their own entries. staff may NOT: see any cost/profit/expense number, edit master data, manage users, adjust stock, delete anything. admin: everything.
```

- [ ] **Step 2: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs: CLAUDE.md project conventions and non-negotiables"
```

---

### Task 3: Shared enums + common schemas (TDD)

**Files:**
- Create: `shared/src/enums.ts`, `shared/src/common.ts`, `shared/src/schemas.test.ts`

**Interfaces:**
- Produces: `ROLES`, `MOVEMENT_TYPES`, `ITEM_KINDS`, `PAYMENT_MODES`, `EXPENSE_CATEGORIES`, `REF_TYPES` (+ types `Role`, `MovementType`, `ItemKind`, `PaymentMode`, `ExpenseCategory`, `RefType`); `objectId`, `money`, `isoDate`, `audit`, `listQuery`, `apiError` schemas.

- [ ] **Step 1: Write the failing test** — create `shared/src/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, MOVEMENT_TYPES, ROLES } from './enums';
import { listQuery, objectId } from './common';

describe('enums', () => {
  it('defines the exact role and movement sets from the spec', () => {
    expect(ROLES).toEqual(['admin', 'staff']);
    expect(MOVEMENT_TYPES).toEqual([
      'PURCHASE_IN', 'PRODUCTION_CONSUME', 'PRODUCTION_OUT',
      'SALE_OUT', 'SALE_RETURN_IN', 'WASTAGE', 'ADJUSTMENT',
    ]);
    expect(ITEM_KINDS).toEqual(['RAW', 'FINISHED']);
  });
});

describe('common', () => {
  it('objectId accepts a 24-hex string and rejects junk', () => {
    expect(objectId.safeParse('64b7f3a2c9e77a0012345678').success).toBe(true);
    expect(objectId.safeParse('not-an-id').success).toBe(false);
  });
  it('listQuery coerces strings and applies defaults', () => {
    expect(listQuery.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listQuery.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test --workspace shared` → FAIL (cannot resolve `./enums`).

- [ ] **Step 3: Create `shared/src/enums.ts`**

```ts
export const ROLES = ['admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const MOVEMENT_TYPES = [
  'PURCHASE_IN', 'PRODUCTION_CONSUME', 'PRODUCTION_OUT',
  'SALE_OUT', 'SALE_RETURN_IN', 'WASTAGE', 'ADJUSTMENT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const ITEM_KINDS = ['RAW', 'FINISHED'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const EXPENSE_CATEGORIES = ['RENT', 'SALARY', 'ELECTRICITY', 'TRANSPORT', 'PACKAGING', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const REF_TYPES = ['PURCHASE', 'PRODUCTION', 'SALE', 'ADJUSTMENT'] as const;
export type RefType = (typeof REF_TYPES)[number];
```

- [ ] **Step 4: Create `shared/src/common.ts`**

```ts
import { z } from 'zod';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
export const money = z.number().min(0);
export const isoDate = z.coerce.date();

export const audit = z.object({
  createdBy: objectId.optional(),
  updatedBy: objectId.optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;

// List responses: { data, page, limit, total }
export const listOut = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  });
```

- [ ] **Step 5: Run tests** — `npm test --workspace shared` → PASS (4 tests).

- [ ] **Step 6: Commit**

```powershell
git add shared/src
git commit -m "feat(shared): enums and common zod schemas"
```

---

### Task 4: Master-data entity schemas (users, materials, products, suppliers, customers)

**Files:**
- Create: `shared/src/users.ts`, `shared/src/materials.ts`, `shared/src/products.ts`, `shared/src/partners.ts`
- Modify: `shared/src/schemas.test.ts` (append)

**Interfaces:**
- Consumes: `objectId`, `money`, `audit` from `./common`; enums from `./enums`.
- Produces (exact export names later phases import): `userCreate`, `userUpdate`, `userOut`, `materialCreate`, `materialUpdate`, `materialOut`, `bomLine`, `productCreate`, `productUpdate`, `productOut`, `supplierCreate`, `supplierUpdate`, `supplierOut`, `customerCreate`, `customerUpdate`, `customerOut` + `z.infer` types `UserOut`, `MaterialOut`, `ProductOut`, `SupplierOut`, `CustomerOut`.

- [ ] **Step 1: Append failing tests to `shared/src/schemas.test.ts`**

```ts
import { materialCreate } from './materials';
import { productCreate } from './products';

describe('master data', () => {
  it('material rejects non-positive conversionFactor', () => {
    const base = { name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 0 };
    expect(materialCreate.safeParse(base).success).toBe(false);
    expect(materialCreate.safeParse({ ...base, conversionFactor: 1000 }).success).toBe(true);
  });
  it('product defaults bom to [] and packagingCost to 0', () => {
    const p = productCreate.parse({ name: 'Protein Jar 1kg', sellingPrice: 2500 });
    expect(p.bom).toEqual([]);
    expect(p.packagingCostPerUnit).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — `npm test --workspace shared` → FAIL (cannot resolve `./materials`).

- [ ] **Step 3: Create `shared/src/users.ts`**

```ts
import { z } from 'zod';
import { ROLES } from './enums';
import { audit, objectId } from './common';

export const userCreate = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email(),
  password: z.string().min(8).max(72),
  role: z.enum(ROLES),
});
export const userUpdate = userCreate.partial().extend({ isActive: z.boolean().optional() });
export const userOut = z.object({
  _id: objectId,
  name: z.string(),
  email: z.email(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
}).extend(audit.shape);
export type UserOut = z.infer<typeof userOut>;
```

- [ ] **Step 4: Create `shared/src/materials.ts`**

```ts
import { z } from 'zod';
import { audit, money, objectId } from './common';

export const materialCreate = z.object({
  name: z.string().trim().min(1).max(80),
  buyUnit: z.string().trim().min(1).max(20),
  useUnit: z.string().trim().min(1).max(20),
  conversionFactor: z.number().positive(), // 1 buyUnit = N useUnit
  reorderLevel: z.number().min(0).default(0), // in useUnit
});
export const materialUpdate = materialCreate.partial();
export const materialOut = materialCreate.extend({
  _id: objectId,
  currentQty: z.number(), // useUnit; cache maintained only by postMovement()
  avgCost: money.optional(), // ₹ per useUnit — admin only, stripped for staff
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type MaterialOut = z.infer<typeof materialOut>;
```

- [ ] **Step 5: Create `shared/src/products.ts`**

```ts
import { z } from 'zod';
import { audit, money, objectId } from './common';

export const bomLine = z.object({
  materialId: objectId,
  qtyPerUnit: z.number().positive(), // in the material's useUnit
});
export const productCreate = z.object({
  name: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(40).optional(),
  sku: z.string().trim().max(40).optional(),
  sellingPrice: money,
  packagingCostPerUnit: money.default(0),
  bom: z.array(bomLine).default([]),
  reorderLevel: z.number().min(0).default(0),
});
export const productUpdate = productCreate.partial();
export const productOut = productCreate.extend({
  _id: objectId,
  currentQty: z.number(),
  avgUnitCost: money.optional(), // admin only — moving weighted average across batches
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type ProductOut = z.infer<typeof productOut>;
```

- [ ] **Step 6: Create `shared/src/partners.ts`** (suppliers + customers)

```ts
import { z } from 'zod';
import { audit, money, objectId } from './common';

export const supplierCreate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});
export const supplierUpdate = supplierCreate.partial();
export const supplierOut = supplierCreate.extend({
  _id: objectId,
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type SupplierOut = z.infer<typeof supplierOut>;

export const customerCreate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
});
export const customerUpdate = customerCreate.partial();
export const customerOut = customerCreate.extend({
  _id: objectId,
  udhaarBalance: money, // cache; updated only inside sale/payment/return transactions
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type CustomerOut = z.infer<typeof customerOut>;
```

- [ ] **Step 7: Run tests** — `npm test --workspace shared` → PASS.

- [ ] **Step 8: Commit**

```powershell
git add shared/src
git commit -m "feat(shared): master-data schemas (users, materials, products, suppliers, customers)"
```

---

### Task 5: Transaction schemas (purchases, production, sales, payments, expenses, movements)

**Files:**
- Create: `shared/src/purchases.ts`, `shared/src/production.ts`, `shared/src/sales.ts`, `shared/src/payments.ts`, `shared/src/expenses.ts`, `shared/src/movements.ts`
- Modify: `shared/src/schemas.test.ts` (append)

**Interfaces:**
- Produces: `purchaseLineIn`, `purchaseCreate`, `purchaseOut`; `consumeLineIn`, `productionCreate`, `costSnapshot`, `productionOut`; `saleLineIn`, `saleCreate`, `saleReturnCreate`, `saleOut`; `paymentCreate`, `paymentOut`; `expenseCreate`, `expenseOut`; `adjustmentCreate`, `movementOut`, `movementQuery` + inferred `*Out` types. Totals (`lineTotal`, `subtotal`, `total`, `udhaarAmount`, `plannedQty`, `costSnapshot`, `batchNo`, `invoiceNo`) are SERVER-computed — create schemas never accept them.

- [ ] **Step 1: Append failing tests**

```ts
import { adjustmentCreate } from './movements';
import { saleCreate } from './sales';

describe('sales', () => {
  const items = [{ productId: '64b7f3a2c9e77a0012345678', qty: 2, unitPrice: 100 }];
  const base = { date: '2026-07-11', paymentMode: 'CASH', items };
  it('accepts a fully paid sale without a customer', () => {
    expect(saleCreate.safeParse({ ...base, amountPaid: 200 }).success).toBe(true);
  });
  it('rejects amountPaid above total', () => {
    expect(saleCreate.safeParse({ ...base, amountPaid: 250 }).success).toBe(false);
  });
  it('requires customerId when there is udhaar', () => {
    expect(saleCreate.safeParse({ ...base, amountPaid: 50 }).success).toBe(false);
    expect(saleCreate.safeParse({
      ...base, amountPaid: 50, customerId: '64b7f3a2c9e77a0012345678',
    }).success).toBe(true);
  });
});

describe('adjustments', () => {
  it('rejects qty 0 and requires a note', () => {
    const a = { itemKind: 'RAW', itemId: '64b7f3a2c9e77a0012345678', qty: 0, note: 'recount fix' };
    expect(adjustmentCreate.safeParse(a).success).toBe(false);
    expect(adjustmentCreate.safeParse({ ...a, qty: -5 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — `npm test --workspace shared` → FAIL (cannot resolve `./sales`).

- [ ] **Step 3: Create `shared/src/purchases.ts`**

```ts
import { z } from 'zod';
import { PAYMENT_MODES } from './enums';
import { audit, isoDate, money, objectId } from './common';

export const purchaseLineIn = z.object({
  materialId: objectId,
  qtyBuyUnit: z.number().positive(),
  costPerBuyUnit: money,
});
export const purchaseCreate = z.object({
  supplierId: objectId,
  invoiceNo: z.string().trim().max(40).optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(purchaseLineIn).min(1),
});
export const purchaseOut = z.object({
  _id: objectId,
  supplierId: objectId,
  invoiceNo: z.string().optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(purchaseLineIn.extend({ lineTotal: money })),
  totalAmount: money,
}).extend(audit.shape);
export type PurchaseOut = z.infer<typeof purchaseOut>;
```

- [ ] **Step 4: Create `shared/src/production.ts`**

```ts
import { z } from 'zod';
import { audit, isoDate, money, objectId } from './common';

export const consumeLineIn = z.object({
  materialId: objectId,
  actualQty: z.number().min(0),   // useUnit actually consumed into product
  wastageQty: z.number().min(0).default(0),
}).refine((l) => l.actualQty + l.wastageQty > 0, { message: 'line must consume or waste something' });

export const productionCreate = z.object({
  productId: objectId,
  qtyProduced: z.number().int().positive(),
  date: isoDate,
  expiryDate: isoDate.optional(),
  materialsConsumed: z.array(consumeLineIn).min(1),
});

export const costSnapshot = z.object({
  materialCost: money,
  packagingCost: money,
  totalCost: money,
  unitCost: money,
});

export const productionOut = z.object({
  _id: objectId,
  batchNo: z.string(), // server-generated B-YYYYMMDD-<seq>
  productId: objectId,
  qtyProduced: z.number().int().positive(),
  date: isoDate,
  expiryDate: isoDate.optional(),
  materialsConsumed: z.array(z.object({
    materialId: objectId,
    plannedQty: z.number().min(0), // server-computed from BoM × qtyProduced
    actualQty: z.number().min(0),
    wastageQty: z.number().min(0),
    costPerUseUnit: money.optional(), // admin only
  })),
  costSnapshot: costSnapshot.optional(), // admin only — immutable once written
}).extend(audit.shape);
export type ProductionOut = z.infer<typeof productionOut>;
```

- [ ] **Step 5: Create `shared/src/sales.ts`**

```ts
import { z } from 'zod';
import { PAYMENT_MODES } from './enums';
import { audit, isoDate, money, objectId } from './common';

export const saleLineIn = z.object({
  productId: objectId,
  qty: z.number().int().positive(),
  unitPrice: money, // prefilled from product.sellingPrice, editable
});

const EPS = 0.001;
const subtotalOf = (items: { qty: number; unitPrice: number }[]) =>
  items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

export const saleCreate = z.object({
  customerId: objectId.optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  discount: money.default(0),
  amountPaid: money,
  items: z.array(saleLineIn).min(1),
})
  .refine((s) => s.discount <= subtotalOf(s.items) + EPS,
    { message: 'discount cannot exceed subtotal', path: ['discount'] })
  .refine((s) => s.amountPaid <= subtotalOf(s.items) - s.discount + EPS,
    { message: 'amountPaid cannot exceed the sale total', path: ['amountPaid'] })
  .refine((s) => s.amountPaid >= subtotalOf(s.items) - s.discount - EPS || !!s.customerId,
    { message: 'customerId is required for an udhaar sale', path: ['customerId'] });

export const saleReturnCreate = z.object({
  items: z.array(z.object({ productId: objectId, qty: z.number().int().positive() })).min(1),
  refundNote: z.string().trim().max(200).optional(),
});

export const saleOut = z.object({
  _id: objectId,
  invoiceNo: z.string(), // server-generated S-YYYYMMDD-<seq>
  customerId: objectId.optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(saleLineIn.extend({
    lineTotal: money,
    unitCostAtSale: money.optional(), // admin only — snapshot of product.avgUnitCost
  })),
  subtotal: money,
  discount: money,
  total: money,
  amountPaid: money,
  udhaarAmount: money,
  returns: z.array(z.object({
    date: isoDate,
    items: z.array(z.object({ productId: objectId, qty: z.number().int().positive() })),
    refundNote: z.string().optional(),
    createdBy: objectId.optional(),
  })).default([]),
}).extend(audit.shape);
export type SaleOut = z.infer<typeof saleOut>;
```

- [ ] **Step 6: Create `shared/src/payments.ts` and `shared/src/expenses.ts`**

```ts
// shared/src/payments.ts
import { z } from 'zod';
import { PAYMENT_MODES } from './enums';
import { audit, isoDate, objectId } from './common';

export const paymentCreate = z.object({
  customerId: objectId,
  amount: z.number().positive(), // must also be ≤ customer's current udhaarBalance (server-checked)
  date: isoDate,
  mode: z.enum(PAYMENT_MODES),
  notes: z.string().trim().max(200).optional(),
});
export const paymentOut = paymentCreate.extend({ _id: objectId }).extend(audit.shape);
export type PaymentOut = z.infer<typeof paymentOut>;
```

```ts
// shared/src/expenses.ts
import { z } from 'zod';
import { EXPENSE_CATEGORIES } from './enums';
import { audit, isoDate, objectId } from './common';

export const expenseCreate = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  date: isoDate,
  notes: z.string().trim().max(200).optional(),
});
export const expenseUpdate = expenseCreate.partial();
export const expenseOut = expenseCreate.extend({ _id: objectId }).extend(audit.shape);
export type ExpenseOut = z.infer<typeof expenseOut>;
```

- [ ] **Step 7: Create `shared/src/movements.ts`**

```ts
import { z } from 'zod';
import { ITEM_KINDS, MOVEMENT_TYPES, REF_TYPES } from './enums';
import { isoDate, listQuery, money, objectId } from './common';

export const adjustmentCreate = z.object({
  itemKind: z.enum(ITEM_KINDS),
  itemId: objectId,
  qty: z.number().refine((q) => q !== 0, { message: 'qty cannot be zero' }), // signed
  note: z.string().trim().min(3).max(200), // mandatory — the "why"
});

export const movementOut = z.object({
  _id: objectId,
  type: z.enum(MOVEMENT_TYPES),
  itemKind: z.enum(ITEM_KINDS),
  itemId: objectId,
  qty: z.number(), // signed: + in, − out
  unitCost: money.optional(), // admin only
  refType: z.enum(REF_TYPES),
  refId: objectId.optional(),
  note: z.string().optional(),
  createdBy: objectId.optional(),
  createdAt: isoDate,
});
export type MovementOut = z.infer<typeof movementOut>;

export const movementQuery = listQuery.extend({
  itemKind: z.enum(ITEM_KINDS).optional(),
  itemId: objectId.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
```

- [ ] **Step 8: Run tests** — `npm test --workspace shared` → PASS (all, including the 5 new).

- [ ] **Step 9: Commit**

```powershell
git add shared/src
git commit -m "feat(shared): transaction schemas (purchases, production, sales, payments, expenses, movements)"
```

---

### Task 6: Auth + reports schemas and the barrel export

**Files:**
- Create: `shared/src/auth.ts`, `shared/src/reports.ts`
- Modify: `shared/src/index.ts` (replace placeholder with barrel)

**Interfaces:**
- Produces: `loginRequest`; report schemas `dashboardOut`, `lowStockItem`, `expiringBatch`, `stockValueOut`, `profitReportOut`, `udhaarEntry`, `salesSummaryOut`; `@gym/shared` root exporting EVERYTHING (all later imports are from `'@gym/shared'`, never deep paths).

- [ ] **Step 1: Create `shared/src/auth.ts`**

```ts
import { z } from 'zod';

export const loginRequest = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequest>;
```

- [ ] **Step 2: Create `shared/src/reports.ts`**

```ts
import { z } from 'zod';
import { ITEM_KINDS, PAYMENT_MODES } from './enums';
import { isoDate, money, objectId } from './common';

export const lowStockItem = z.object({
  itemKind: z.enum(ITEM_KINDS),
  itemId: objectId,
  name: z.string(),
  unit: z.string(), // useUnit for RAW, 'unit' for FINISHED
  currentQty: z.number(),
  reorderLevel: z.number(),
});

export const expiringBatch = z.object({
  batchNo: z.string(),
  productId: objectId,
  productName: z.string(),
  expiryDate: isoDate,
  qtyProduced: z.number(),
});

// Admin sees every field; staff response has the money fields stripped (they are optional here).
export const dashboardOut = z.object({
  todaySalesCount: z.number().int(),
  todaySalesTotal: money.optional(),   // admin
  stockValue: money.optional(),        // admin
  udhaarOutstanding: money.optional(), // admin
  lowStock: z.array(lowStockItem),
  expiringSoon: z.array(expiringBatch),
});
export type DashboardOut = z.infer<typeof dashboardOut>;

export const stockValueOut = z.object({
  rawValue: money,      // Σ material.currentQty × avgCost
  finishedValue: money, // Σ product.currentQty × avgUnitCost
  totalValue: money,
});

export const profitReportOut = z.object({
  month: z.string(), // 'YYYY-MM'
  revenue: money,
  costOfGoodsSold: money, // Σ unitCostAtSale × qty over the month's sales
  grossProfit: money,     // revenue − costOfGoodsSold
  overhead: money,        // month's expenses total
  unitsProduced: z.number(),
  unitsSold: z.number(),
  overheadPerUnit: money, // overhead ÷ unitsProduced (0 if none produced)
  netProfit: money,       // grossProfit − overhead
});

export const udhaarEntry = z.object({
  customerId: objectId,
  name: z.string(),
  phone: z.string().optional(),
  balance: money,
});

export const salesSummaryOut = z.object({
  from: isoDate,
  to: isoDate,
  count: z.number().int(),
  revenue: money.optional(), // admin
  byPaymentMode: z.array(z.object({ mode: z.enum(PAYMENT_MODES), count: z.number().int(), total: money.optional() })),
});

// POST /api/admin/recount response — cache rebuild report
export const recountOut = z.object({
  driftsFound: z.number().int(),
  details: z.array(z.object({
    itemKind: z.enum(ITEM_KINDS),
    itemId: objectId,
    name: z.string(),
    cachedQty: z.number(),  // value before rebuild
    ledgerQty: z.number(),  // value recomputed from movements
  })),
});
```

- [ ] **Step 3: Replace `shared/src/index.ts` with the barrel**

```ts
export * from './enums';
export * from './common';
export * from './auth';
export * from './users';
export * from './materials';
export * from './products';
export * from './partners';
export * from './purchases';
export * from './production';
export * from './sales';
export * from './payments';
export * from './expenses';
export * from './movements';
export * from './reports';
```

- [ ] **Step 4: Verify** — `npm run typecheck --workspace shared` → clean; `npm test --workspace shared` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add shared/src
git commit -m "feat(shared): auth + report schemas and barrel export"
```

---

### Task 7: Backend TypeScript conversion

**Files:**
- Create: `backend/tsconfig.json`, `backend/src/server.ts`, `backend/src/config/db.ts`
- Modify: `backend/package.json` (scripts + devDeps)
- Delete: `backend/src/server.js`, `backend/src/config/db.js`

**Interfaces:**
- Consumes: nothing from shared yet (Phase 1a wires routes to schemas).
- Produces: `app` default-exported from `server.ts` is NOT yet split for supertest — Phase 1a will split into `app.ts` (creates app) + `server.ts` (listens). Keep `connectDB(): Promise<void>` default-exported from `config/db.ts`.

- [ ] **Step 1: Install backend TS toolchain**

```powershell
npm install --save-dev --workspace backend typescript tsx vitest "@types/express" "@types/cors" "@types/node"
npm uninstall --workspace backend nodemon
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `backend/src/config/db.ts`** (then delete `db.js`)

```ts
import dns from 'node:dns';
import mongoose from 'mongoose';

// On this machine Node's DNS resolver points at 127.0.0.1 (a local proxy that
// doesn't answer), which breaks the mongodb+srv SRV lookup even though normal
// browsing works. Resolve through public DNS instead.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;

  if (!uri || uri.includes('your_mongodb_connection_string')) {
    console.warn('MONGO_URI is not set in backend/.env - the API is running WITHOUT a database.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${(error as Error).message}`);
  }
};

export default connectDB;
```

- [ ] **Step 4: Create `backend/src/server.ts`** (then delete `server.js`)

```ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true, // cookie-based JWT auth
}));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Gym API is running' });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void connectDB();
});
```

```powershell
Remove-Item "backend\src\server.js", "backend\src\config\db.js" -Force
```

- [ ] **Step 5: Update `backend/package.json` scripts**

```json
"scripts": {
  "dev": "tsx watch src/server.ts",
  "start": "tsx src/server.ts",
  "typecheck": "tsc --noEmit"
}
```
Do NOT add a `test` script yet — Phase 1a adds it together with the first test files (vitest is already installed for that).

- [ ] **Step 6: Verify**

Run: `npm run typecheck --workspace backend` → clean.
Start: `npm run dev:api` (background), then `Invoke-RestMethod http://localhost:5000/api/health` → `{ status: 'ok', ... }` and the log shows `MongoDB connected: ...`. Stop the server afterwards (find PID via `Get-NetTCPConnection -LocalPort 5000`).

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "refactor(backend): convert to TypeScript (tsx runtime, strict)"
```

---

### Task 8: Frontend TypeScript conversion + UI dependencies

**Files:**
- Create: `frontend/tsconfig.json`, `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`
- Modify: `frontend/next.config.mjs`, `frontend/package.json`
- Delete: `frontend/jsconfig.json`, `frontend/src/app/layout.js`, `frontend/src/app/page.js`

**Interfaces:**
- Consumes: `ROLES` from `@gym/shared` (proves workspace + transpilePackages wiring).
- Produces: TS Next.js app with MUI, TanStack Query, and msw installed (used in Phase 1b).

- [ ] **Step 1: Install frontend toolchain + UI deps**

```powershell
npm install --save-dev --workspace frontend typescript "@types/react" "@types/react-dom" "@types/node" msw
npm install --workspace frontend "@mui/material" "@emotion/react" "@emotion/styled" "@mui/icons-material" "@mui/material-nextjs" "@mui/x-data-grid" "@tanstack/react-query" zod
```

- [ ] **Step 2: Create `frontend/tsconfig.json`, delete `jsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```powershell
Remove-Item "frontend\jsconfig.json" -Force
```

- [ ] **Step 3: Update `frontend/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gym/shared'],
};

export default nextConfig;
```

- [ ] **Step 4: Convert `layout.js` → `layout.tsx`** (keep the scaffold's Geist fonts; retitle)

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gym Inventory',
  description: 'Inventory, production and sales management',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
```

```powershell
Remove-Item "frontend\src\app\layout.js" -Force
```

- [ ] **Step 5: Convert `page.js` → `page.tsx`** (placeholder proving the shared import; Phase 1b replaces it)

```tsx
import { ROLES } from '@gym/shared';

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Gym Inventory</h1>
      <p>Shared contract wired — roles: {ROLES.join(', ')}</p>
    </main>
  );
}
```

```powershell
Remove-Item "frontend\src\app\page.js" -Force
```

- [ ] **Step 6: Verify** — `npm run build --workspace frontend` → build succeeds (this also runs Next's TS check and generates `next-env.d.ts`). Note: `frontend/CLAUDE.md` (generated by create-next-app) documents Next 16 breaking changes — read it if the build errors.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "refactor(frontend): convert to TypeScript, add MUI/TanStack Query/msw, wire @gym/shared"
```

---

### Task 9: Whole-workspace verification + README refresh

**Files:**
- Modify: `README.md` (Running section)

- [ ] **Step 1: Full verification from root**

Run: `npm run typecheck` → shared + backend + frontend all clean.
Run: `npm test` → shared tests pass (others have no test script yet).
Run: `npm run dev:api` (background) → health endpoint OK + MongoDB connected; stop it.

- [ ] **Step 2: Update `README.md`** — replace the "Running the app" commands with:

```markdown
## Running the app

Install once from the repo root: `npm install`

**Terminal 1 — backend**  `npm run dev:api`  → http://localhost:5000 (health: /api/health)
**Terminal 2 — frontend** `npm run dev:web`  → http://localhost:3000

Workspaces: `shared/` (zod contract) · `backend/` (Express API) · `frontend/` (Next.js + MUI).
See `CLAUDE.md` for project conventions and `docs/superpowers/` for spec & plans.
```

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: workspace run instructions"
```

---

## Follow-up plans (not in this document)

- **Phase 1a — Backend API** (models → `postMovement` ledger service → business services → routes/serializers, TDD with vitest + supertest + mongodb-memory-server replica set)
- **Phase 1b — Frontend screens** (MUI shell, all pages against msw mocks of this contract)
- **Phase 2 — Integration** (swap msw for real API, seed script, end-to-end verification)

Each will be written with superpowers:writing-plans after this plan completes, importing the exact names in the Interfaces blocks above.
