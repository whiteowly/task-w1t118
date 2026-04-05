import { expect, test } from '@playwright/test';

async function bootstrapInitialAdministrator(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');

  await expect(page).toHaveURL(/\/bootstrap-admin$/);

  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('password-123');
  await page.getByLabel('Confirm password').fill('password-123');
  await page.getByRole('button', { name: 'Create administrator' }).click();

  await expect(page).toHaveURL(/\/login$/);
}

async function loginAs(
  page: import('@playwright/test').Page,
  username: string,
  password: string
): Promise<void> {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('administrator can create local users and role access is enforced', async ({ page }) => {
  await bootstrapInitialAdministrator(page);
  await loginAs(page, 'admin', 'password-123');

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

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginAs(page, 'booking.user', 'password-234');
  await expect(page).toHaveURL(/\/booking$/);

  await page.evaluate(() => {
    window.location.hash = '#/org-admin';
  });

  await expect(page).toHaveURL(/#\/denied$/);
  await expect(page.getByRole('heading', { name: 'Permission denied' })).toBeVisible();
});

test('manual lock requires re-authentication', async ({ page }) => {
  await bootstrapInitialAdministrator(page);
  await loginAs(page, 'admin', 'password-123');
  await expect(page).toHaveURL(/\/merchant$/);

  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByRole('heading', { name: 'Session locked' })).toBeVisible();

  await page.getByLabel('Password').fill('password-123');
  await page.getByRole('button', { name: 'Unlock session' }).click();

  await expect(page.getByRole('heading', { name: 'Session locked' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Merchant Console' })).toBeVisible();
});
