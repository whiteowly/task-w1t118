import { expect, test } from '@playwright/test';
import { ensureBootstrapAdministrator, loginViaForm } from '../support/auth-helpers';

test('booking desk supports create, reschedule, and cancel with guided flow', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');
  await page.getByRole('link', { name: 'Booking Desk' }).click();
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
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');
  await page.getByRole('link', { name: 'Booking Desk' }).click();
  await expect(page).toHaveURL(/\/booking$/);

  const secondPage = await context.newPage();
  await ensureBootstrapAdministrator(secondPage);
  await loginViaForm(secondPage, 'admin', 'password-123');
  await secondPage.getByRole('link', { name: 'Booking Desk' }).click();
  await expect(secondPage).toHaveURL(/\/booking$/);

  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: 'Continue to details' }).click();
  await expect(page.getByText('Slot hold placed.')).toBeVisible();

  await secondPage.getByRole('button', { name: 'Select' }).first().click();
  await expect(secondPage.getByText('holds the selected booking slot')).toBeVisible();
});
