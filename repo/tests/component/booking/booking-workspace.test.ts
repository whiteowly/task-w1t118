import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import BookingWorkspaceHarness from './BookingWorkspaceHarness.svelte';

describe('BookingWorkspacePage component', () => {
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

  it('renders Booking Desk heading for BookingAgent', () => {
    const { getByRole } = render(BookingWorkspaceHarness, { props: { roles: ['BookingAgent'] } });
    expect(getByRole('heading', { name: 'Booking Desk' })).toBeTruthy();
  });

  it('renders Booking Desk heading for Administrator', () => {
    const { getByRole } = render(BookingWorkspaceHarness, { props: { roles: ['Administrator'] } });
    expect(getByRole('heading', { name: 'Booking Desk' })).toBeTruthy();
  });

  it('shows no-access message for MerchantEditor role', () => {
    const { getByText } = render(BookingWorkspaceHarness, { props: { roles: ['MerchantEditor'] } });
    expect(getByText(/do not have access to Booking Desk/i)).toBeTruthy();
  });
});
