import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import ConversationPanelHarness from './ConversationPanelHarness.svelte';

describe('ConversationPanel component', () => {
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

  it('renders collaboration panel region', () => {
    const { getByRole } = render(ConversationPanelHarness, { props: { roles: ['Administrator'] } });
    expect(getByRole('region', { name: 'Collaboration panel' })).toBeTruthy();
  });

  it('shows post message form for roles with collaboration access', async () => {
    const { findByLabelText } = render(ConversationPanelHarness, {
      props: { roles: ['Administrator'] }
    });
    expect(await findByLabelText('Post message')).toBeTruthy();
  });

  it('shows no-access message for roles without collaboration capability', () => {
    const { getByText } = render(ConversationPanelHarness, { props: { roles: [] } });
    expect(getByText(/cannot access collaboration/i)).toBeTruthy();
  });
});
