# Gym Project

Full-stack app with a **Next.js frontend** and a **Node.js (Express) backend** using **MongoDB Atlas**.

```
gym project/
├── frontend/   → Next.js (JavaScript, App Router, Tailwind)  → http://localhost:3000
└── backend/    → Express + Mongoose API                       → http://localhost:5000
```

## Project status

All planned phases are complete: the shared zod contract (Phase 0), the backend API (Phase 1a),
the frontend (Phase 1b), and Phase 2 hardening/polish/E2E (see `docs/superpowers/plans/`).

What exists:
- `shared/` — the zod contract (schemas, enums, `*In`/`*Out` types) consumed by both apps.
- `backend/` — Express 5 + Mongoose 9 API covering auth, users, materials, products, suppliers,
  customers, purchases, production, sales/returns, payments, expenses, movements, reports, and
  admin recount, with RBAC, transactional stock movements, and an immutable audit trail.
- `frontend/` — Next.js 16 + MUI app covering every page listed under "Frontend" below, built
  directly against the live API.
- `e2e/` — Playwright browser tests for the three signature flows (auth/RBAC, a cash sale, a
  udhaar payment), run against an isolated `gymdb_e2e` database.

How to run it: see "Running the app" immediately below (two terminals: `npm run dev:api` and
`npm run dev:web`), then log in with a seeded account (see "API" section for credentials).

Test / e2e commands:
- `npm test` (repo root) — unit + integration tests across all three workspaces (shared, backend,
  frontend); no network or browser required.
