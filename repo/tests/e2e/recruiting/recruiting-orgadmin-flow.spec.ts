import { expect, test } from '@playwright/test';
import { ensureBootstrapAdministrator, loginViaForm } from '../support/auth-helpers';

test('recruiting workspace loads and shows an empty offer queue initially', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');
  await page.getByRole('link', { name: 'Recruiting' }).click();
  await expect(page).toHaveURL(/\/recruiting$/);
  await expect(page.getByRole('heading', { name: 'Offer queue' })).toBeVisible();
  await expect(page.getByText('No offers have been created yet.')).toBeVisible();
});

test('org admin hierarchy and position dictionary basics', async ({ page }) => {
  await ensureBootstrapAdministrator(page);
  await loginViaForm(page, 'admin', 'password-123');
  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);

  await page.getByLabel('Node name').fill('Field Delivery');
  await page.getByLabel('Node type').selectOption('department');
  await page.getByRole('button', { name: 'Create hierarchy node' }).click();
  await expect(page.getByText('Field Delivery — Department')).toBeVisible();

  await page.getByLabel('Node name').fill('G8');
  await page.getByLabel('Node type').selectOption('grade');
  await page.getByLabel('Parent node').selectOption({ label: 'Field Delivery (Department)' });
  await page.getByRole('button', { name: 'Create hierarchy node' }).click();
  await expect(page.getByText('G8 — Grade')).toBeVisible();

  await page.getByLabel('Node name').fill('Temporary');
  await page.getByLabel('Node type').selectOption('class');
  await page.getByLabel('Parent node').selectOption({ label: 'G8 (Grade)' });
  await page.getByRole('button', { name: 'Create hierarchy node' }).click();
  await expect(page.getByText('Temporary — Class')).toBeVisible();

  await page.getByLabel('Position title').fill('Field Delivery Coordinator');
  await page.getByLabel('Department').selectOption({ label: 'Field Delivery' });
  await page.getByLabel('Grade').selectOption({ label: 'G8' });
  await page.getByLabel('Class').selectOption({ label: 'Temporary' });
  await page.getByLabel('Headcount limit').fill('5');
  await page
    .getByLabel('Responsibilities (one per line)')
    .fill('Coordinate field staffing\nTrack service requests');
  await page
    .getByLabel('Eligibility rules (one per line)')
    .fill('2+ years staffing operations\nWeekend flexibility');
  await page.getByRole('button', { name: 'Create position' }).click();

  await expect(page.getByRole('status')).toContainText('Position dictionary entry created.');
  await expect(page.getByText('Field Delivery Coordinator')).toBeVisible();

  await page.getByRole('button', { name: 'Compute occupancy statistics' }).click();
  await expect(page.getByRole('status')).toContainText('Occupancy statistics computed on demand.');
  await expect(page.getByRole('cell', { name: 'Field Delivery Coordinator' })).toHaveCount(2);
});
