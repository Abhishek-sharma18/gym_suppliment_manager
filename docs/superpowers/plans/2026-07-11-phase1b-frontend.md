# Phase 1b: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The complete Next.js 16 + MUI frontend for the gym inventory system — login, role-aware shell, fast sales entry, production, purchases, master data, customers/udhaar, expenses, reports, users — built directly against the live Phase 1a API.

**Architecture:** App Router with a client-side data layer: a typed fetch wrapper (`lib/api.ts`) that sends cookies and surfaces the API's error envelope; TanStack Query hooks per resource that `.parse()` every response through its `@gym/shared` `*Out` schema (CLAUDE.md rule 11 — never cast); one `AppShell` with role-filtered navigation; role differences come from the API (staff responses simply lack admin-only fields — the UI renders what is present).

**Spec amendment (recorded):** spec §11 planned Phase 1b against msw mocks because backend and frontend were to be built in parallel. The backend is already complete, tested, and seeded — msw would be pure overhead, so Phase 1b builds directly against the live API and Phase 2 shrinks to end-to-end verification + polish. msw stays uninstalled from the critical path.

**Plan format note:** Task 1 (foundation) is verbatim code — every later task imports its exact names. Tasks 2–10 are precise contracts (routes, components, behaviors, acceptance criteria) rather than full code: page composition is judgment work; the reviewer gates each task against its acceptance list.

## Design tokens (bind every task — this is the app's visual identity)

Grounded in the subject: an Indian gym that manufactures and sells its own products, with an udhaar ledger at the counter — part *bahi khata* (the cloth-bound red ledger book), part factory floor.

- **Palette:** khata red `#7B1F24` (primary; dark `#5E1519`), brass `#A87900` (secondary, used sparingly), warm paper `#FBFAF8` (page background), white surfaces, ink `#1F1B18` / muted ink `#6B6259` (text), line `#E7E1D8` (dividers).
- **Type:** Bricolage Grotesque (display — page titles, dialog titles only), IBM Plex Sans (body/UI), IBM Plex Mono (ALL money amounts, invoice/batch numbers, quantities in tables — tabular figures).
- **Signature:** ledger totals (sale total, udhaar balance, report money KPIs) are set in mono with a `3px double` ink bottom border — the hand-ruled khata total line. This is the one memorable element; everything else stays quiet.
- **Shape/density:** 8px radius; AppBar is paper-colored with a bottom divider (not a heavy colored bar); tables dense; buttons `textTransform: none`.
- **Motion:** minimal — skeletons while loading, snackbar confirms. No decorative animation.
- **Copy:** sentence case, plain verbs, from the user's side: "Record sale", "New batch", "Take payment", "Owed ₹1,500". Errors say what happened and what to do. Empty states invite the first action ("No materials yet — add the first one"). Udhaar amounts render in khata red; INR formatted `en-IN`.

## Global Constraints

- Branch: `phase1b-frontend`. Working dir: repo root `C:\Users\abhis\OneDrive\Desktop\gym project` (space — quote). PowerShell for npm/build/test runs (Bash sandbox blocks network). ASCII only in code.
- MUI-only UI (CLAUDE.md rule 6) — Tailwind is removed in Task 1; no other UI/CSS libraries.
- Every API response is validated via its `@gym/shared` `*Out` schema `.parse()` in the query hooks — NEVER `as` casts of fetch results (CLAUDE.md rule 11). Note: `*Out` schemas coerce date strings to `Date` objects — components receive real Dates.
- Role handling: hooks/components must treat admin-only fields as possibly absent (they are `.optional()` in the contract and stripped for staff). Render money/cost UI conditionally on field presence, and hide admin-only nav/pages from staff (cosmetic layer — the API is the enforcement).
- All list screens use server pagination via the shared `listQuery`/`*Query` params against `{ data, page, limit, total }`.
- Mobile-first: every page must be usable at 360px width (nav collapses to a temporary drawer; tables get horizontal scroll or card fallback as specified per task).
- Verification bar per task: `npm run build --workspace frontend` passes (includes TS + ESLint) and, where a task adds lib logic, its focused vitest run passes. Live click-through happens in Task 10 (and Phase 2).
- Commit after every task; messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never commit `.env*`.

