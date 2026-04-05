import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { decryptPasswordArtifacts } from '../../../src/core/security/auth-artifacts';
import { sessionStore } from '../../../src/shared/stores/session-store';

describe('password artifact encryption at rest', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    sessionStore.set({ status: 'logged_out', user: null });
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('stores bootstrap password artifacts encrypted instead of plaintext fields', async () => {
    await bootstrapAdministrator({
      username: 'admin-secure',
      password: 'password-123',
      confirmPassword: 'password-123'
    });

    const stored = await db.users.where('username').equals('admin-secure').first();

    expect(stored).toBeDefined();
    expect(stored?.encryptedPasswordArtifacts).toBeDefined();
    expect(stored?.passwordHash).toBeUndefined();
    expect(stored?.passwordSalt).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('password-123');

    await expect(
      decryptPasswordArtifacts(
        stored!.encryptedPasswordArtifacts!,
        'wrong-password',
        stored!.username
      )
    ).rejects.toThrow();
  });

  it('keeps login working with encrypted at-rest artifacts', async () => {
    await bootstrapAdministrator({
      username: 'admin-login',
      password: 'password-123',
      confirmPassword: 'password-123'
    });

    await login({ username: 'admin-login', password: 'password-123' });
    expect(get(sessionStore).status).toBe('authenticated');
    expect(get(sessionStore).user?.username).toBe('admin-login');
  });
});
