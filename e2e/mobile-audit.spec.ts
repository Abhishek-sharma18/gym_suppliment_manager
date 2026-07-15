import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { login, ADMIN } from './helpers';

// Screenshot-driven mobile responsiveness audit. NOT part of the regular `npm run e2e` suite
// (which stays at 4 specs) - it walks every page at two narrow viewports, asserts there is no
// page-level horizontal overflow, opens each page's primary dialog/drawer, and saves a
// full-page screenshot for a human (or Claude, via the Read tool) to actually look at.
//
// Run it:  MOBILE_AUDIT=1 npx playwright test mobile-audit
test.skip(!process.env.MOBILE_AUDIT, 'Mobile audit - set MOBILE_AUDIT=1 to run (screenshots, not part of npm run e2e)');

const SCREENSHOT_ROOT = path.join('.superpowers', 'sdd', 'mobile-audit');

// A short settle after opening a dialog/drawer so its enter transition has finished before the
// screenshot is taken - this file is a visual audit tool, not a functional assertion, so a fixed
// wait here (rather than waiting on some specific animation-end signal) is an acceptable tradeoff.
const TRANSITION_SETTLE_MS = 300;

// The landing hero's GSAP entrance sequence is timed to settle in well under 2.5s (see
// LandingPage.tsx) - wait it out fully before screenshotting so the shot shows the finished
// ledger, not a mid-draw frame.
const HERO_SETTLE_MS = 2800;

/**
 * No page-level horizontal scroll: `document.documentElement.scrollWidth` must not exceed its
 * `clientWidth` (a 1px tolerance absorbs subpixel rounding). Any table/grid/dialog overflow must
 * scroll INSIDE its own container - it must never widen the page itself.
 */