---

### Task 1: Foundation — theme, providers, API client, auth, AppShell (VERBATIM)

**Files:**
- Create: `frontend/src/lib/theme.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/fmt.ts`, `frontend/src/lib/auth.ts`, `frontend/src/app/providers.tsx`, `frontend/src/components/AppShell.tsx`, `frontend/src/app/login/page.tsx`, `frontend/src/app/(app)/layout.tsx`, `frontend/src/app/(app)/page.tsx` (placeholder dashboard), `frontend/src/lib/api.test.ts`, `frontend/vitest.config.ts`
- Modify: `frontend/src/app/layout.tsx`, `frontend/src/app/globals.css`, `frontend/package.json`
- Delete: Tailwind (`@tailwindcss/postcss`, `tailwindcss` devDeps; `frontend/postcss.config.mjs`), `frontend/src/app/page.tsx` (moves into `(app)/`)

**Interfaces (later tasks import these EXACT names):**
- `lib/api.ts`: `ApiClientError(status, code, message, fields?)`; `getJson<T>(path)`, `postJson<T>(path, body)`, `patchJson<T>(path, body)`, `deleteJson<T>(path)`.
- `lib/fmt.ts`: `inr(n?)` (₹ en-IN, em-dash when undefined), `qtyFmt(n, unit)`, `dateFmt(d)`, `monthValue(d)` (YYYY-MM).
- `lib/auth.ts`: `useMe()` (query, parses `userOut`), `useLogin()`, `useLogout()`.
- `lib/theme.ts`: `theme`, `monoFamily` (string), `KHATA` palette const.
- `components/AppShell.tsx`: `<AppShell>{children}</AppShell>` — nav + guard.

- [ ] **Step 1: Remove Tailwind, add vitest**

```powershell
npm uninstall --workspace frontend tailwindcss "@tailwindcss/postcss"
Remove-Item "frontend\postcss.config.mjs" -Force
npm install --save-dev --workspace frontend vitest
```

Replace `frontend/src/app/globals.css` content with exactly:

```css
html, body { height: 100%; }
```

- [ ] **Step 2: Create `frontend/src/lib/theme.ts`**

```ts
'use client';

import { createTheme } from '@mui/material/styles';
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700'] });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'] });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'] });

export const monoFamily = mono.style.fontFamily;

export const KHATA = {
  red: '#7B1F24',
  redDark: '#5E1519',
  brass: '#A87900',
  paper: '#FBFAF8',
  ink: '#1F1B18',
  inkMuted: '#6B6259',
  line: '#E7E1D8',
} as const;

const displayHeading = { fontFamily: display.style.fontFamily, fontWeight: 700 };

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: KHATA.red, dark: KHATA.redDark },
    secondary: { main: KHATA.brass },
    background: { default: KHATA.paper, paper: '#FFFFFF' },
    text: { primary: KHATA.ink, secondary: KHATA.inkMuted },
    divider: KHATA.line,
    error: { main: '#B3261E' },
    success: { main: '#2E6B34' },
  },
  typography: {
    fontFamily: body.style.fontFamily,
    h1: displayHeading,
    h2: displayHeading,
    h3: displayHeading,
    h4: { ...displayHeading, fontWeight: 600 },
    h5: { ...displayHeading, fontWeight: 600 },
    h6: { ...displayHeading, fontWeight: 600 },
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: { backgroundColor: '#FFFFFF', borderBottom: `1px solid ${KHATA.line}` },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
```

- [ ] **Step 3: Create `frontend/src/lib/api.ts`**

