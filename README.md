# Gym Project

Full-stack app with a **Next.js frontend** and a **Node.js (Express) backend** using **MongoDB Atlas**.

```
gym project/
├── frontend/   → Next.js (JavaScript, App Router, Tailwind)  → http://localhost:3000
└── backend/    → Express + Mongoose API                       → http://localhost:5000
```

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
- `admin/recount` - recompute cached quantities/costs from the ledger (admin only)

## Environment variables

| File | Variable | What it is |
|------|----------|------------|
| `backend/.env` | `MONGO_URI` | Your MongoDB Atlas connection string (see below) |
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
