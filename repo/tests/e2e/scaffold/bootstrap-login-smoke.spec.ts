import { expect, test } from '@playwright/test';

test('first visit requires bootstrap admin then redirects to login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/bootstrap-admin$/);
  await expect(page.getByRole('heading', { name: 'Create initial administrator' })).toBeVisible();

  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('password-123');
  await page.getByLabel('Confirm password').fill('password-123');
  await page.getByRole('button', { name: 'Create administrator' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