```ts
import { apiError } from '@gym/shared';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiError.safeParse(raw);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiClientError(res.status, e.code, e.message, e.fields);
    }
    throw new ApiClientError(res.status, 'UNKNOWN', `Request failed (${res.status})`);
  }
  return raw as T;
}

export const getJson = <T>(path: string): Promise<T> => api<T>(path);
export const postJson = <T>(path: string, body: unknown): Promise<T> =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patchJson = <T>(path: string, body: unknown): Promise<T> =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteJson = <T>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });
```

(The `raw as T` here is the ONE permitted cast — it is immediately followed by zod `.parse()` in every hook, which is what actually types the data.)

- [ ] **Step 4: Create `frontend/src/lib/fmt.ts`**

```ts
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const dateFmtIntl = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const inr = (n: number | undefined): string => (n === undefined ? '—' : inrFmt.format(n));
export const qtyFmt = (n: number, unit: string): string => `${n.toLocaleString('en-IN')} ${unit}`;
export const dateFmt = (d: Date): string => dateFmtIntl.format(d);
export const monthValue = (d: Date): string => d.toISOString().slice(0, 7);
```

- [ ] **Step 5: Create `frontend/src/lib/auth.ts`**

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loginRequest, userOut, type LoginRequest, type UserOut } from '@gym/shared';
import { getJson, postJson } from './api';

export function useMe() {
  return useQuery<UserOut>({
    queryKey: ['me'],
    queryFn: async () => userOut.parse((await getJson<{ data: unknown }>('/auth/me')).data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creds: LoginRequest) =>
      userOut.parse((await postJson<{ data: unknown }>('/auth/login', loginRequest.parse(creds))).data),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJson<{ data: unknown }>('/auth/logout', {}),
    onSuccess: () => qc.clear(),
  });
}
```

- [ ] **Step 6: Create `frontend/src/app/providers.tsx`**

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { theme } from '@/lib/theme';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
```

If `@mui/material-nextjs/v15-appRouter` fails to resolve, list `node_modules/@mui/material-nextjs/` and use the newest `vNN-appRouter` subpath present — do not skip the cache provider.

- [ ] **Step 7: Replace `frontend/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gym Inventory',
  description: 'Inventory, production and sales management',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create `frontend/src/components/AppShell.tsx`** — 'use client'. Responsive shell:
  - `useMe()`: while loading → centered `CircularProgress`; on error (401) → `router.replace('/login')` in an effect, render nothing.
  - Nav items (role-filtered): Dashboard `/`, Sales `/sales`, Production `/production`, Purchases `/purchases`, Materials `/materials`, Products `/products`, Customers `/customers`, Expenses `/expenses` (admin), Reports `/reports`, Users `/users` (admin). Icons from `@mui/icons-material` (pick sensible ones). Active item highlighted (compare `usePathname()`).
  - Desktop (`md+`): permanent `Drawer` width 232 with the app name set in the display font ("Gym Khata" as the brand line, subtitle "inventory & sales"); AppBar spans content with current page title.
  - Mobile: AppBar with menu `IconButton` toggling a temporary Drawer.
  - AppBar right side: user name + role `Chip` (admin = brass outline, staff = default) + logout `IconButton` (calls `useLogout`, then `router.replace('/login')`).
  - Content wrapped in `Box` with `p: { xs: 2, md: 3 }`, `maxWidth: 1200`, centered.

- [ ] **Step 9: Create `frontend/src/app/login/page.tsx`** — 'use client'. Centered `Paper` card (max 380px) on the paper background: brand name in display font, email + password `TextField`s, "Log in" button. Uses `useLogin`; on success `router.replace('/')`; on `ApiClientError` show the API's message in an `Alert` (severity error). Disable button while pending. If `useMe()` already succeeds, redirect to `/` (already logged in).

- [ ] **Step 10: Route group** — create `frontend/src/app/(app)/layout.tsx`:

```tsx
import { AppShell } from '@/components/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

Move the dashboard placeholder to `frontend/src/app/(app)/page.tsx` ('use client'; `Typography variant="h4"` "Dashboard" + a note that content lands in Task 9) and DELETE the old `frontend/src/app/page.tsx`.

