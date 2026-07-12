import { test, expect } from '@playwright/test';
import { login, ADMIN, STAFF } from './helpers';

test.describe('auth', () => {
  test('admin sees the admin KPI + Users nav item, and can log out', async ({ page }) => {
    await login(page, ADMIN);

    await expect(page.getByText("Today's take")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  test('staff does not see the admin KPI or the Users nav item', async ({ page }) => {
    await login(page, STAFF);

    // Anchor on a staff-visible element first so the negative assertions below
    // can't pass vacuously against a not-yet-rendered dashboard.
    await expect(page.getByText("Today's sales")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sales' })).toBeVisible();

    await expect(page.getByText("Today's take")).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Users' })).toHaveCount(0);
  });
});
