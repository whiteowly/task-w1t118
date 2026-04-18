import { expect, test } from '@playwright/test';
import { ensureBootstrapAdministrator } from '../support/auth-helpers';

test('first visit requires bootstrap admin then redirects to login', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