- [ ] **Step 11: vitest for the lib layer** — `frontend/vitest.config.ts` (node env, include `src/lib/**/*.test.ts`), package.json script `"test": "vitest run"`. Create `frontend/src/lib/api.test.ts` with a mocked `global.fetch` covering: ok envelope returns body; API error envelope throws `ApiClientError` with code/message/fields; non-JSON error response throws code UNKNOWN with status in message; request with body sends Content-Type application/json and `credentials: 'include'`.

- [ ] **Step 12: Verify** — `npm test --workspace frontend` green; `npm run build --workspace frontend` succeeds (google-font download needs network — PowerShell).

- [ ] **Step 13: Commit** — `feat(web): foundation - theme, api client, auth, app shell, login` (+ footer).

---

### Task 2: Shared UI kit

**Files:** Create `frontend/src/components/{DataTable.tsx, FormDialog.tsx, ConfirmDialog.tsx, MoneyText.tsx, PageHeader.tsx, EmptyState.tsx, SnackbarProvider.tsx}`, `frontend/src/lib/useListQuery.ts`. Modify `frontend/src/app/providers.tsx` (mount SnackbarProvider).

**Contracts (later tasks import these exact names/props):**
- `useListQuery<T>(resource: string, itemSchema: ZodType<T>, params: Record<string, string | number | undefined>)` → wraps TanStack Query; builds the query string (skip undefined), fetches `{ data, page, limit, total }`, parses each row with `itemSchema`, returns `{ rows, total, isLoading, error, refetch }`. Query key `[resource, params]`.
- `DataTable<T>` — thin `@mui/x-data-grid` wrapper: props `rows`, `columns`, `rowCount`, `paginationModel` + `onPaginationModelChange` (server mode), `loading`, `onRowClick?`, `getRowId` defaulting to `_id`. Density compact; `sx` for horizontal scroll on mobile (`minWidth` per column set by callers).
- `FormDialog` — props `open`, `title`, `onClose`, `onSubmit` (async; catches `ApiClientError`: shows `error.message` in an Alert and maps `error.fields` to per-field helper text via a render-prop `fieldError(name)`), `submitLabel`, `pending`, `children` (form fields). Submit on Enter.
- `ConfirmDialog` — `open`, `title`, `body`, `confirmLabel` (danger = khata red), `onConfirm` async, `onClose`.
- `MoneyText` — props `value?: number`, `variant?: 'plain' | 'total'`, `udhaar?: boolean`. Renders `inr(value)` in `monoFamily`; `total` adds the SIGNATURE khata rule: `borderBottom: '3px double', borderColor: 'text.primary', pb: 0.25`; `udhaar` renders in `KHATA.red` weight 500. Undefined value → muted em-dash (staff-stripped fields).
- `PageHeader` — `title` (display font), optional `action` button slot; consistent mb.
- `EmptyState` — `message`, optional `actionLabel` + `onAction`.
- `SnackbarProvider` — context with `notify(message, severity?)`; renders MUI Snackbar+Alert bottom-center; export `useNotify()`.

**Acceptance:** build green; a temporary demo usage compiles (may live in the placeholder dashboard, removed in Task 9); all components typed with no `any`.

**Commit:** `feat(web): shared UI kit (table, dialogs, money text, snackbar)` (+ footer).

---

### Task 3: Materials + Suppliers pages

**Files:** Create `frontend/src/app/(app)/materials/page.tsx`, `frontend/src/app/(app)/suppliers/page.tsx`, `frontend/src/components/StockHistoryDialog.tsx`, plus colocated form components as needed.

