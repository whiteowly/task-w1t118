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

test('collaboration panel persistence/search and org-admin import/export flows', async ({
  page
}) => {
  await bootstrapAdmin(page);
  await loginAs(page, 'admin', 'password-123');
  await expect(page).toHaveURL(/\/merchant$/);

  const collaborationPanel = page.getByRole('region', { name: 'Collaboration panel' });

  await page.getByLabel('Post message').fill('E2E collaboration message for merchant context');
  await collaborationPanel.getByRole('button', { name: 'Post message' }).click();
  await expect(collaborationPanel.getByRole('status')).toContainText('Context message posted.');
  await expect(page.getByText('E2E collaboration message for merchant context')).toBeVisible();

  await page.getByLabel('New shared note').fill('E2E shared note from panel');
  await collaborationPanel.getByRole('button', { name: 'Save note' }).click();
  await expect(collaborationPanel.getByRole('status')).toContainText('Shared note saved.');
  const sharedNotesCard = collaborationPanel
    .locator('section')
    .filter({ hasText: 'Shared notes' })
    .first();
  await expect(sharedNotesCard.locator('li textarea').first()).toHaveValue(
    'E2E shared note from panel'
  );

  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel('Keyword').fill('shared note from panel');
  await page.getByLabel('Start date').fill(today);
  await page.getByLabel('End date').fill(today);
  await page.getByRole('button', { name: 'Run search' }).click();
  await expect(collaborationPanel.getByRole('status')).toContainText('Search returned');
  await expect(page.getByText('E2E shared note from panel').first()).toBeVisible();

  const messageItem = page
    .locator('li')
    .filter({ hasText: 'E2E collaboration message for merchant context' })
    .first();
  await messageItem.getByRole('button', { name: 'Archive' }).click();
  await expect(collaborationPanel.getByRole('status')).toContainText('Message archived.');

  await page.getByLabel('Show archived entries in context sections').check();
  await expect(page.getByText('E2E collaboration message for merchant context')).toBeVisible();

  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);

  const importExportPanel = page.getByRole('region', { name: 'Import export operations panel' });

  await page.getByLabel('Export entity').selectOption({ label: 'Collaboration notes' });
  await page.getByLabel('Export format').selectOption('json');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export entity data' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/collaborationNotes-bulk-\d{8}-\d{6}\.json/);

  await page.getByLabel('Import entity').selectOption({ label: 'Collaboration notes' });
  await page.getByLabel('Import format').selectOption('json');
  await page.getByLabel('Mode').selectOption('upsert');

  const importPayload = [
    {
      id: 'e2e-import-note-org-admin',
      contextKey: '/org-admin',
      contextLabel: 'Org Admin',
      noteBody: 'Imported note from e2e test',
      archived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: 'e2e-admin',
      updatedBy: 'e2e-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  await page.getByLabel('Import file').setInputFiles({
    name: 'e2e-collab-notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importPayload), 'utf-8')
  });

  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(importExportPanel.getByRole('status')).toContainText(
    'Preview ready: 1/1 rows valid.'
  );

  await page.getByRole('button', { name: 'Commit import' }).click();
  await expect(importExportPanel.getByRole('status')).toContainText(
    'Import committed: 1 rows (upsert).'
  );

  await page.getByRole('link', { name: 'Merchant Console' }).click();
  await expect(page).toHaveURL(/\/merchant$/);
  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);
  const orgAdminNotesCard = page
    .getByRole('region', { name: 'Collaboration panel' })
    .locator('section')
    .filter({ hasText: 'Shared notes' })
    .first();
  await expect(orgAdminNotesCard.locator('li textarea').first()).toHaveValue(
    'Imported note from e2e test'
  );
});
