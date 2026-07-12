# Phase 2: Completion — hardening, seams, polish, E2E

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Contracts-style plan (like Phase 1b Tasks 2-10): each task lists precise requirements + acceptance criteria; implementers follow existing codebase patterns.

**Goal:** Close every recorded Phase 2 ticket from the Phase 1a/1b post-review amendments and add real browser end-to-end tests, completing the project.

**Sources of the ticket list:** `docs/superpowers/plans/2026-07-11-phase1a-backend-api.md` and `...phase1b-frontend.md` — "Post-review amendments" sections.

## Global Constraints

- Branch: `phase2-completion`. Working dir: repo root `C:\Users\abhis\OneDrive\Desktop\gym project` (space — quote). PowerShell for anything network/build/test. ASCII only in new code.
- All existing conventions bind (CLAUDE.md, design tokens in the 1b plan). Shared zod contract changes must stay additive.
- Per-task verification: affected workspace suites + build/lint/typecheck green. Commit per task with the Co-Authored-By footer. Never commit/print `.env*`.

---

### Task 1: Backend hardening

**Files:** `backend/src/routes/users.ts`, `backend/src/routes/auth.ts` (or middleware), `backend/src/server.ts`, `backend/src/routes/admin.ts`, `backend/package.json`, tests.

**Requirements:**
1. **Self-demotion guard:** PATCH /users/:id — when the target is the caller AND the validated body sets `role` to a non-admin value, throw `ApiError(400, 'SELF_DEMOTE', 'You cannot remove your own admin role')`. Test: admin PATCH self role staff → 400; PATCH self name → still 200.
2. **JWT_SECRET boot check:** in server.ts after dotenv, if `!process.env.JWT_SECRET`, `console.error('JWT_SECRET is not set in backend/.env - refusing to start')` and `process.exit(1)`. (Tests set it in globalSetup; don't break them.)
3. **Login timing side-channel:** in the login handler, when the user is not found, still run `bcrypt.compare(password, DUMMY_HASH)` (a module-level constant bcrypt hash of a random string) before returning 401, so unknown-email and wrong-password take comparable time. Behavior otherwise unchanged; existing tests must stay green.
4. **Login rate limiting:** `npm install --workspace backend express-rate-limit`; apply to POST /api/auth/login only: 10 attempts per 15 minutes per IP, standard headers, handler returning the project error envelope `{ error: { code: 'RATE_LIMITED', message: 'Too many login attempts - try again in a few minutes' } }`. Test: 11th rapid login attempt → 429 (use a fresh app instance so other tests aren't rate-limited; if isolation is awkward, configure the limiter via env var `LOGIN_RATE_LIMIT` disabled under NODE_ENV=test and assert the middleware wiring instead — disclose the choice).
5. **Recount concurrency decision (recorded):** add a comment on `runRecount` + a line in the README API section: recount is not transactional under concurrent writes — run when the shop is idle. (Decision: document, don't rebuild — 2-user shop.)

**Acceptance:** backend suite green (46 + new tests), typecheck clean.
**Commit:** `feat(api): hardening - self-demotion guard, boot check, login timing and rate limit`

---

### Task 2: Frontend seams — server-searched lookups + recount button

**Files:** `frontend/src/app/(app)/sales/page.tsx`, `frontend/src/components/ProductionForm.tsx`, `frontend/src/app/(app)/reports/page.tsx`, possibly a new shared component `frontend/src/components/ServerSearchSelect.tsx`.

**Requirements:**
1. Extract the SaleEntry debounced-server-search Autocomplete pattern into a small reusable component (`ServerSearchSelect<T>`: props resource, itemSchema, getLabel, value, onChange, label, extraFilter?) and use it for: (a) the sales-page customer FILTER; (b) ProductionForm's product picker (server search + client-side `bom.length > 0` filter on the returned page, keep the no-recipe hint). SaleEntry's own two Autocompletes may migrate to it if the diff stays clean — implementer's call, disclose.
2. **Recount button (admin):** on the Reports page add an admin-only "Recount stock caches" section: description line ("Rebuilds cached stock and udhaar balances from the ledger. Run when the shop is idle."), button → ConfirmDialog → POST /api/admin/recount → render the recountOut result: driftsFound + customersFixed as stat lines and, when non-empty, a small table of details (name, kind, cached vs ledger in mono). Success notify "Recount complete - N drifts fixed".

**Acceptance:** build/lint/tests green; customer filter and product picker work past 100 records by construction; recount renders both zero-drift and drift results.
**Commit:** `feat(web): server-searched lookups and admin recount`

---

### Task 3: UI polish sweep (bounded to the ticket list)

**Files:** `frontend/src/lib/fmt.ts` (+test), the payment-mode ToggleButtonGroups (SaleEntry, PurchaseForm, TakePaymentDialog), list pages' EmptyStates, `SaleDetailDialog.tsx`, `frontend/src/app/(app)/production/page.tsx` detail dialog, `purchases/page.tsx` detail dialog, `CustomerLedgerDrawer.tsx`, `AppShell.tsx`.

**Requirements (each maps to a recorded ticket — nothing else):**
1. `enumLabel` acronym map (UPI → UPI; default behavior otherwise) + test; use `enumLabel` for the payment-mode ToggleButton labels everywhere they currently show raw enum values.
2. Filtered-empty copy: every list page's EmptyState distinguishes "no data at all" (first-use invite copy) from "no matches for these filters" (when any filter/search is active).
3. Staff cost columns: in sale/production/purchase detail dialogs, hide cost columns entirely when NO row carries the field (admin sees them; staff — absent fields — sees no all-em-dash column).
4. Take-payment button disabled (with spinner or skeleton) until the customer detail query resolves.
5. Failed logout: notify('Logout failed - try again') on error (navigation in finally stays).

**Acceptance:** build/lint/tests green; each item verifiable in the diff.
**Commit:** `fix(web): polish sweep - enum labels, empty states, staff columns, payment guard, logout feedback`

---

### Task 4: Playwright end-to-end tests

**Files:** root `package.json` (devDep + script), `playwright.config.ts` (root), `e2e/` folder (specs + helpers), README section.

**Requirements:**
1. `npm install --save-dev @playwright/test` at the ROOT workspace, then `npx playwright install chromium` (large download — PowerShell, generous timeout).
2. **Isolated E2E database:** never touch the real `gymdb`. Mechanism: dotenv does NOT override pre-set env vars, so derive an e2e URI from backend/.env at runtime WITHOUT printing it — a small node helper `e2e/env.mjs` that reads `backend/.env`, swaps the db name `/gymdb` → `/gymdb_e2e`, and returns it; a setup script sets `process.env.MONGO_URI` to that before spawning seed/API. Global setup: drop `gymdb_e2e` (mongoose connect + dropDatabase), run the seed (`tsx backend/src/seed.ts` with the env preset), start the API (port 5001 via PORT env to avoid clashing with any dev server; CLIENT_URL http://localhost:3001) and the frontend (`next dev` or prod start on 3001 with NEXT_PUBLIC_API_URL=http://localhost:5001/api). Use Playwright's `webServer` array config for both processes (it manages startup/teardown). Global teardown: drop the e2e db.
3. **Specs (keep tight and stable — data-independent assertions):**
   - `auth.spec.ts`: admin logs in → dashboard shows "Today's take" card (admin KPI) and the Users nav item; logout → back at login. Staff logs in → NO "Today's take" card, NO Users nav item.
   - `sale.spec.ts`: admin records a cash sale of 1 seeded product via the UI (search, add, Full, Record sale) → success snackbar contains an invoice number matching /S-\d{8}-\d+/; the sales table's first row shows that invoice.
   - `khata.spec.ts`: open Customers → open the seeded customer's Khata → take a payment of 1 → snackbar "Payment recorded".
   - Use robust selectors (getByRole/getByLabel/text) — no CSS-class selectors.
4. Root script `"e2e": "playwright test"`; README "## End-to-end tests" section (how to run, that it uses gymdb_e2e, chromium download note). E2E is NOT part of `npm test` (network + browser dependency) — document that.
5. Run the suite via PowerShell and make it pass (this is the browser click-through the project has been deferring — flaky selectors get fixed, real integration bugs found here get fixed if small/frontend-side, else reported BLOCKED with details).

**Acceptance:** `npm run e2e` green locally (evidence in report: playwright output with 3+ passed specs); real gymdb untouched (assert seed summary printed for gymdb_e2e).
**Commit:** `test(e2e): playwright flows for auth, sales and khata`

---

### Task 5: Final verification + docs + close-out

**Requirements:**
1. Full: root `npm test` (78+ tests), root typecheck, frontend build, backend boot smoke against real Atlas (health + admin login via session), `npm run e2e` once more, everything stopped/ports free after.
2. Docs: README final pass (project status section: what exists, how to run, test/e2e commands, seeded logins with change-them note); CLAUDE.md add one line to commands (`npm run e2e`).
3. Update both old plans' amendment sections: mark the Phase 2 tickets DONE with this plan's reference.

**Acceptance:** all green, docs accurate.
**Commit:** `docs: project completion pass`

Then the controller runs the final whole-branch review (max model) and the project completion summary.