**Contracts:**
- Materials list (`useListQuery('/materials', materialOut, { page, limit, search })`): columns name, stock (`qtyFmt(currentQty, useUnit)` in mono; a warning `Chip` "low" when `reorderLevel > 0 && currentQty <= reorderLevel`), avg cost (`<MoneyText value={row.avgCost} />` — renders em-dash for staff automatically), reorder level, actions.
- Admin-only actions (hide for staff via `useMe().data?.role`): "Add material" (PageHeader action) and row edit/delete. Create/edit via `FormDialog` with fields name, buyUnit, useUnit, conversionFactor, reorderLevel — client-validate with `materialCreate`/`materialUpdate` before POST/PATCH; server field errors surface via `fieldError`. Delete via `ConfirmDialog` ("Delete removes it from lists; its history stays on the ledger").
- **Stock history (the ledger feature, both roles):** row action "History" opens `StockHistoryDialog` — props `{ itemKind, itemId, name, unit }`; lists `/movements?itemKind=&itemId=` (parse `movementOut`) newest-first with date (`dateFmt`), type `Chip`, signed qty in mono (negative in khata red, positive in ink), note. Paginated "Load more" or server-paginated table — implementer's choice, state it in the report.
- Suppliers page: name/phone/address/notes CRUD via the same patterns (`supplierOut`, `supplierCreate`), search field, admin-only writes.
- Mutations invalidate the list query and `notify('Material added')`-style confirmations (sentence case, past tense).

**Acceptance:** build green; both pages compile with zero `any`; staff variant renders without cost column values (em-dash) and without write actions; history dialog wired for both materials (RAW) and — reusable — products (FINISHED, used in Task 4).

**Commit:** `feat(web): materials and suppliers pages with stock history` (+ footer).

---

### Task 4: Products page (recipes/BoM editor)

**Files:** Create `frontend/src/app/(app)/products/page.tsx`, `frontend/src/components/BomEditor.tsx`.

**Contracts:**
- List columns: name (+variant caption), selling price (`MoneyText`), stock (mono, low chip vs reorderLevel), avg unit cost (`MoneyText` — staff sees em-dash), actions (admin: edit/delete; both: History via `StockHistoryDialog` with itemKind FINISHED, unit 'unit').
- Create/edit `FormDialog` (admin): name, variant, sku, sellingPrice, packagingCostPerUnit, reorderLevel + `BomEditor`.
- `BomEditor` props `{ value: { materialId: string; qtyPerUnit: number }[], onChange }`: rows of material `Autocomplete` (options from `/materials?limit=100`, labeled `name (useUnit)`) + qty `TextField` (number, per-unit hint "per 1 unit made") + remove `IconButton`; "Add ingredient" button. Duplicate material selections disabled in the options.
- Validate with `productCreate`/`productUpdate` client-side before submit; a product used in production with an empty BoM is legal to save but show a persistent info `Alert` in the dialog: "Without a recipe this product cannot be produced."

**Acceptance:** build green; BoM round-trips (edit shows existing rows); staff sees no cost fields/actions.

**Commit:** `feat(web): products page with recipe editor` (+ footer).

---

### Task 5: Customers + udhaar ledger

**Files:** Create `frontend/src/app/(app)/customers/page.tsx`, `frontend/src/components/{CustomerLedgerDrawer.tsx, TakePaymentDialog.tsx}`.

**Contracts:**
- List: name, phone, owed (`<MoneyText value={udhaarBalance} udhaar={udhaarBalance > 0} variant="total">` — the khata rule on real debt; plain ₹0.00 otherwise), actions: "Khata" (both roles), edit/delete (admin).
- `CustomerLedgerDrawer` (right-side `Drawer`, full-height, mobile full-width): header = customer name + owed as `MoneyText variant="total" udhaar`; body = two stacked sections: recent sales (`/sales?customerId=` — invoiceNo mono, date, total, udhaarAmount) and payments (`/payments?customerId=` — date, amount, mode); footer = "Take payment" button (both roles — staff collects at the counter).
- `TakePaymentDialog`: amount (helper: "Owed ₹X"), mode `ToggleButtonGroup` CASH/UPI/CARD, notes. Client-validate `paymentCreate`; the API's OVERPAY 400 message surfaces in the dialog Alert. Success: `notify('Payment recorded')`, invalidate customers + payments + the drawer queries.
- Customer create/edit dialog: name, phone (admin only).

