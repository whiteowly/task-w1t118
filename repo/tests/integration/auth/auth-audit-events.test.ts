import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  bootstrapAdministrator,
  lockSession,
  login,
  logout,
  reauthenticate
} from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';

describe('auth service audit event coverage', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    // Allow fire-and-forget audit writes to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    await db.delete();
  });

  it('records AUTH_LOGIN audit event on successful login', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });

    await login({ username: 'admin', password: 'password-123' });

    const events = await db.auditEvents.toArray();
    const loginEvent = events.find((e) => e.actionType === 'AUTH_LOGIN');
    expect(loginEvent).toBeTruthy();
    expect(loginEvent!.entityType).toBe('user');
    expect(loginEvent!.newState).toMatchObject({ username: 'admin' });
  });

  it('records AUTH_SESSION_LOCKED audit event on session lock', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    lockSession('manual test lock');

    // Wait for fire-and-forget audit write
    await new Promise((resolve) => setTimeout(resolve, 50));

    const events = await db.auditEvents.toArray();
    const lockEvent = events.find((e) => e.actionType === 'AUTH_SESSION_LOCKED');
    expect(lockEvent).toBeTruthy();
    expect(lockEvent!.entityType).toBe('session');
    expect(lockEvent!.newState).toMatchObject({ status: 'locked', reason: 'manual test lock' });
  });

  it('records AUTH_REAUTH audit event on reauthentication', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    lockSession('lock for reauth test');
    await new Promise((resolve) => setTimeout(resolve, 50));

    await reauthenticate({ password: 'password-123' });

    const events = await db.auditEvents.toArray();
    const reauthEvent = events.find((e) => e.actionType === 'AUTH_REAUTH');
    expect(reauthEvent).toBeTruthy();
    expect(reauthEvent!.entityType).toBe('session');
    expect(reauthEvent!.newState).toMatchObject({ status: 'authenticated' });
  });

  it('records AUTH_LOGOUT audit event on logout', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    logout();

    // Wait for fire-and-forget audit write
    await new Promise((resolve) => setTimeout(resolve, 50));

    const events = await db.auditEvents.toArray();
    const logoutEvent = events.find((e) => e.actionType === 'AUTH_LOGOUT');
    expect(logoutEvent).toBeTruthy();
    expect(logoutEvent!.entityType).toBe('session');
    expect(logoutEvent!.newState).toMatchObject({ status: 'logged_out' });
  });
});
