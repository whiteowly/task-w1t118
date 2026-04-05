import { expect, test } from '@playwright/test';

async function bootstrapAdmin(page: import('@playwright/test').Page): Promise<void> {
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

async function createBookingAgentUser(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);

  await page.getByLabel('Username').fill('booking.agent');
  await page.getByLabel('Temporary password').fill('password-234');
  await page.getByLabel('Confirm password').fill('password-234');
  await page.getByRole('group', { name: 'Assign roles' }).getByLabel('BookingAgent').check();
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('status')).toContainText('User created successfully.');
}

test('booking desk supports create, reschedule, and cancel with guided flow', async ({ page }) => {
  await bootstrapAdmin(page);
  await loginAs(page, 'admin', 'password-123');
  await createBookingAgentUser(page);

  await page.getByRole('button', { name: 'Logout' }).click();
  await loginAs(page, 'booking.agent', 'password-234');
  await expect(page).toHaveURL(/\/booking$/);

  await page.getByRole('button', { name: 'Select' }).first().click();
  await expect(page.getByText('Slot is currently available.')).toBeVisible();

  await page.getByRole('button', { name: 'Continue to details' }).click();
  await page.getByLabel('Customer name').fill('E2E Guest');
  await page.getByLabel('Party size').fill('4');
  await page.getByLabel('Notes').fill('Booth preferred');
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('status')).toContainText('Booking created successfully.');
  await expect(page.getByText('E2E Guest (4)')).toBeVisible();

  await page.getByRole('button', { name: 'Reschedule' }).first().click();
  await page.getByRole('button', { name: 'Select' }).nth(1).click();
  await page.getByRole('button', { name: 'Continue to details' }).click();
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm reschedule' }).click();

  await expect(page.getByRole('status')).toContainText('Booking rescheduled successfully.');

  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(page.getByRole('status')).toContainText('Booking cancelled');
  const bookingRow = page.locator('tbody tr').filter({ hasText: 'E2E Guest (4)' }).first();
  await expect(bookingRow.locator('.status')).toContainText(/Cancelled|Late Cancel/);
});

test('equivalent multi-tab conflict proof blocks slot already held by another tab', async ({
  page,
  context
}) => {
  await bootstrapAdmin(page);
  await loginAs(page, 'admin', 'password-123');
  await createBookingAgentUser(page);

  await page.getByRole('button', { name: 'Logout' }).click();
  await loginAs(page, 'booking.agent', 'password-234');
  await expect(page).toHaveURL(/\/booking$/);

  const secondPage = await context.newPage();
  await secondPage.goto('/');
  await loginAs(secondPage, 'booking.agent', 'password-234');
  await expect(secondPage).toHaveURL(/\/booking$/);

  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: 'Continue to details' }).click();
  await expect(page.getByText('Slot hold placed.')).toBeVisible();

  await secondPage.getByRole('button', { name: 'Select' }).first().click();
  await expect(secondPage.getByText('holds the selected booking slot')).toBeVisible();
});
