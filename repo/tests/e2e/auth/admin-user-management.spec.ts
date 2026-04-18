import { expect, test } from '@playwright/test';
import { ensureBootstrapAdministrator, loginViaForm } from '../support/auth-helpers';

test('administrator can create local users from org admin', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');

  await expect(page).toHaveURL(/\/merchant$/);
  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);
  await expect(page.getByRole('heading', { name: 'Local user administration' })).toBeVisible();

  await page.getByLabel('Username').fill('booking.user');
  await page.getByLabel('Temporary password').fill('password-234');
  await page.getByLabel('Confirm password').fill('password-234');
  await page.getByRole('group', { name: 'Assign roles' }).getByLabel('BookingAgent').check();
  await page.getByRole('button', { name: 'Create user' }).click();

  await expect(page.getByRole('status')).toContainText('User created successfully.');
  await expect(page.getByText('booking.user')).toBeVisible();
});

test('manual lock opens the session lock modal', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');
  await expect(page).toHaveURL(/\/merchant$/);

  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByRole('heading', { name: 'Session locked' })).toBeVisible();
});
