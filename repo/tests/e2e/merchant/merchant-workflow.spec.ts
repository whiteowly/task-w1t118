import { expect, test } from '@playwright/test';
import { ensureBootstrapAdministrator, loginViaForm } from '../support/auth-helpers';

test('merchant draft-review-publish workflow and version compare', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');
  await expect(page).toHaveURL(/\/merchant$/);

  await page.getByLabel('New merchant').fill('Demo Merchant');
  await page.getByRole('button', { name: 'Create draft merchant' }).click();
  await expect(page.getByRole('status')).toContainText('Merchant draft created.');

  await page.getByRole('button', { name: 'Demo Merchant' }).click();
  await page.getByRole('button', { name: 'Edit details' }).first().click();

  await page.getByLabel('Description').fill('Merchant ready for reviewer workflow.');
  await page.getByLabel('Premium').first().check();
  await page.getByLabel('WiFi').first().check();
  await page.getByRole('button', { name: 'Save merchant draft' }).click();
  await expect(page.getByRole('status')).toContainText('Merchant draft saved.');

  await page.getByRole('button', { name: 'Submit' }).click();
  const submitModal = page.getByRole('dialog', { name: 'Submit for review merchant' });
  await submitModal.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('status')).toContainText('Merchant submitted for review.');
  await expect(page.getByText('in_review')).toBeVisible();

  await page.getByRole('button', { name: 'Demo Merchant' }).click();

  await page.getByRole('button', { name: 'Approve' }).click();
  const approveModal = page.getByRole('dialog', { name: 'Approve merchant' });
  await approveModal.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status')).toContainText('Merchant approved.');

  await page.getByRole('button', { name: 'Publish' }).click();
  const publishModal = page.getByRole('dialog', { name: 'Publish merchant' });
  await publishModal.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status')).toContainText('Merchant published.');
  await expect(page.getByText('published', { exact: true })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Merchant version compare' })).toBeVisible();
  await expect(page.locator('pre', { hasText: '"name": "Demo Merchant"' }).first()).toBeVisible();
});
