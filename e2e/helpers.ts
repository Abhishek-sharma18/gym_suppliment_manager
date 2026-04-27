import type { Page } from '@playwright/test';

export const ADMIN = { email: 'admin@gym.local', password: 'Admin@123!' };
export const STAFF = { email: 'staff@gym.local', password: 'Staff@123!' };

/** Logs in via the real login form and waits for the redirect to the dashboard. */
export async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/dashboard');
}