**Acceptance:** build green; staff can open the khata and take payments but cannot edit customers; owed amounts wear the double-rule signature.

**Commit:** `feat(web): customers page with udhaar khata and payments` (+ footer).

---

### Task 6: Purchases page

**Files:** Create `frontend/src/app/(app)/purchases/page.tsx`, `frontend/src/components/PurchaseForm.tsx`.

**Contracts:**
- List (`purchaseOut`, `purchaseQuery` filters: supplier `Autocomplete`, from/to `DatePicker`s — use MUI X `@mui/x-date-pickers` ONLY if already installed; otherwise native `type="date"` TextFields to avoid a new dependency — state the choice): date, supplier name (resolve via a suppliers map query), invoiceNo, total (`MoneyText` — staff em-dash), lines count. Row click → detail `Dialog` listing lines (staff sees qty only; cost cells em-dash via absent fields).
- "Record purchase" (both roles): `PurchaseForm` in a full-screen-on-mobile `Dialog` — supplier `Autocomplete`, date, paymentMode toggle, invoiceNo optional, line rows (material Autocomplete + qty in buyUnit with unit suffix + cost per buyUnit) with add/remove, running total in `MoneyText variant="total"` (computed client-side; staff DOES see costs on the create form — they typed them; only stored reads are stripped).
- Validate `purchaseCreate` client-side; success invalidates purchases + materials (stock and costs changed) and notifies "Purchase recorded".

**Acceptance:** build green; multi-line create works against types; staff list/detail render without cost values.

**Commit:** `feat(web): purchases page` (+ footer).

---

### Task 7: Production page

**Files:** Create `frontend/src/app/(app)/production/page.tsx`, `frontend/src/components/ProductionForm.tsx`.