- `npm run typecheck` (repo root) — TypeScript project-reference typecheck for `shared` and
  `backend` (the frontend's typecheck runs as part of `npm run build`, see below).
- `npm run build --workspace frontend` — Next.js production build (also typechecks the frontend).
- `npm run e2e` (repo root) — Playwright browser end-to-end suite; see "End-to-end tests" below.
  Not part of `npm test` (needs a network connection and a downloaded browser).

Seeded logins (`npm run seed --workspace backend`) — **change these before any real deployment**:
- `admin@gym.local` / `Admin@123!` (role: admin)
- `staff@gym.local` / `Staff@123!` (role: staff)

## Running the app

Install once from the repo root: `npm install`

**Terminal 1 — backend:** `npm run dev:api` → http://localhost:5000 (health check: /api/health)

**Terminal 2 — frontend:** `npm run dev:web` → http://localhost:3000

Workspaces: `shared/` (zod contract) · `backend/` (Express API) · `frontend/` (Next.js + MUI).
See `CLAUDE.md` for project conventions and `docs/superpowers/` for the spec & plans.

## API

Base URL: `http://localhost:5000/api`

Load demo data (idempotent - skips if any user already exists): `npm run seed --workspace backend`

Seeded logins (change these before any real deployment):
- `admin@gym.local` / `Admin@123!` (role: admin)
- `staff@gym.local` / `Staff@123!` (role: staff)

Route groups:
- `auth` - login / logout / current user
- `users` - user accounts (admin only)
- `materials` - raw material master data + stock cache
- `products` - finished product master data + BoM
- `suppliers` - supplier master data
- `customers` - customer master data + udhaar balance
- `purchases` - stock-in from suppliers (moving-average cost)
- `production` - production batches (BoM consumption -> finished goods)
- `sales` - sales + returns (cash and udhaar)
- `payments` - udhaar collection from customers
- `expenses` - shop expenses (admin only)
- `movements` - read-only stock ledger (stock_movements)
- `reports` - stock, sales, and P&L summaries
- `admin/recount` - recompute cached quantities/costs from the ledger (admin only). Not transactional under concurrent writes - run it when the shop is idle (2-user shop; documented tradeoff, not rebuilt).

## Frontend

Next.js (App Router) + MUI, built directly against the live API described above (Phase 1b — see `docs/superpowers/specs/2026-07-11-gym-inventory-design.md` §11).

Run it: `npm run dev:web` → http://localhost:3000 (needs the backend running too; see above). Log in with one of the seeded accounts.

Pages (all under the authenticated app shell, admin-only ones hidden from staff in the nav):
- **Login** — email/password against `/api/auth/login`.
- **Dashboard** — today's KPIs; admin sees money figures, staff sees stock-only figures.
- **Sales** — fast sale entry (product search, qty steppers, running total, payment split) + sales history with returns.
- **Production** — record batches (BoM auto-fills consumption, editable actuals/wastage) + batch history.
- **Purchases** — record stock-in from suppliers + purchase history.
- **Materials** / **Products** — raw material and finished product master data, stock, and (products) the BoM recipe editor.
- **Suppliers** / **Customers** — partner master data; Customers also has the udhaar ledger drawer and "take payment".
- **Expenses** (admin) — shop expenses by category.
- **Reports** (admin: profit, stock value, udhaar outstanding; both roles: sales summary).
- **Users** (admin) — create/edit accounts, role, active status, password reset, deactivate.

## Tests

Unit/integration tests run per-workspace with Vitest (backend also uses Supertest against an
in-memory MongoDB via `mongodb-memory-server` — no Atlas connection needed).

- `npm test` (repo root) — runs all three workspaces: `shared` (17 tests), `backend` (49 tests),
  `frontend` (19 tests).
- `npm run typecheck` (repo root) — `tsc --noEmit` for `shared` and `backend`.
- `npm run build --workspace frontend` — also runs the frontend's TypeScript check.

Browser end-to-end tests are separate — see the next section.

## End-to-end tests

Playwright drives a real Chromium browser through the three signature flows: login/RBAC visibility
(`e2e/auth.spec.ts`), recording a cash sale (`e2e/sale.spec.ts`), and taking a udhaar payment from a
customer's khata (`e2e/khata.spec.ts`).

Run it: `npm run e2e` (from the repo root).

- **One-time setup:** `npx playwright install chromium` — downloads a Chromium build (~150 MB).
- **Its own database:** the suite never touches `gymdb`. A global setup step derives an E2E
  connection string from `backend/.env` (swapping `/gymdb` → `/gymdb_e2e`), drops that database,
  and re-seeds it fresh before every run; a global teardown step drops it again afterwards.
- **Its own ports:** the API runs on `5001` and the frontend (`next dev`) on `3001`, so the suite
  can run alongside your normal `npm run dev:api` / `npm run dev:web` (ports 5000/3000) without
  colliding. Playwright's `webServer` config starts and stops both processes automatically.
- **Not part of `npm test`:** E2E tests need a network connection (Atlas) and a browser download,
  so they're deliberately excluded from the plain `npm test` workspace suite — run `npm run e2e`
  separately (e.g. in CI, as its own step, after the browser is installed).
- **Mobile responsiveness audit (not part of `npm run e2e`):** `MOBILE_AUDIT=1 npx playwright test
  mobile-audit` walks every page at two narrow viewports (390×844, 360×800), asserts there's no
  page-level horizontal overflow, opens each page's primary dialog/drawer, and saves full-page
  screenshots under `.superpowers/sdd/mobile-audit/` (git-ignored) for visual review.

Design tokens: khata red / brass / warm paper palette, Bricolage Grotesque for page titles, IBM Plex Sans for body text, IBM Plex Mono for every money amount and invoice/batch number. Money totals (sale totals, udhaar balances, report KPIs) get the signature hand-ruled double-underline. See `frontend/src/lib/theme.ts` for the exact values.

## Environment variables

| File | Variable | What it is |
|------|----------|------------|
| `backend/.env` | `MONGO_URI` | Your MongoDB Atlas connection string (see below) |
| `backend/.env` | `JWT_SECRET` | Secret for signing login tokens (required — server refuses to start without it) |
| `backend/.env` | `PORT` | API port (default 5000) |
| `backend/.env` | `CLIENT_URL` | Frontend origin allowed by CORS (default http://localhost:3000) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | Base URL the frontend uses to call the API |

`.env` files are git-ignored. `.env.example` files show the expected format.

## Creating a free MongoDB Atlas cluster

1. Sign up at https://www.mongodb.com/cloud/atlas/register (Google sign-in works).
2. When asked to deploy a cluster, pick the **M0 Free** tier. Choose a provider (AWS is fine) and the region closest to you (e.g. Mumbai `ap-south-1`).
3. Atlas will ask you to create a **database user** — set a username and password. Save the password; you'll need it in the connection string. Avoid `@`, `:` or `/` in the password.
4. Under **Network Access**, click **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`) for development (or "Add current IP address" for more security).
5. On your cluster, click **Connect → Drivers**, and copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with your database user's credentials, and add a database name before the `?`:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/gymdb?retryWrites=true&w=majority
   ```
7. Paste it into `backend/.env` as the value of `MONGO_URI` and restart the backend. You should see `MongoDB connected: ...` in the terminal.

## Deployment

Production topology: browser → Vercel (Next.js frontend) → rewrite-proxy `/api/*` → Render (Express
backend) → Atlas. The rewrite keeps the auth cookie (httpOnly, sameSite=lax) first-party on the
Vercel domain, so login works in every browser without loosening cookie settings. Locally nothing
changes: with no `API_PROXY_URL` set, the rewrite is inactive and `NEXT_PUBLIC_API_URL` stays
`http://localhost:5000/api`.

1. **Backend on Render:** New + Blueprint → pick the GitHub repo → Render reads `render.yaml` from
   the repo root. Fill in the prompted env vars: `MONGO_URI` (the Atlas connection string),
   `JWT_SECRET` (a long random string — generate a **new** one for production, don't reuse a local
   dev secret), `CLIENT_URL` (the Vercel URL, added in step 3 below; it can start as `*`). Note that
   `*` is only a temporary placeholder — it is not a valid CORS value combined with credentials, so
   set the real Vercel URL in step 3 before anyone uses the app directly against the Render URL.
   Free plan note: the service spins down after ~15 min idle and the first request after that takes
   ~50s to wake it up — upgrade to the Starter plan to avoid this.
2. **Frontend on Vercel:** New Project → import the same repo → Root Directory = `frontend` (keep
   "Include files outside root directory" ON, since the frontend depends on the `shared` workspace).
   Env vars: `NEXT_PUBLIC_API_URL` = `/api`, `API_PROXY_URL` = the Render URL (e.g.
   `https://gym-khata-api.onrender.com`).
3. Back on Render, set `CLIENT_URL` to the exact Vercel URL (`https://<project>.vercel.app`).
4. **Post-deploy checklist:** log in, immediately change the seeded admin and staff passwords (Users
   page), verify a sale round-trips end to end, and confirm Atlas Network Access allows `0.0.0.0/0`
   (or the specific Render outbound IPs) so the backend can reach the cluster.