async function assertNoPageOverflow(page: Page, where: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 1 && process.env.MOBILE_AUDIT_DEBUG) {
    const offenders = await page.evaluate((limit) => {
      const results: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > limit + 1 || rect.width > limit + 1) {
          const cls = typeof el.className === 'string' ? el.className : String(el.className);
          const cs = getComputedStyle(el);
          results.push(
            `${el.tagName}.${cls.slice(0, 70)} rect=[l=${rect.left.toFixed(1)},r=${rect.right.toFixed(1)},w=${rect.width.toFixed(1)}] ` +
            `flexWrap=${cs.flexWrap} whiteSpace=${cs.whiteSpace} minWidth=${cs.minWidth} flexShrink=${cs.flexShrink} text="${(el.textContent ?? '').slice(0, 30)}"`,
          );
        }
      });
      return results.slice(0, 40);
    }, clientWidth);
    console.log(`[mobile-audit] offenders (rect.right or width > ${clientWidth}) at ${where}:\n${offenders.join('\n')}`);
  }
  expect(
    scrollWidth,
    `${where}: page-level horizontal overflow (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

function shoot(page: Page, viewportName: string, name: string): Promise<Buffer> {
  return page.screenshot({ path: path.join(SCREENSHOT_ROOT, viewportName, `${name}.png`), fullPage: true });
}

/** Visits every page, opens each one's primary dialog/drawer where applicable, asserting no
 * page-level overflow at every step and saving a full-page screenshot. */
async function runFullAudit(page: Page, viewportName: string): Promise<void> {
  // Landing - the one page outside the authenticated app shell, so it's visited first, before
  // logging in. The hero's entrance sequence is time-boxed (see HERO_SETTLE_MS); the features
  // band animates in on scroll via ScrollTrigger, so scroll to the bottom once to trigger it -
  // once played it stays revealed regardless of scroll position, so the full-page screenshot
  // (which captures the whole page regardless of current scroll) reflects the settled end-state.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gym Khata', level: 1 })).toBeVisible();
  await page.waitForTimeout(HERO_SETTLE_MS);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'landing');
  await shoot(page, viewportName, 'landing');

  await login(page, ADMIN);
  await expect(page.getByText("Today's take")).toBeVisible();
  await assertNoPageOverflow(page, 'dashboard');
  await shoot(page, viewportName, 'dashboard');

  // Mobile nav drawer - opens via the AppBar hamburger below the md breakpoint.
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: 'Sales' })).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'dashboard (nav drawer open)');
  await shoot(page, viewportName, 'dashboard-nav-drawer');
  await page.keyboard.press('Escape');

  // Sales - SaleEntry is inline (no dialog); nothing to open.
  await page.goto('/sales');
  await expect(page.getByRole('button', { name: 'Record sale' })).toBeVisible();
  await assertNoPageOverflow(page, 'sales');
  await shoot(page, viewportName, 'sales');

  // Production - open "New batch".
  await page.goto('/production');
  await expect(page.getByRole('heading', { name: 'Production', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'production');
  await shoot(page, viewportName, 'production');
  await page.getByRole('button', { name: 'New batch' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'production (New batch dialog)');
  await shoot(page, viewportName, 'production-new-batch');
  await page.keyboard.press('Escape');

  // Purchases - open "Record purchase".
  await page.goto('/purchases');
  await expect(page.getByRole('heading', { name: 'Purchases', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'purchases');
  await shoot(page, viewportName, 'purchases');
  await page.getByRole('button', { name: 'Record purchase' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'purchases (Record purchase dialog)');
  await shoot(page, viewportName, 'purchases-record-purchase');
  await page.keyboard.press('Escape');

  // Materials - open "Add material".
  await page.goto('/materials');
  await expect(page.getByRole('heading', { name: 'Materials', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'materials');
  await shoot(page, viewportName, 'materials');
  await page.getByRole('button', { name: 'Add material' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'materials (Add material dialog)');
  await shoot(page, viewportName, 'materials-add-material');
  await page.keyboard.press('Escape');

  // Suppliers - open "Add supplier".
  await page.goto('/suppliers');
  await expect(page.getByRole('heading', { name: 'Suppliers', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'suppliers');
  await shoot(page, viewportName, 'suppliers');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'suppliers (Add supplier dialog)');
  await shoot(page, viewportName, 'suppliers-add-supplier');
  await page.keyboard.press('Escape');

  // Products - open "Add product" (the tallest form: name/variant/sku, pricing, plus the
  // dynamic BoM editor - the strongest fullScreenOnMobile candidate of the bunch).
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Products', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'products');
  await shoot(page, viewportName, 'products');
  await page.getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'products (Add product dialog)');
  await shoot(page, viewportName, 'products-add-product');
  await page.keyboard.press('Escape');

  // Products - "Edit product" on the seeded Chocolate bar, which already has 3 BoM lines -
  // the real tall-content case (an empty "Add product" BoM section is short and unrevealing).
  await page.getByRole('row').filter({ hasText: 'Chocolate' }).getByRole('button', { name: 'Edit product' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'products (Edit product dialog, populated BoM)');
  await shoot(page, viewportName, 'products-edit-product-bom');
  await page.keyboard.press('Escape');

  // Customers - open the seeded customer's Khata drawer.
  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Customers', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'customers');
  await shoot(page, viewportName, 'customers');
  await page.getByRole('row').filter({ hasText: 'Ramesh Kumar' }).getByRole('button', { name: 'Khata' }).click();
  await expect(page.getByRole('button', { name: 'Take payment' })).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'customers (Khata drawer)');
  await shoot(page, viewportName, 'customers-khata');
  await page.keyboard.press('Escape');

  // Expenses - open "Add expense".
  await page.goto('/expenses');
  await expect(page.getByRole('heading', { name: 'Expenses', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'expenses');
  await shoot(page, viewportName, 'expenses');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'expenses (Add expense dialog)');
  await shoot(page, viewportName, 'expenses-add-expense');
  await page.keyboard.press('Escape');

  // Reports - includes the new Trends chart, the main audit target for this page. Several
  // sections (Trends/Profit/Sales summary) fetch independently and render a Skeleton until
  // their query resolves - wait those out so the screenshot shows real content, not grey boxes.
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trends', level: 3 })).toBeVisible();
  await expect(page.locator('.MuiSkeleton-root')).toHaveCount(0);
  await assertNoPageOverflow(page, 'reports');
  await shoot(page, viewportName, 'reports');

  // Users - open "Add user".
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Users', level: 2 })).toBeVisible();
  await assertNoPageOverflow(page, 'users');
  await shoot(page, viewportName, 'users');
  await page.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(TRANSITION_SETTLE_MS);
  await assertNoPageOverflow(page, 'users (Add user dialog)');
  await shoot(page, viewportName, 'users-add-user');
  await page.keyboard.press('Escape');
}

test.describe('mobile responsiveness audit', () => {
  test('390x844 - every page, no horizontal overflow', async ({ page }) => {
    // Generous: this single test cold-compiles every one of Next dev's routes on first visit.
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await runFullAudit(page, '390x844');
  });

  test('360x800 - every page, no horizontal overflow', async ({ page }) => {
    // Routes are already compiled by the previous test, so this one runs much faster.
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 360, height: 800 });
    await runFullAudit(page, '360x800');
  });
});
