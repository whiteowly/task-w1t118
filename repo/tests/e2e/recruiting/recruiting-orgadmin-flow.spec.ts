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

async function createUser(
  page: import('@playwright/test').Page,
  input: { username: string; password: string; role: 'Recruiter' | 'HRManager' }
): Promise<void> {
  await page.getByLabel('Username').fill(input.username);
  await page.getByLabel('Temporary password').fill(input.password);
  await page.getByLabel('Confirm password').fill(input.password);
  await page.getByRole('group', { name: 'Assign roles' }).getByLabel(input.role).check();
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('status')).toContainText('User created successfully.');
}

test('recruiting approval, signature, and onboarding flow', async ({ page }) => {
  await bootstrapAdmin(page);
  await loginAs(page, 'admin', 'password-123');

  await page.getByRole('link', { name: 'Org Admin' }).click();
  await expect(page).toHaveURL(/\/org-admin$/);

  await createUser(page, {
    username: 'recruiter.user',
    password: 'password-234',
    role: 'Recruiter'
  });

  await createUser(page, {
    username: 'hr.manager',
    password: 'password-345',
    role: 'HRManager'
  });

  await page.getByRole('button', { name: 'Logout' }).click();
  await loginAs(page, 'recruiter.user', 'password-234');
  await expect(page).toHaveURL(/\/recruiting$/);

  await page.getByLabel('Candidate name').fill('E2E Recruit Candidate');
  await page.getByLabel('Candidate email').fill('e2e.candidate@example.com');
  await page.getByRole('button', { name: 'Create offer' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Offer created and routed to HR Manager approval queue.'
  );
  await expect(page.getByText('Pending HR approval').first()).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await loginAs(page, 'hr.manager', 'password-345');
  await expect(page).toHaveURL(/\/recruiting$/);

  await page.getByRole('button', { name: /E2E Recruit Candidate/ }).click();
  await page.getByRole('button', { name: 'Approve offer' }).click();
  await expect(page.getByRole('status')).toContainText('Offer approved by HR Manager.');

  await page.getByRole('button', { name: 'Logout' }).click();
  await loginAs(page, 'recruiter.user', 'password-234');
  await expect(page).toHaveURL(/\/recruiting$/);

  await page.getByRole('button', { name: /E2E Recruit Candidate/ }).click();
  await expect(page.getByText('Approved').first()).toBeVisible();

  await page.getByLabel('Typed name (required)').fill('E2E Recruit Candidate');
  await page.getByRole('button', { name: 'Capture signature' }).click();
  await expect(page.getByRole('status')).toContainText('E-signature captured successfully.');

  await page.getByLabel('Legal name').fill('E2E Recruit Candidate');
  await page.getByLabel('Address line 1').fill('100 Main Street');
  await page.getByLabel('City').fill('Seattle');
  await page.getByLabel('State / Province').fill('WA');
  await page.getByLabel('Postal code').fill('98101');
  await page.getByLabel('SSN (###-##-####)').fill('123-45-6789');
  await page.getByLabel('Emergency contact name').fill('E2E Contact');
  await page.getByLabel('Emergency contact phone').fill('+1 (555) 121-2121');
  await page.getByRole('button', { name: 'Save onboarding documents' }).click();

  await expect(page.getByText('Onboarding documents saved')).toBeVisible();
  await expect(page.getByText('***-**-6789')).toBeVisible();

  const checklistCard = page.locator('section').filter({ hasText: 'Onboarding checklist' }).first();
  const checklistSelects = checklistCard.locator('tbody select');
  const checklistCount = await checklistSelects.count();

  for (let index = 0; index < checklistCount; index += 1) {
    await checklistSelects.nth(index).selectOption('complete');
  }

  await expect(page.getByText('Onboarding: Complete')).toBeVisible();
});

test('org admin hierarchy and position dictionary basics', async ({ page }) => {
  await bootstrapAdmin(page);
  await loginAs(page, 'admin', 'password-123');
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
