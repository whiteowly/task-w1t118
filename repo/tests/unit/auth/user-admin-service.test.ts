import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import {
  createManagedUser,
  listManagedUsers,
  setManagedUserRoles,
  setManagedUserStatus
} from '../../../src/core/auth/user-admin-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';

describe('user administration service', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('allows administrator to create and manage local users', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createManagedUser({
      username: 'booking.user',
      password: 'password-234',
      confirmPassword: 'password-234',
      roles: ['BookingAgent']
    });

    const stored = await db.users.get(created.id);
    expect(stored?.encryptedPasswordArtifacts).toBeDefined();
    expect(stored?.passwordHash).toBeUndefined();
    expect(stored?.passwordSalt).toBeUndefined();

    await setManagedUserRoles(created.id, ['BookingAgent', 'Recruiter']);
    await setManagedUserStatus(created.id, 'disabled');

    const users = await listManagedUsers();
    const managed = users.find((user) => user.id === created.id);

    expect(managed?.roles).toEqual(['BookingAgent', 'Recruiter']);
    expect(managed?.status).toBe('disabled');
  });

  it('blocks non-administrator from creating users', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await createManagedUser({
      username: 'booking.user',
      password: 'password-234',
      confirmPassword: 'password-234',
      roles: ['BookingAgent']
    });

    logout();
    await login({ username: 'booking.user', password: 'password-234' });

    await expect(
      createManagedUser({
        username: 'unauthorized',
        password: 'password-345',
        confirmPassword: 'password-345',
        roles: ['Recruiter']
      })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