**Contracts:**
- List (`productionOut`, `productionQuery`): batchNo (mono), date, product name, qty, expiry (`dateFmt`, warning chip when within 30 days), unit cost from `costSnapshot?.unitCost` (`MoneyText` — staff em-dash). Row click → detail dialog: consumed lines (planned vs actual vs wastage in mono columns; costPerUseUnit only when present) + snapshot totals (admin).
- "New batch" (both roles): pick product (Autocomplete of products WITH `bom.length > 0`; empty-BoM products excluded with a hint), qtyProduced stepper, date, expiryDate optional; on product/qty change PREFILL the consumption grid from `product.bom` (`plannedQty = qtyPerUnit * qty`, actual defaults to planned, wastage 0 — all editable, qty inputs suffixed with the material's useUnit); allow adding extra materials not in the BoM.
- Submit `productionCreate`; API errors surface (INSUFFICIENT_STOCK 409 message shows verbatim — it names the material and available qty); success invalidates production + materials + products, notifies "Batch recorded".

**Acceptance:** build green; prefill math matches BoM x qty; staff variant clean of costs.

**Commit:** `feat(web): production page with BoM prefill` (+ footer).

---

### Task 8: Sales — the fast screen (+ returns)

**Files:** Create `frontend/src/app/(app)/sales/page.tsx`, `frontend/src/components/{SaleEntry.tsx, SaleDetailDialog.tsx, ReturnDialog.tsx}`.

**Contracts:**
- Page layout: "New sale" entry card FIRST (this is the fastest screen in the app — minimal taps), recent sales table below (`saleOut`, `saleQuery`): invoiceNo mono, date, total `MoneyText`, paid, udhaar (`udhaar` red when > 0), customer.
- `SaleEntry`: product `Autocomplete` (searches `/products?search=`) — selecting ADDS a line with qty 1; each cart line: name, qty stepper (+/- `IconButton`s, min 1), unitPrice `TextField` prefilled from `sellingPrice` (editable), line total mono, remove. Below: discount field, running TOTAL as `MoneyText variant="total"` (the khata rule earns its keep here), paymentMode `ToggleButtonGroup`, amountPaid field with a "Full" shortcut button, and a live udhaar readout (`total - paid`, red when > 0) that REQUIRES a customer `Autocomplete` when positive (submit disabled with helper text until chosen).
- Submit validates `saleCreate` client-side (its refines match the server); success: `notify('Sale S-XXXXXXXX-N recorded')` with the returned invoiceNo, cart resets, sales + products (+ customers when udhaar) invalidated. INSUFFICIENT_STOCK 409 surfaces on the offending flow.
- `SaleDetailDialog` (row click): lines (staff: no unitCostAtSale — absent), totals block with `MoneyText variant="total"`, returns history (date, items, refundNote, udhaarReduced when present). Admin-only "Return items" button → `ReturnDialog`: per-product qty steppers capped at sold-minus-already-returned, refundNote; submits `saleReturnCreate` to `/sales/:id/return`; surfaces OVER_RETURN/DUPLICATE_LINES messages; success invalidates sales + products + customers.
- Mobile: entry card stacks; steppers stay thumb-sized (min 40px targets).

**Acceptance:** build green; cart math mirrors server rounding (`round2`-equivalent via the shared refines); udhaar-requires-customer enforced client-side; staff never sees cost fields; returns admin-only.

**Commit:** `feat(web): fast sales entry and returns` (+ footer).

---

### Task 9: Dashboard + Reports + Expenses

**Files:** Replace `frontend/src/app/(app)/page.tsx` (real dashboard); create `frontend/src/app/(app)/reports/page.tsx`, `frontend/src/app/(app)/expenses/page.tsx`.

**Expenses page contract (admin-only page; staff navigating directly get the API 403 rendered as an inline error state):** list (`expenseOut`, `expenseQuery`: category `Select` filter + from/to dates) with date, category `Chip`, amount `MoneyText`, notes; visible-range total as `MoneyText variant="total"`; "Add expense" dialog (category Select from `EXPENSE_CATEGORIES`, amount, date, notes; `expenseCreate` validation), row edit (`expenseUpdate`) and hard-delete via ConfirmDialog ("This permanently deletes the expense and changes past profit reports").

**Contracts:**
- Dashboard (`dashboardOut` from `/reports/dashboard`): KPI row — "Today's sales" count always; admin additionally sees today's take (`MoneyText variant="total"`), stock value, udhaar outstanding (red) — RENDER CARDS ONLY WHEN THE FIELD IS PRESENT (staff gets a 1-card row + alerts, no blank placeholders). Below: two alert lists — "Low stock" (name, current vs reorder in mono, links to the item's page) and "Expiring soon" (batchNo mono, product, expiry date, days-left chip). Empty states: "Nothing low on stock" / "Nothing expiring in the next 30 days".
- Reports page: staff variant shows ONLY the sales-summary section (count + by-mode counts, no revenue). Admin sections, stacked: **Profit** — month `<input type="month">` (default current) → `/reports/profit?month=` rendered as a mini P&L table in mono (revenue, cost of goods sold, gross profit, overhead, overhead/unit, net profit as `MoneyText variant="total"`, red when negative, with units produced/sold as captions) — this is the owner's number, give it the most visual weight; **Stock value** (raw/finished/total, total double-ruled); **Udhaar outstanding** — `/reports/udhaar` table (name, phone, balance red mono) with total; **Sales summary** — from/to date inputs → count, revenue, by-mode breakdown.
- Route guards are cosmetic (API enforces): hide admin sections for staff via `useMe`.

**Acceptance:** build green; staff dashboard/report variants contain no absent-field placeholders; profit table renders negative months in red without layout breakage; expenses CRUD complete with category filter.

**Commit:** `feat(web): dashboard, reports and expenses` (+ footer).

---

### Task 10: Users page + polish + live verification

**Files:** Create `frontend/src/app/(app)/users/page.tsx`; polish touches across pages as found; modify `README.md`, spec §11.

