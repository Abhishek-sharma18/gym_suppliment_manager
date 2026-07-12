import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

test('admin records a cash sale of a seeded product', async ({ page }) => {
  await login(page, ADMIN);

  await page.getByRole('button', { name: 'Sales' }).click();
  await page.waitForURL(/\/sales/);

  await page.getByLabel('Add a product').fill('Chocolate');
  await page.getByRole('option', { name: /Chocolate/ }).click();

  await page.getByRole('button', { name: 'Full' }).click();
  await page.getByRole('button', { name: 'Record sale' }).click();

  // Scoped by text: Next.js's own hidden route announcer also has role="alert" and would
  // otherwise make this locator ambiguous (it currently reads the page title, e.g. "Sales").
  const alert = page.getByRole('alert').filter({ hasText: 'recorded' });
  await expect(alert).toBeVisible();
  const alertText = await alert.innerText();
  const match = alertText.match(/S-\d{8}-\d+/);
  expect(match, `snackbar text was: "${alertText}"`).not.toBeNull();
  const invoiceNo = match![0];

  const grid = page.getByRole('grid');
  await expect(grid.getByRole('row').nth(1)).toContainText(invoiceNo);
});
