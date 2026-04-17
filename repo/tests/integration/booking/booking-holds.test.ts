import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  createOrRefreshBookingHold,
  releaseBookingHold
} from '../../../src/modules/booking/booking-service';
import { __resetLockManagerStateForTests } from '../../../src/core/concurrency/lock-manager';

function futureIso(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

describe('booking holds integration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    __resetLockManagerStateForTests();
  });

  afterEach(async () => {
    __resetLockManagerStateForTests();
    logout();
    await db.delete();
  });

  it('creates a booking hold and retrieves it from the database', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const result = await createOrRefreshBookingHold({
      resourceId: 'patio-a',
      startsAt: futureIso(120),
      durationMinutes: 60,
      holderTabId: 'tab-hold-test'
    });

    expect(result.holdId).toBeTruthy();
    expect(result.expiresAt).toBeTruthy();

    const hold = await db.orderHolds.get(result.holdId);
    expect(hold).toBeTruthy();
    expect(hold?.status).toBe('active');
  });

  it('releases a booking hold', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const result = await createOrRefreshBookingHold({
      resourceId: 'patio-a',
      startsAt: futureIso(180),
      durationMinutes: 60,
      holderTabId: 'tab-release-test'
    });

    await releaseBookingHold(result.holdId);

    const hold = await db.orderHolds.get(result.holdId);
    expect(hold?.status).toBe('released');
  });

  it('refreshes an existing hold by passing its id back', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const startsAt = futureIso(240);

    const first = await createOrRefreshBookingHold({
      resourceId: 'patio-b',
      startsAt,
      durationMinutes: 60,
      holderTabId: 'tab-refresh-test'
    });

    const refreshed = await createOrRefreshBookingHold({
      resourceId: 'patio-b',
      startsAt,
      durationMinutes: 60,
      holderTabId: 'tab-refresh-test',
      holdId: first.holdId
    });

    expect(refreshed.holdId).toBe(first.holdId);
    expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.expiresAt).getTime()
    );
  });
});
