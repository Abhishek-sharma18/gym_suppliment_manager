# Gym Inventory, Production & Sales System — Design Spec

**Date:** 2026-07-11
**Status:** Approved by user (stack, structure, language, auth, and ledger approach all confirmed)

## 1. Purpose

A small business runs a gym that produces and sells its own products (supplements/consumables). The owner needs to track raw materials, production batches, finished-goods stock, sales (including udhaar/credit), expenses, and true per-unit profit — with a strict audit trail answering questions like "why does it show 40 jars when I have 35." Two kinds of users: the owner (admin) and shop staff.

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + MUI, mobile-first — existing `frontend/` scaffold, converted to TypeScript |
| Backend | Express 5 + Mongoose 9 — existing `backend/` scaffold, converted to TypeScript (run via `tsx`) |
| Database | MongoDB Atlas (existing cluster, db `gymdb`). It is a replica set → multi-document transactions work. No Docker. |
| Language | TypeScript everywhere |
| Shared contract | `shared/` package (zod schemas, enums, inferred types) wired via npm workspaces at repo root |
| Auth | JWT in httpOnly cookie; bcrypt password hashes |
| Ledger enforcement | Service-layer `postMovement()` — the only write path for stock (Approach A) |
| Currency | ₹ (INR) |

**Machine note:** Node's DNS resolver on this machine is broken for SRV lookups; `backend/src/config/db.js` already calls `dns.setServers(['8.8.8.8','1.1.1.1'])`. Preserve this in the TS conversion.

## 3. Repository layout

```
gym project/                      (single git repo, npm workspaces root)
├── package.json                  workspaces: ["shared", "backend", "frontend"]
├── CLAUDE.md                     non-negotiables for every agent (§12)
├── shared/                       @gym/shared — zod schemas, enums, types (TS source consumed directly)
│   └── src/ (enums.ts, schemas per entity, api contract types, index.ts)
├── backend/                      Express API (port 5000)
│   └── src/ (config, models, services, routes, middleware, serializers, tests, seed)
└── frontend/                     Next.js app (port 3000)
```

- `shared` exports TS source (`main: src/index.ts`); backend consumes it via `tsx`, frontend via `transpilePackages: ['@gym/shared']`. No build step for shared.
- Frontend adds: `@mui/material`, `@mui/material-nextjs`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `@mui/x-data-grid` (community), `@tanstack/react-query`, `zod` (via shared).

## 4. Data model (Mongo collections)

All docs carry audit fields `createdBy`, `updatedBy` (user ids) and timestamps. Master data (materials, products, suppliers, customers) uses soft delete (`isDeleted`), admin only. Money is stored in paise-free decimal rupees (Number), quantities as Numbers.

- **users** — name, email (unique), passwordHash, role: `admin | staff`, isActive.
- **raw_materials** — name, buyUnit (e.g. kg, box), useUnit (e.g. g, piece), conversionFactor (1 buyUnit = N useUnit), reorderLevel (useUnit), **currentQty** (useUnit, cached), **avgCost** (₹ per useUnit, cached moving weighted average), isDeleted.
- **products** — name, variant/size label, sku, sellingPrice, packagingCostPerUnit, `bom[]`: `{ materialId, qtyPerUnit (useUnit) }`, reorderLevel, **currentQty** (cached), isDeleted.
- **suppliers** — name, phone, address, notes, isDeleted.
- **customers** — name, phone, **udhaarBalance** (cached ₹ outstanding), isDeleted.
- **purchases** — supplierId, invoiceNo?, date, items[]: `{ materialId, qtyBuyUnit, costPerBuyUnit, lineTotal }`, totalAmount, paymentMode.
- **production_batches** — batchNo (auto `B-YYYYMMDD-<seq>`), productId, qtyProduced, date, expiryDate?, materialsConsumed[]: `{ materialId, plannedQty, actualQty, wastageQty, costPerUseUnit }`, **costSnapshot**: `{ materialCost, packagingCost, totalCost, unitCost }`.
- **sales** — invoiceNo (auto `S-YYYYMMDD-<seq>`), customerId? (required if udhaar > 0), date, items[]: `{ productId, qty, unitPrice (prefilled from product, editable), lineTotal }`, subtotal, discount, total, paymentMode: `CASH | UPI | CARD`, amountPaid, udhaarAmount.
- **payments** — customerId, amount, date, mode, notes (settles udhaar; reduces `udhaarBalance`).
- **expenses** — category: `RENT | SALARY | ELECTRICITY | TRANSPORT | PACKAGING | OTHER`, amount, date, notes. Admin only.
- **stock_movements** — the ledger. `{ type, itemKind: RAW | FINISHED, itemId, qty (signed: + in, − out), unitCost?, refType, refId, note?, createdBy, createdAt }`. **Immutable.**
  Movement types: `PURCHASE_IN, PRODUCTION_CONSUME, PRODUCTION_OUT, SALE_OUT, SALE_RETURN_IN, WASTAGE, ADJUSTMENT`.

