import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetAutoLockDurationForTests,
  __setAutoLockDurationForTests,
  bootstrapAdministrator,
  lockSession,
  login,
  logout,
  reauthenticate
} from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { hasWorkspaceFieldEncryptionPassphrase } from '../../../src/core/security/workspace-field-key';
import { sessionStore } from '../../../src/shared/stores/session-store';

describe('session locking behavior', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    __resetAutoLockDurationForTests();
    logout();
    await db.delete();
  });

  it('auto-locks authenticated sessions after inactivity timeout', async () => {
    __setAutoLockDurationForTests(25);

    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    expect(get(sessionStore).status).toBe('authenticated');

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(get(sessionStore).status).toBe('locked');
  });

  it('re-authenticates a manually locked session', async () => {
    __setAutoLockDurationForTests(5_000);

    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });
    expect(hasWorkspaceFieldEncryptionPassphrase()).toBe(true);

    lockSession('test lock');
    expect(get(sessionStore).status).toBe('locked');
    expect(hasWorkspaceFieldEncryptionPassphrase()).toBe(false);

    await reauthenticate({ password: 'password-123' });
    expect(get(sessionStore).status).toBe('authenticated');
    expect(hasWorkspaceFieldEncryptionPassphrase()).toBe(true);
  });
});
