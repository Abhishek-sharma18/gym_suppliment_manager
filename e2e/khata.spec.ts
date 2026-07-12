import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

test('admin takes a payment on the seeded customer khata', async ({ page }) => {
  await login(page, ADMIN);

  await page.getByRole('button', { name: 'Customers' }).click();
  await page.waitForURL(/\/customers/);

  const customerRow = page.getByRole('row').filter({ hasText: 'Ramesh Kumar' });
  await customerRow.getByRole('button', { name: 'Khata' }).click();

  await page.getByRole('button', { name: 'Take payment' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount').fill('1');
  await dialog.getByRole('button', { name: 'Record payment' }).click();

  // Scoped by text: Next.js's own hidden route announcer also has role="alert", which would
  // otherwise make this locator ambiguous alongside the MUI snackbar.
  await expect(page.getByRole('alert').filter({ hasText: 'Payment recorded' })).toBeVisible();
});