## 5. The ledger rule (non-negotiable core)

1. `currentQty` is never edited directly by any route or service except through `postMovement()`.
2. `postMovement()` inserts the movement doc **and** updates the item's cached `currentQty` in the **same Mongo transaction** as the calling business operation.
3. No update or delete endpoint exists for `stock_movements`; a Mongoose guard throws on any update/delete of the collection.
4. Corrections are new `ADJUSTMENT` movements (admin only, with mandatory note) — history is never edited.
5. Outgoing stock is validated: a sale/production that would drive `currentQty` negative fails with 409 (clear message naming the item and available qty).
6. Admin-only `POST /api/admin/recount` rebuilds every cached `currentQty` (and customer `udhaarBalance`) from the ledger/documents and reports drift found.

### Transactional flows

- **Purchase create:** per line → `PURCHASE_IN` (qty converted to useUnit) + update material `avgCost` via moving weighted average: `newAvg = (currentQty*avgCost + inQty*inUnitCost) / (currentQty + inQty)` (guard division by zero; cost per useUnit = costPerBuyUnit / conversionFactor).
- **Production create:** BoM × batch size prefills `plannedQty`; user edits `actualQty` and `wastageQty`. Movements: `PRODUCTION_CONSUME` (−actualQty) and `WASTAGE` (−wastageQty) per material, `PRODUCTION_OUT` (+qtyProduced) for the product. Snapshot `materialCost = Σ(actual+wastage)×avgCost-at-time`, plus `packagingCost = packagingCostPerUnit × qtyProduced`; store `unitCost`.
- **Sale create:** per item `SALE_OUT` (−qty); if `udhaarAmount > 0`, require customer and increase `udhaarBalance` in the same transaction.
- **Sale return:** admin-only endpoint on a sale; restocks selected items via `SALE_RETURN_IN` and decreases the sale's udhaar/records refund note.
- **Payment create:** decreases customer `udhaarBalance` (not below the effect of recorded docs; validation against current balance) in a transaction.

## 6. Costing & profit

