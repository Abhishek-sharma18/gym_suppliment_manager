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
11. **Dates on the wire are ISO strings; `*Out` schemas coerce to `Date`.** Every API response consumed by the frontend is validated with its `*Out` schema via `.parse()` — never cast (`as SaleOut`) a raw fetch result.
12. **The server rounds all money to 2 decimals (paise)** before computing or persisting any derived amount (line totals, udhaar, costs, averages).

## RBAC summary

staff may: create sales/production/purchases, view stock levels & their own entries. staff may NOT: see any cost/profit/expense number, edit master data, manage users, adjust stock, delete anything. admin: everything.
