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

async function login(
  page: import('@playwright/test').Page,
  username: string,
  password: string
): Promise<void> {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function createUserWithRole(
  page: import('@playwright/test').Page,
  username: string,
  roleLabel: 'MerchantEditor' | 'ContentReviewerPublisher'
): Promise<void> {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Temporary password').fill('password-234');
  await page.getByLabel('Confirm password').fill('password-234');
  await page.getByRole('group', { name: 'Assign roles' }).getByLabel(roleLabel).check();
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('status')).toContainText('User created successfully.');
}

test('merchant draft-review-publish workflow and version compare', async ({ page }) => {
  await bootstrapAdmin(page);
  await login(page, 'admin', 'password-123');
  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);

  await createUserWithRole(page, 'merchant.editor', 'MerchantEditor');
  await createUserWithRole(page, 'content.reviewer', 'ContentReviewerPublisher');

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, 'merchant.editor', 'password-234');
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

  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Logout' }).click();
  await login(page, 'content.reviewer', 'password-234');
  await expect(page).toHaveURL(/\/merchant$/);
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
