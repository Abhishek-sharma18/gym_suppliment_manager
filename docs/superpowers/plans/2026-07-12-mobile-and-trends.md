# Mobile responsiveness + monthly trends

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Contracts-style plan; three sequential tasks.

**Goal:** (1) A monthly growth view on the Reports page — revenue, expenses, net profit over the last 12 months with a month-over-month growth stat (user-confirmed choice). (2) A real mobile-responsiveness pass driven by phone-viewport screenshots — the user reports the deployed app is not mobile friendly despite the earlier static audit.

## Global Constraints

- Branch: `mobile-and-trends`. Working dir: repo root (space — quote). PowerShell for network/build/test. ASCII only. All existing conventions bind (CLAUDE.md, khata design tokens, shared-schema parse discipline, per-task commit + Co-Authored-By footer).
- Chart rules (from the dataviz method — binding): ONE ₹ axis (never dual-axis); categorical hues in FIXED order assigned to entities; palette must be VALIDATED by running the dataviz validator script, not eyeballed; 2px lines; legend present (3 series); tooltip/hover on by default; text in ink tokens never series colors; zero-line visible (net profit goes negative).
- Dataviz validator: `node "C:\Users\abhis\AppData\Local\Temp\claude\bundled-skills\2.1.207\82cb75876a090f2d419da15056e79f6f\dataviz\scripts\validate_palette.js" "<hex,hex,hex>" --mode light` (read the script's own usage first; chart surface is white #FFFFFF). Candidate palette (fixed order): revenue `#7B1F24` (khata red), expenses `#A87900` (brass), net profit `#1F6E70` (teal). If any check FAILs, adjust lightness only (keep the hue identity), re-run until PASS, and record the final hexes + validator output in the report.

---

### Task 1: Backend — GET /api/reports/trends

**Files:** `shared/src/reports.ts` (+ shared test), `backend/src/services/reports.ts`, `backend/src/routes/reports.ts`, `backend/src/tests/reports.test.ts`.

**Contract (additive):**

```ts
export const trendPoint = z.object({
  month: z.string(), // 'YYYY-MM'
  revenue: money,          // returns-aware, same formula as profit(month)
  expenses: money,
  netProfit: z.number(),   // signed - loss months are negative
  unitsSold: z.number().int(),
});
export const trendsQuery = z.object({
  months: z.coerce.number().int().min(3).max(24).default(12),
});
```

**Service:** `trends(monthsBack)` returns the last N calendar months (UTC boundaries, consistent with `profit()`), oldest → newest, ZERO-FILLED for empty months. Implementation: loop the existing `profit(month)` helper per month (correctness/consistency beats query count at this scale) and map to trendPoint (`netProfit` from profit(); `expenses` = its overhead; `unitsSold` from it). Route: `GET /reports/trends`, admin-only, `validateQuery(trendsQuery)`.

**Tests:** extend reports.test.ts — create dated activity in TWO different months (saleCreate/expenseCreate accept explicit dates; reuse the existing scenario builder with month-shifted dates), assert: correct exact numbers for both months, zero-filled months between/around, oldest→newest order, length == requested months, staff 403. Shared test: trendPoint parses a negative-netProfit point.

**Commit:** `feat(api): monthly trends report`

---

### Task 2: Frontend — Trends section on Reports (admin)

**Files:** `frontend/package.json` (@mui/x-charts), `frontend/src/app/(app)/reports/page.tsx` (or an extracted `TrendsSection` component), `frontend/src/lib/useReports.ts`.

**Contract:**
- Install `@mui/x-charts` (MUI family — allowed by the MUI-only rule).
- New "Trends" section at the TOP of the admin reports column: a `LineChart` with three series in the FIXED validated palette order — Revenue, Expenses, Net profit — over the last 12 months. One ₹ y-axis including 0 (zero-line visible); x-axis = short month labels ("Aug", "Sep"...; include year on January or first tick). 2px curves, no dot per point (markers on hover), built-in tooltip + legend. Chart text (ticks, legend) in body font with ink tokens; ₹ tick values compact (e.g. "₹10k" formatter).
- Growth stat tile above/beside the chart: latest month revenue vs previous month — percentage with an up/down arrow icon and the ₹ delta (mono). Handle division-by-zero (previous month 0 → show "new" or an em-dash, not Infinity%). This is a stat tile per the viz method — no mini-chart needed.
- Data hook parses with the shared `trendPoint` array schema (CLAUDE rule 11). Loading skeleton + empty state ("Not enough history yet — trends appear after your first full month").
- Responsive: chart fills container width, height ~280; at 360px the chart remains legible (fewer x ticks via tickInterval if needed) with no page-level horizontal scroll.
- RUN THE PALETTE VALIDATOR per Global Constraints before writing the chart code; use the passing hexes as constants with a comment naming the validator run.

**Verification:** build/lint/tests green; validator PASS output in the report.
**Commit:** `feat(web): monthly trends chart and growth stat`

---

### Task 3: Mobile responsiveness pass (screenshot-driven)

**Files:** `e2e/mobile-audit.spec.ts` (new, permanent, env-gated), fixes across `frontend/src` as found, README one-liner.

**Contract:**
1. **Audit tool:** a Playwright spec gated by `process.env.MOBILE_AUDIT` (skipped otherwise, so `npm run e2e` stays 4 specs): viewport 390x844 (and a 360x800 pass), logs in as the seeded admin, visits EVERY page (dashboard, sales, production, purchases, materials, suppliers, products, customers, expenses, reports, users), on each: (a) asserts NO page-level horizontal overflow (`document.documentElement.scrollWidth <= clientWidth + 1`), (b) opens the page's primary dialog/drawer where applicable (record sale card is inline; open New batch, Record purchase, a customer Khata, Add material) and re-asserts, (c) saves a full-page screenshot to `.superpowers/sdd/mobile-audit/<page>.png` (git-ignored path).
2. **Audit → fix loop:** run it (it uses the same gymdb_e2e infrastructure as the e2e suite), VIEW the screenshots yourself (Read renders images), catalog every defect (suspects: DataGrid forcing page scroll instead of scrolling inside its own container; filter rows not wrapping; dialogs not fullScreen on xs — the FormDialog `fullScreenOnMobile` prop exists, apply it where cramped; KPI/stat layouts; SaleEntry paddings; long mono strings overflowing cards). Fix in the frontend, re-run, re-view, iterate until every page passes the overflow assertion AND looks right to your eye in the screenshots.
3. Include the NEW trends chart/reports page in the audit.
4. README: add a line to the e2e section documenting `MOBILE_AUDIT=1 npx playwright test mobile-audit` usage.

**Verification:** audit spec green at both viewports; before/after screenshots referenced in the report (leave the final set on disk); full `npm run e2e` still 4/4; build/lint/tests green.
**Commit:** `fix(web): mobile responsiveness pass with screenshot audit`
