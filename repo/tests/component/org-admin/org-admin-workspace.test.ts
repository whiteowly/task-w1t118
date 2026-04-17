import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import OrgAdminWorkspaceHarness from './OrgAdminWorkspaceHarness.svelte';

describe('OrgAdminWorkspacePage component', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    await bootstrapAdministrator({ username: 'admin', password: 'password-123', confirmPassword: 'password-123' });
    await login({ username: 'admin', password: 'password-123' });
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('renders Org Admin heading for Administrator', async () => {
    const { findByRole } = render(OrgAdminWorkspaceHarness, { props: { roles: ['Administrator'] } });
    expect(await findByRole('heading', { name: 'Local user administration' })).toBeTruthy();
  });

  it('renders user creation form for Administrator', async () => {
    const { findByLabelText, findByRole } = render(OrgAdminWorkspaceHarness, { props: { roles: ['Administrator'] } });
    expect(await findByLabelText('Username')).toBeTruthy();
    expect(await findByRole('button', { name: 'Create user' })).toBeTruthy();
  });
});
