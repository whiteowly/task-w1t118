import { expect, type Page } from '@playwright/test';

export async function ensureBootstrapAdministrator(page: Page): Promise<void> {
  await page.goto('/');

  if (/\/login$/.test(page.url())) {
    return;
  }

  await expect(page).toHaveURL(/\/bootstrap-admin$/);

  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('password-123');
  await page.getByLabel('Confirm password').fill('password-123');
  await page.getByRole('button', { name: 'Create administrator' }).click();

  try {
    await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
  } catch {
    await expect(page.getByRole('alert')).toContainText(
      'Administrator bootstrap has already been completed.'
    );
    await page.reload();
    if (!/\/login$/.test(page.url())) {
      await page.goto('/#/login');
    }
    await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  }
}

export async function loginViaForm(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
