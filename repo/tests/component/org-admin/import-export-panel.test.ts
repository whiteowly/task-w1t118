import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import ImportExportPanelHarness from './ImportExportPanelHarness.svelte';

describe('ImportExportPanel component', () => {
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

  it('shows permission warning when canManage is false', () => {
    const { getByText } = render(ImportExportPanelHarness, { props: { canManage: false } });
    expect(getByText(/require.*manage permissions/i)).toBeTruthy();
  });

  it('renders export and import sections when canManage is true', () => {
    const { getByRole } = render(ImportExportPanelHarness, { props: { canManage: true } });
    expect(getByRole('button', { name: 'Export entity data' })).toBeTruthy();
  });

  it('renders import controls when canManage is true', () => {
    const { getByRole } = render(ImportExportPanelHarness, { props: { canManage: true } });
    expect(getByRole('button', { name: 'Preview import' })).toBeTruthy();
  });
});
