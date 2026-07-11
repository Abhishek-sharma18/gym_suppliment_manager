# Gym Project

Full-stack app with a **Next.js frontend** and a **Node.js (Express) backend** using **MongoDB Atlas**.

```
gym project/
├── frontend/   → Next.js (JavaScript, App Router, Tailwind)  → http://localhost:3000
└── backend/    → Express + Mongoose API                       → http://localhost:5000
```

## Running the app

Open two terminals:

**Terminal 1 — backend**
```bash
cd backend
npm run dev
```

**Terminal 2 — frontend**
```bash
cd frontend
npm run dev
```

Check the API is up: open http://localhost:5000/api/health

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