- Raw materials: moving weighted average, updated only on purchase (see above).
- Batches: cost snapshot at production time — later price changes never rewrite history.
- Overhead: computed at **report time** = month's total expenses ÷ units produced that month.
- Profit per sale item = unitPrice − (unit cost from the batch snapshot average for that product + overhead per unit for the sale's month). Reports show gross (before overhead) and net (after) so the math is transparent.

## 7. Auth & RBAC

- Login: `POST /api/auth/login` → JWT (7-day) set as httpOnly, sameSite=lax cookie. `POST /api/auth/logout` clears it. `GET /api/auth/me` returns the current user.
- Middleware: `requireAuth` (verifies cookie JWT, loads user), `requireRole('admin')`, `validate(schema)` (zod, from shared).
- **Field-level stripping in serializers** — every response passes through a role-aware serializer; for staff it omits: `avgCost`, `costSnapshot`, any `profit`/cost fields, expense data, and other users' personal data. This is enforced in the API; frontend hiding is cosmetic.

| Capability | admin | staff |
|---|---|---|
| Create sales / production / purchases | ✔ | ✔ |
| View stock levels & alerts | ✔ | ✔ |
| View own entries | ✔ | ✔ |
| View costs, profit, expenses, money reports | ✔ | ✖ (stripped at API) |
| Master data CRUD (materials, products, suppliers, customers) | ✔ | view only |
| Expenses CRUD | ✔ | ✖ |
| Stock ADJUSTMENT / recount / sale returns | ✔ | ✖ |
| Users CRUD, soft deletes | ✔ | ✖ |

## 8. API surface (REST, `/api/*`)

Auth (`/auth/login`, `/auth/logout`, `/auth/me`); CRUD for `users`* , `materials`, `products`, `suppliers`, `customers`, `expenses`*; create+list+get for `purchases`, `production`, `sales` (+ `POST /sales/:id/return`*), `payments`; `GET /movements` (filterable by item/type/date); reports: `GET /reports/dashboard`, `/reports/stock-value`*, `/reports/profit`*, `/reports/low-stock`, `/reports/expiring` (default 30 days), `/reports/udhaar`, `/reports/sales-summary`; `POST /admin/recount`*. (* = admin only.) All request/response shapes defined as zod schemas in `shared`.

Error handling: central Express error middleware — zod → 400 with per-field errors; auth → 401/403; insufficient stock → 409 with human-readable message; unknown → 500 logged. Responses use `{ data }` / `{ error: { code, message, fields? } }` envelopes.

## 9. Frontend

One MUI layout shell (AppBar + responsive Drawer), role-filtered navigation, mobile-first. TanStack Query for fetching/mutations with invalidation; forms validated with the shared zod schemas.

Pages: **Login** → **Dashboard** (admin: today's sales ₹, stock value, low-stock, expiring-soon, udhaar outstanding; staff: stock/entry KPIs only) → **Sales** (fastest screen: product search, qty steppers, running total, payment split, minimal taps) → **Production** (pick product + batch size → BoM auto-fills consumption, editable actuals + wastage) → **Purchases** → **Materials** → **Products & recipes (BoM editor)** → **Customers / udhaar ledger** → **Expenses** (admin) → **Reports** (admin sees money; staff sees stock) → **Users** (admin).

Route guard: `/api/auth/me` check in the shell; unauthenticated → login; admin-only pages redirect staff away.

## 10. Testing & seed

- Backend: vitest + supertest against `mongodb-memory-server` **replica set** (transactions exercised for real). Must-cover invariants: ledger math (every flow writes correct movements + cache), insufficient-stock rejection, moving-average correctness, batch snapshot immutability, RBAC route guards, **staff field-stripping** (staff response contains no cost/profit key anywhere), recount rebuild.
- Frontend: build passes; component logic kept thin so integration testing happens against the seeded API.
- `backend/src/seed.ts`: creates admin (`admin@gym.local` / printed password), one staff user, sample materials/products with BoM, a purchase, a batch, sales (cash + udhaar), payments, expenses.

## 11. Build phases

- **Phase 0 — Contract & workspace:** root workspaces, TS conversion of both apps, entire `shared` package (every entity + request/response schema, enums, route list), CLAUDE.md.
- **Phase 1 — Parallel build:** backend (models → services → routes, with tests) and frontend (all screens against the shared contract with MSW mocks) built independently against the Phase 0 contract.
- **Phase 2 — Integration:** swap MSW for the real API, run seed, fix drift, verify end-to-end flows (login → purchase → production → sale → reports), full test pass.

## 12. Non-negotiables (goes into CLAUDE.md)

1. Stock is never edited directly — every change is an immutable `stock_movement` via `postMovement()` inside a transaction.
2. Corrections = new ADJUSTMENT entries; history is never edited or deleted.
3. RBAC enforced in the API (route guards + field stripping); UI hiding is cosmetic.
4. Batch cost snapshots are immutable; overhead only at report time.
5. All request validation via `@gym/shared` zod schemas — no hand-rolled validation.
6. MUI-only UI, mobile-first.
7. Audit fields (`createdBy`/`updatedBy`) on every document.
8. Keep the `dns.setServers` fix in the DB config.
