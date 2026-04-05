import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { createManagedUser } from '../../../src/core/auth/user-admin-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  cancelBooking,
  createBooking,
  listBookingAvailabilityForDate,
  listBookingsForDate,
  previewBookingConflict,
  rescheduleBooking,
  todayBookingDateKey
} from '../../../src/modules/booking/booking-service';
import { __resetLockManagerStateForTests as __resetLockManagerSupportStateForTests } from '../../../src/core/concurrency/lock-manager';

function futureIso(minutesFromNow: number): string {
  const time = new Date(Date.now() + minutesFromNow * 60_000);
  return time.toISOString();
}

function localDateKeyFromIso(isoDate: string): string {
  const value = new Date(isoDate);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('booking service integration', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    __resetLockManagerSupportStateForTests();
  });

  afterEach(async () => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: originalBroadcastChannel,
      configurable: true,
      writable: true
    });

    __resetLockManagerSupportStateForTests();
    logout();
    await db.delete();
  });

  it('blocks duplicate create submissions by idempotency key', { timeout: 15_000 }, async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const startsAt = futureIso(240);
    const payload = {
      resourceId: 'patio-a',
      startsAt,
      durationMinutes: 60,
      customerName: 'Alice',
      partySize: 4,
      notes: 'birthday',
      holderTabId: 'tab-a',
      idempotencyKey: 'create:dup:test'
    };

    await createBooking(payload);

    await expect(createBooking(payload)).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' });

    const bookings = await listBookingsForDate(localDateKeyFromIso(startsAt));
    expect(bookings.filter((booking) => booking.customerName === 'Alice')).toHaveLength(1);
  });

  it('applies cancellation rule for free cancel vs late cancel', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const freeCancel = await createBooking({
      resourceId: 'patio-a',
      startsAt: futureIso(180),
      durationMinutes: 60,
      customerName: 'Free Cancel',
      partySize: 2,
      notes: '',
      holderTabId: 'tab-free',
      idempotencyKey: 'create:free:one'
    });

    const lateCancel = await createBooking({
      resourceId: 'patio-b',
      startsAt: futureIso(50),
      durationMinutes: 60,
      customerName: 'Late Cancel',
      partySize: 2,
      notes: '',
      holderTabId: 'tab-late',
      idempotencyKey: 'create:late:one'
    });

    const freeCancelled = await cancelBooking({
      bookingId: freeCancel.id,
      idempotencyKey: 'cancel:free:one'
    });
    const lateCancelled = await cancelBooking({
      bookingId: lateCancel.id,
      idempotencyKey: 'cancel:late:one'
    });

    expect(freeCancelled.status).toBe('cancelled');
    expect(lateCancelled.status).toBe('late_cancelled');

    const auditEvents = await db.auditEvents.toArray();
    expect(
      auditEvents.some(
        (event) => event.actionType === 'BOOKING_CREATED' && event.entityId === freeCancel.id
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) => event.actionType === 'BOOKING_CREATED' && event.entityId === lateCancel.id
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) => event.actionType === 'BOOKING_CANCELLED' && event.entityId === freeCancel.id
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) => event.actionType === 'BOOKING_CANCELLED' && event.entityId === lateCancel.id
      )
    ).toBe(true);
  });

  it('prevents reschedule into an occupied slot', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const occupiedStart = futureIso(300);
    const movableStart = futureIso(420);

    await createBooking({
      resourceId: 'dining-room',
      startsAt: occupiedStart,
      durationMinutes: 60,
      customerName: 'Occupied',
      partySize: 4,
      notes: '',
      holderTabId: 'tab-occupied',
      idempotencyKey: 'create:occupied:one'
    });

    const movable = await createBooking({
      resourceId: 'dining-room',
      startsAt: movableStart,
      durationMinutes: 60,
      customerName: 'Movable',
      partySize: 3,
      notes: '',
      holderTabId: 'tab-movable',
      idempotencyKey: 'create:movable:one'
    });

    await expect(
      rescheduleBooking({
        bookingId: movable.id,
        resourceId: 'dining-room',
        startsAt: occupiedStart,
        durationMinutes: 60,
        holderTabId: 'tab-movable',
        idempotencyKey: 'reschedule:conflict:one'
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enforces lock/conflict protection under concurrent create attempts', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const startsAt = futureIso(360);

    const attemptA = createBooking({
      resourceId: 'patio-a',
      startsAt,
      durationMinutes: 60,
      customerName: 'Concurrent A',
      partySize: 2,
      notes: '',
      holderTabId: 'tab-a',
      idempotencyKey: 'create:concurrent:a'
    });

    const attemptB = createBooking({
      resourceId: 'patio-a',
      startsAt,
      durationMinutes: 60,
      customerName: 'Concurrent B',
      partySize: 2,
      notes: '',
      holderTabId: 'tab-b',
      idempotencyKey: 'create:concurrent:b'
    });

    const results = await Promise.allSettled([attemptA, attemptB]);

    const fulfilledCount = results.filter((result) => result.status === 'fulfilled').length;
    const rejectedResults = results.filter((result) => result.status === 'rejected');

    expect(fulfilledCount).toBe(1);
    expect(rejectedResults).toHaveLength(1);

    const reason = (rejectedResults[0] as PromiseRejectedResult | undefined)?.reason as {
      code?: string;
    };
    expect(['LOCK_UNAVAILABLE', 'CONFLICT']).toContain(reason.code);

    const patioBookings = await db.bookings
      .where('resourceId')
      .equals('patio-a')
      .and((booking) => booking.status === 'confirmed')
      .toArray();
    expect(patioBookings).toHaveLength(1);
  });

  it('enforces booking permissions for non-booking roles', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await createManagedUser({
      username: 'merchant.editor',
      password: 'password-234',
      confirmPassword: 'password-234',
      roles: ['MerchantEditor']
    });

    logout();
    await login({ username: 'merchant.editor', password: 'password-234' });

    await expect(listBookingAvailabilityForDate(todayBookingDateKey())).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });

    await expect(
      previewBookingConflict({
        resourceId: 'patio-a',
        startsAt: futureIso(120),
        durationMinutes: 60,
        holderTabId: 'tab-x'
      })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('hard-blocks booking mutations when prompt-critical multi-tab support is unavailable', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: undefined,
      configurable: true,
      writable: true
    });
    __resetLockManagerSupportStateForTests();

    await expect(
      createBooking({
        resourceId: 'patio-a',
        startsAt: futureIso(180),
        durationMinutes: 60,
        customerName: 'Unsupported Browser',
        partySize: 2,
        notes: '',
        holderTabId: 'tab-unsupported',
        idempotencyKey: 'create:unsupported:one'
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_BROWSER' });
  });
});