**Contracts:**
- Users page (admin; staff who navigate directly get the API's 403 — show it as an inline error state, not a crash): list (name, email, role chip, active), create (userCreate: name/email/password/role), edit (role/isActive/password-reset optional field), deactivate via ConfirmDialog; self-deactivation button disabled with tooltip "You cannot deactivate your own account".
- Polish sweep (bounded to these, don't gold-plate): every list page has a loading skeleton and an `EmptyState`; every mutation error reaches a Snackbar or dialog Alert (no silent failures); `document.title` per page ("Sales — Gym Khata"); AppShell nav filtered correctly for staff (no Expenses/Users items); 360px-width sanity pass over Sales, Dashboard, Materials (adjust column minWidths/stacking as needed).
- **Live verification (PowerShell, the real proof):** `npm run dev:api` in background; `npm run build --workspace frontend` then `npm run start --workspace frontend` (or `dev:web`) in background; then with `Invoke-WebRequest -SessionVariable`: login as admin@gym.local via the API and confirm `GET http://localhost:3000/login` returns 200 HTML and `GET http://localhost:3000/` returns 200; run BOTH suites (`npm test` at root) and root typecheck. Stop both servers, confirm ports 3000/5000 free. (Browser click-through is Phase 2's job; this proves the stack boots and builds together.)
- Docs: README gets a "## Frontend" section (pages list, `npm run dev:web`, design-token note); spec §11 gets the recorded amendment bullet: Phase 1b was built directly against the live API (msw dropped — backend landed first).

**Acceptance:** everything above + full monorepo test/typecheck/build green.

**Commit:** `feat(web): users page, polish pass, live verification` (+ footer). Then the whole-branch final review runs (controller dispatches it — not part of this task).

---

## Execution notes for the controller

- Implementers: sonnet for all tasks (UI composition is judgment work); reviewers: sonnet, with the final whole-branch review on the most capable model.
- Task 1's brief is verbatim; Tasks 2-10 briefs carry contracts + acceptance criteria — reviewers gate on acceptance lists and the Design tokens section (visual identity is a binding constraint: mono money, khata rule on totals, sentence-case copy, conditional rendering on absent fields).
- The API must NOT be assumed running during Tasks 1-9 verification (build + unit tests only). Task 10 boots the full stack.
- Phase 2 (after this branch): browser click-through of every flow against seeded data, fixing integration drift, then project completion review.

---

## Post-review amendments (2026-07-12, final whole-branch review)

Fixed before merge: AppShell now redirects to /login only on 401 (other errors show an inline retry state); SaleEntry's product search no longer client-filters server results (SKU search works); ConfirmDialog/logout no longer produce unhandled rejections.

### Phase 2 tickets (explicitly deferred)
- limit-100 lookup seam: convert the sales-page customer filter and ProductionForm product picker to debounced server search; consider a "showing first N" warning in fixed-limit lookups (BomEditor, PurchaseForm, detail-dialog name maps).
- Server-side self-demotion guard (PATCH self role change to staff -> 400), mirroring SELF_DEACTIVATE.
- enumLabel acronym sweep (UPI etc.) + use it in the payment-mode ToggleButtonGroups.
- Filtered-empty EmptyState copy ("No matches for these filters" vs first-use copy).
- Staff-visible all-em-dash cost column headers: hide columns when no row carries the field.
- Take-payment button disabled until customer detail loads; index-keyed row-error staleness after add/remove; reports invalidation on transactional mutations if reports ever embed on those pages.

### Spec deviation (recorded): spec Sec 9 says admin-only pages "redirect staff away"; the implementation renders an inline 403 state instead (equal protection - the API 403s everything; better UX). Accepted.

Addendum (final re-review): two more Phase 2 ticket lines - failed-logout bounce gives no feedback (notify 'Logout failed - try again'; qc.clear only runs on success); sub-paisa rounding divergence between client one-shot round2 and server per-line rounding (only visible failure mode already surfaced via the customerId FormHelperText fallback).
