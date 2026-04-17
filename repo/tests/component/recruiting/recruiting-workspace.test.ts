import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import RecruitingWorkspaceHarness from './RecruitingWorkspaceHarness.svelte';

describe('RecruitingWorkspacePage component', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('renders Recruiting Workspace heading for Recruiter role', () => {
    const { getByRole } = render(RecruitingWorkspaceHarness, { props: { roles: ['Recruiter'] } });
    expect(getByRole('heading', { name: 'Recruiting Workspace' })).toBeTruthy();
  });

  it('renders for Administrator role', () => {
    const { getByRole } = render(RecruitingWorkspaceHarness, {
      props: { roles: ['Administrator'] }
    });
    expect(getByRole('heading', { name: 'Recruiting Workspace' })).toBeTruthy();
  });

  it('shows no-access message for BookingAgent role', async () => {
    const { findByText } = render(RecruitingWorkspaceHarness, {
      props: { roles: ['BookingAgent'] }
    });
    expect(await findByText(/cannot access recruiting/i)).toBeTruthy();
  });
});
