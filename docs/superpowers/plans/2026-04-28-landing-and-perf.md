# Landing page + performance

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Contracts-style plan; two sequential tasks.

**Goal:** (1) A public, GSAP-animated landing page at `/` with a login call-to-action — distinctive, khata-branded, minimalistic on mobile. (2) Cut the app's real-world load time: keep the free Render instance warm, compress API responses, align hosting regions, slim the Reports bundle.

## Global Constraints

- Branch: `landing-and-perf`. Working dir: repo root (space — quote). PowerShell for network/build/test. ASCII only in code. All existing conventions bind (CLAUDE.md; khata design tokens from the Phase 1b plan; per-task commit + Co-Authored-By footer).
- GSAP (core + ScrollTrigger — both MIT-free) is approved as the animation library; MUI remains the only UI-component library. Respect `prefers-reduced-motion` (via `gsap.matchMedia`) — reduced-motion users get a static page with everything visible.
- The landing page must be FAST: statically prerendered, zero API calls, GSAP loaded client-side only (dynamic import or 'use client' with useEffect registration), no images beyond inline SVG.
- E2E suites must stay green — the route restructure changes redirect targets the specs assert.

---

### Task 1: Public landing page + route restructure

**Files:** `frontend/src/app/page.tsx` (new public landing — outside the `(app)` group), `frontend/src/app/(app)/dashboard/page.tsx` (moved from `(app)/page.tsx`), `frontend/src/components/AppShell.tsx` (nav href), `frontend/src/app/login/page.tsx` (redirect target), `frontend/package.json` (gsap), `e2e/auth.spec.ts` + `e2e/sale.spec.ts` + `e2e/khata.spec.ts` + `e2e/mobile-audit.spec.ts` (updated targets + landing added to audit), README pages list.

**Route restructure contract:**
- `/` — public landing (no auth, no AppShell). `/login` unchanged. Dashboard moves to `/dashboard` (inside `(app)` — shell + guard unchanged). Login success and already-logged-in redirects go to `/dashboard`. AppShell "Dashboard" nav item points to `/dashboard`. Nothing else moves.
- Landing header has a quiet "Log in" text button (top right) AND the hero carries the primary CTA button (khata red, MUI) → `/login`. If the user is already authenticated they'll bounce through login to `/dashboard` automatically (existing login-page behavior) — no auth check on the landing itself (keeps it static).

**Landing design (binding — grounded in the khata identity):**
- Full-bleed warm paper (`KHATA.paper`), ink text, khata red + brass accents only. Bricolage Grotesque display for the wordmark/headline, IBM Plex Sans body, IBM Plex Mono for every number.
- **Hero = the signature moment: a ledger that writes itself.** An inline SVG khata block: 3-4 horizontal ledger rule lines draw in left-to-right (stroke-dashoffset), small mono entry rows fade in one after another (e.g. "PURCHASE_IN +10,000 g", "SALE_OUT -2 jars", "PAYMENT ₹1,500") like pen entries, then a mono ₹ total counts up (GSAP number tween) and the hand-ruled 3px double-rule DRAWS itself beneath the total. Headline alongside/above: "Gym Khata" wordmark + one line: "Your gym's stock, sales and udhaar - one honest ledger." CTA below.
- **Scroll section (one, not many):** a single minimal features band revealed with a gentle ScrollTrigger stagger — four short items in a row (stacked on mobile): "Immutable stock ledger", "Fast counter sales", "Udhaar khata", "Profit you can trust" — each a small ink line-icon (MUI icons fine) + 1 sentence. No parallax, no pinning, no scroll-jacking.
- Footer: tiny, muted: "Built for the shop counter - works on your phone." + Log in link.
- **Mobile (<=sm): minimalistic per the user's ask** — the ledger SVG scales down (or simplifies to fewer rows via matchMedia), animations shorten, everything stacks, generous tap targets; no page-level horizontal overflow at 360px.
- Timing discipline: whole load sequence <= ~2.5s, eased (power2/expo), nothing loops forever except (optionally) a very subtle cursor-blink on the ledger's last entry. Reduced motion: all end-states rendered immediately.

**Acceptance:** build/lint/unit tests green; `npm run e2e` 4/4 (specs updated for /dashboard); `MOBILE_AUDIT=1` audit green with the landing page added at both viewports; landing route is statically prerendered (build output shows `/` as static); gsap only in the landing chunk (dashboard/app bundles unchanged — verify via build output first-load JS for a couple of app routes vs before).

**Commit:** `feat(web): public animated landing page, dashboard route move`

---

### Task 2: Performance pass

**Files:** `backend/src/app.ts` (+compression), `backend/package.json`, `backend/src/tests/health.test.ts` or new test, `.github/workflows/keepalive.yml`, `render.yaml` (region), `frontend/src/app/(app)/reports/page.tsx` (dynamic chart import), README ("## Performance" notes).

**Contract:**
1. **Response compression:** `npm install --workspace backend compression` (+ `@types/compression` dev). `app.use(compression())` early in createApp. Test: a list response with `Accept-Encoding: gzip` comes back with `content-encoding: gzip` (supertest sets this header manually).
2. **Keep-alive (kills the free-tier cold start):** `.github/workflows/keepalive.yml` — `schedule: cron '*/10 * * * *'` + `workflow_dispatch`; single step curls `https://gym-khata-api.onrender.com/api/health` with a 60s max-time and `|| true` (a failed ping must not mark the repo red). Comment in the yml: what it does, that GitHub cron can lag a few minutes, and that it becomes unnecessary on Render's paid plan.
3. **Region alignment:** add `region: singapore` to render.yaml with a comment block: Render cannot move an existing service between regions — after merging, delete the service and re-create via the same Blueprint to apply; singapore is right for a Mumbai/ap-south-1 Atlas cluster (the common case here); if your Atlas is US/EU pick the matching Render region instead. README explains how to check the Atlas region.
4. **Slimmer Reports route:** load the trends chart section with `next/dynamic` (`ssr: false`, skeleton fallback) so `@mui/x-charts` leaves the shared/first-load bundle; verify via build output that the reports route's first-load JS drops and other routes are unchanged.
5. **README "## Performance"** section: the cold-start explanation (free tier vs $7 Starter), what the keepalive workflow does, the region-matching instructions, compression note.

**Acceptance:** backend suite green (incl. new compression test); build/lint/tests green; `npm run e2e` still 4/4; build-output evidence for the bundle change in the report.

**Commit:** `perf: compression, keep-alive ping, region alignment, lazy chart bundle`
