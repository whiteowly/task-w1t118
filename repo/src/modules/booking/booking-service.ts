import { get } from 'svelte/store';

import { appendAuditEvent } from '../../core/audit/audit-service';
import {
  db,
  type BookingRecord,
  type BookingStatus,
  type IdempotencyRecord,
  type OrderHoldRecord
} from '../../core/db/database';
import { logger } from '../../core/logging/logger';
import { assertCapability } from '../../core/permissions/service';
import { AppError } from '../../core/validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { RoleName } from '../../shared/types/auth';
import {
  BOOKING_CLOSE_HOUR,
  BOOKING_DURATION_OPTIONS,
  BOOKING_HOLD_TTL_MS,
  BOOKING_IDEMPOTENCY_TTL_MS,
  BOOKING_LOCK_TTL_MS,
  BOOKING_OPEN_HOUR,
  BOOKING_RESOURCES,
  BOOKING_SLOT_INTERVAL_MINUTES,
  FREE_CANCELLATION_WINDOW_MS
} from './booking-config';
import {
  bookingDraftSchema,
  cancelBookingSchema,
  createBookingSchema,
  parseBookingPayloadOrThrow,
  rescheduleBookingSchema,
  scheduleDateSchema
} from './booking-validation';
import { acquireLeaseLock, releaseLeaseLock } from '../../core/concurrency/lock-manager';
import { assertPromptCriticalMutationSupportOrThrow } from '../../core/concurrency/browser-support';

interface ActorContext {
  userId: string;
  username: string;
  roles: RoleName[];
}

export interface BookingView {
  id: string;
  resourceId: string;
  resourceLabel: string;
  customerName: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  notes: string;
  status: BookingStatus;
  cancellationReason: string | null;
  updatedAt: string;
}

export interface BookingAvailabilityCell {
  resourceId: string;
  resourceLabel: string;
  state: 'available' | 'booked' | 'held';
  conflictMessage: string | null;
}

export interface BookingAvailabilityRow {
  slotStartsAt: string;
  slotEndsAt: string;
  slotLabel: string;
  cells: BookingAvailabilityCell[];
}

export interface BookingAvailabilityView {
  date: string;
  rows: BookingAvailabilityRow[];
}

export interface BookingConflictPreview {
  available: boolean;
  reason: string | null;
}

interface HoldInfo {
  holderTabId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
}

function getActorOrThrow(): ActorContext {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An authenticated session is required for booking operations.'
    });
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    roles: session.user.roles
  };
}

function addMinutes(isoDate: string, minutes: number): string {
  return new Date(new Date(isoDate).getTime() + minutes * 60_000).toISOString();
}

function toLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSlotLabel(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const end = new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${start} - ${end}`;
}

function dayBounds(dateKey: string): { startsAt: string; endsAt: string } {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString()
  };
}

function intervalOverlaps(
  leftStartMs: number,
  leftEndMs: number,
  rightStartMs: number,
  rightEndMs: number
): boolean {
  return leftStartMs < rightEndMs && rightStartMs < leftEndMs;
}

function buildHoldResourceKey(resourceId: string, startsAt: string, endsAt: string): string {
  return `booking-hold|${resourceId}|${startsAt}|${endsAt}`;
}

function parseHoldResourceKey(resourceKey: string): HoldInfo | null {
  const [prefix, resourceId, startsAt, endsAt] = resourceKey.split('|');
  if (prefix !== 'booking-hold' || !resourceId || !startsAt || !endsAt) {
    return null;
  }

  return {
    holderTabId: '',
    resourceId,
    startsAt,
    endsAt
  };
}

function holdHolderTabIdFromId(holdId: string): string {
  const [, holderTabId = ''] = holdId.split(':');
  return holderTabId;
}

function mapBooking(record: BookingRecord): BookingView {
  return {
    id: record.id,
    resourceId: record.resourceId,
    resourceLabel: record.resourceLabel,
    customerName: record.customerName,
    partySize: record.partySize,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    notes: record.notes,
    status: record.status,
    cancellationReason: record.cancellationReason,
    updatedAt: record.updatedAt
  };
}

function hashRequestPayload(payload: unknown): string {
  return JSON.stringify(payload);
}

async function assertIdempotencyAvailableOrThrow(
  key: string,
  operationType: string,
  requestHash: string,
  nowIso: string
): Promise<void> {
  const existing = await db.idempotencyKeys.get(key);
  if (!existing) {
    return;
  }

  if (new Date(existing.expiresAt).getTime() <= new Date(nowIso).getTime()) {
    await db.idempotencyKeys.delete(key);
    return;
  }

  if (existing.operationType === operationType && existing.requestHash === requestHash) {
    throw new AppError({
      code: 'DUPLICATE_REQUEST',
      message: 'Duplicate submission blocked by idempotency key.'
    });
  }

  throw new AppError({
    code: 'CONFLICT',
    message: 'Idempotency key reuse detected with different request payload.'
  });
}

async function writeIdempotencyRecord(
  key: string,
  operationType: string,
  requestHash: string,
  responseHash: string,
  nowIso: string
): Promise<void> {
  await db.idempotencyKeys.put({
    key,
    operationType,
    requestHash,
    responseHash,
    createdAt: nowIso,
    expiresAt: new Date(new Date(nowIso).getTime() + BOOKING_IDEMPOTENCY_TTL_MS).toISOString()
  });
}

async function listActiveHolds(nowMs: number): Promise<OrderHoldRecord[]> {
  const holds = await db.orderHolds.where('status').equals('active').toArray();
  return holds.filter((hold) => new Date(hold.expiresAt).getTime() > nowMs);
}

function resolveResourceLabel(resourceId: string): string {
  return BOOKING_RESOURCES.find((resource) => resource.id === resourceId)?.label ?? resourceId;
}

async function assertNoBookingConflict(input: {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  ignoredBookingId?: string;
}): Promise<void> {
  const targetStartMs = new Date(input.startsAt).getTime();
  const targetEndMs = new Date(input.endsAt).getTime();

  const bookings = await db.bookings.where('resourceId').equals(input.resourceId).toArray();
  const conflict = bookings.find((booking) => {
    if (booking.status !== 'confirmed') {
      return false;
    }

    if (booking.id === input.ignoredBookingId) {
      return false;
    }

    return intervalOverlaps(
      targetStartMs,
      targetEndMs,
      new Date(booking.startsAt).getTime(),
      new Date(booking.endsAt).getTime()
    );
  });

  if (conflict) {
    throw new AppError({
      code: 'CONFLICT',
      message: `Resource ${resolveResourceLabel(input.resourceId)} is already booked for the selected time range.`
    });
  }
}

async function assertNoActiveHoldConflict(input: {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  holderTabId: string;
  ignoredHoldId?: string | null;
  nowMs: number;
}): Promise<void> {
  const holds = await listActiveHolds(input.nowMs);
  const targetStartMs = new Date(input.startsAt).getTime();
  const targetEndMs = new Date(input.endsAt).getTime();

  for (const hold of holds) {
    if (input.ignoredHoldId && hold.id === input.ignoredHoldId) {
      continue;
    }

    const parsed = parseHoldResourceKey(hold.resourceKey);
    if (!parsed) {
      continue;
    }

    const holdHolderTabId = holdHolderTabIdFromId(hold.id);
    if (holdHolderTabId === input.holderTabId) {
      continue;
    }

    if (parsed.resourceId !== input.resourceId) {
      continue;
    }

    const holdStartMs = new Date(parsed.startsAt).getTime();
    const holdEndMs = new Date(parsed.endsAt).getTime();

    if (intervalOverlaps(targetStartMs, targetEndMs, holdStartMs, holdEndMs)) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Another operator currently holds the selected booking slot. Try a different time.'
      });
    }
  }
}

async function withBookingLock<T>(
  resourceKey: string,
  holderTabId: string,
  callback: () => Promise<T>
) {
  const lock = await acquireLeaseLock({ resourceKey, holderTabId, ttlMs: BOOKING_LOCK_TTL_MS });
  if (!lock.acquired && lock.reason === 'UNSUPPORTED_BROWSER') {
    throw new AppError({
      code: 'UNSUPPORTED_BROWSER',
      message:
        'Booking mutations require BroadcastChannel-enabled multi-tab coordination in this browser.',
      details: { resourceKey }
    });
  }

  if (!lock.acquired) {
    throw new AppError({
      code: 'LOCK_UNAVAILABLE',
      message: 'Booking lock unavailable. Another operator is editing this slot right now.',
      retryable: true
    });
  }

  try {
    return await callback();
  } finally {
    await releaseLeaseLock(resourceKey, holderTabId);
  }
}

export async function listBookingAvailabilityForDate(
  date: string
): Promise<BookingAvailabilityView> {
  parseBookingPayloadOrThrow(scheduleDateSchema, { date });
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.view');

  const { startsAt: dayStartsAt, endsAt: dayEndsAt } = dayBounds(date);
  const dayStartMs = new Date(dayStartsAt).getTime();
  const dayEndMs = new Date(dayEndsAt).getTime();
  const nowMs = Date.now();

  const bookings = await db.bookings.toArray();
  const holds = await listActiveHolds(nowMs);

  const rows: BookingAvailabilityRow[] = [];

  const cursor = new Date(dayStartsAt);
  cursor.setHours(BOOKING_OPEN_HOUR, 0, 0, 0);
  const closeMs = new Date(dayStartsAt).setHours(BOOKING_CLOSE_HOUR, 0, 0, 0);

  while (cursor.getTime() < closeMs) {
    const slotStartMs = cursor.getTime();
    const slotEndMs = slotStartMs + BOOKING_SLOT_INTERVAL_MINUTES * 60_000;
    const slotStartsAt = new Date(slotStartMs).toISOString();
    const slotEndsAt = new Date(slotEndMs).toISOString();

    if (slotStartMs >= dayStartMs && slotEndMs <= dayEndMs) {
      const cells = BOOKING_RESOURCES.map((resource) => {
        const hasBookingConflict = bookings.some(
          (booking) =>
            booking.resourceId === resource.id &&
            booking.status === 'confirmed' &&
            intervalOverlaps(
              slotStartMs,
              slotEndMs,
              new Date(booking.startsAt).getTime(),
              new Date(booking.endsAt).getTime()
            )
        );

        if (hasBookingConflict) {
          return {
            resourceId: resource.id,
            resourceLabel: resource.label,
            state: 'booked' as const,
            conflictMessage: 'Confirmed booking exists'
          };
        }

        const hasHoldConflict = holds.some((hold) => {
          const parsed = parseHoldResourceKey(hold.resourceKey);
          if (!parsed || parsed.resourceId !== resource.id) {
            return false;
          }

          return intervalOverlaps(
            slotStartMs,
            slotEndMs,
            new Date(parsed.startsAt).getTime(),
            new Date(parsed.endsAt).getTime()
          );
        });

        if (hasHoldConflict) {
          return {
            resourceId: resource.id,
            resourceLabel: resource.label,
            state: 'held' as const,
            conflictMessage: 'Held by another active draft'
          };
        }

        return {
          resourceId: resource.id,
          resourceLabel: resource.label,
          state: 'available' as const,
          conflictMessage: null
        };
      });

      rows.push({
        slotStartsAt,
        slotEndsAt,
        slotLabel: toSlotLabel(slotStartsAt, slotEndsAt),
        cells
      });
    }

    cursor.setMinutes(cursor.getMinutes() + BOOKING_SLOT_INTERVAL_MINUTES);
  }

  return {
    date,
    rows
  };
}

export async function listBookingsForDate(date: string): Promise<BookingView[]> {
  parseBookingPayloadOrThrow(scheduleDateSchema, { date });
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.view');

  const { startsAt: dayStartsAt, endsAt: dayEndsAt } = dayBounds(date);
  const startMs = new Date(dayStartsAt).getTime();
  const endMs = new Date(dayEndsAt).getTime();

  const bookings = await db.bookings.toArray();
  return bookings
    .filter((booking) => {
      const bookingStartsAt = new Date(booking.startsAt).getTime();
      return bookingStartsAt >= startMs && bookingStartsAt < endMs;
    })
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .map(mapBooking);
}

export async function previewBookingConflict(input: {
  resourceId: string;
  startsAt: string;
  durationMinutes: number;
  holderTabId: string;
  ignoredBookingId?: string;
  ignoredHoldId?: string | null;
}): Promise<BookingConflictPreview> {
  const payload = parseBookingPayloadOrThrow(bookingDraftSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.view');

  const endsAt = addMinutes(payload.startsAt, payload.durationMinutes);

  try {
    await assertNoBookingConflict({
      resourceId: payload.resourceId,
      startsAt: payload.startsAt,
      endsAt,
      ignoredBookingId: input.ignoredBookingId
    });

    await assertNoActiveHoldConflict({
      resourceId: payload.resourceId,
      startsAt: payload.startsAt,
      endsAt,
      holderTabId: payload.holderTabId,
      ignoredHoldId: input.ignoredHoldId,
      nowMs: Date.now()
    });

    return { available: true, reason: null };
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONFLICT') {
      return { available: false, reason: error.message };
    }
    throw error;
  }
}

export async function createOrRefreshBookingHold(input: {
  resourceId: string;
  startsAt: string;
  durationMinutes: number;
  holderTabId: string;
  holdId?: string | null;
}): Promise<{ holdId: string; expiresAt: string }> {
  const payload = parseBookingPayloadOrThrow(bookingDraftSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.manage');
  assertPromptCriticalMutationSupportOrThrow({ mutationFamily: 'booking' });

  const endsAt = addMinutes(payload.startsAt, payload.durationMinutes);
  const nowIso = new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const expiresAt = new Date(nowMs + BOOKING_HOLD_TTL_MS).toISOString();
  const holdId =
    input.holdId && input.holdId.startsWith(`hold:${payload.holderTabId}:`)
      ? input.holdId
      : `hold:${payload.holderTabId}:${crypto.randomUUID()}`;

  await db.transaction('rw', db.orderHolds, db.bookings, async () => {
    await assertNoBookingConflict({
      resourceId: payload.resourceId,
      startsAt: payload.startsAt,
      endsAt
    });

    await assertNoActiveHoldConflict({
      resourceId: payload.resourceId,
      startsAt: payload.startsAt,
      endsAt,
      holderTabId: payload.holderTabId,
      ignoredHoldId: input.holdId,
      nowMs
    });

    await db.orderHolds.put({
      id: holdId,
      resourceKey: buildHoldResourceKey(payload.resourceId, payload.startsAt, endsAt),
      status: 'active',
      expiresAt
    });
  });

  logger.info('booking', 'Booking hold created or refreshed.', {
    actorUserId: actor.userId,
    resourceId: payload.resourceId,
    startsAt: payload.startsAt,
    holdId
  });

  return { holdId, expiresAt };
}

export async function releaseBookingHold(holdId: string): Promise<void> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.manage');
  assertPromptCriticalMutationSupportOrThrow({ mutationFamily: 'booking' });

  const hold = await db.orderHolds.get(holdId);
  if (!hold || hold.status === 'released') {
    return;
  }

  await db.orderHolds.update(holdId, { status: 'released' });
}

export async function createBooking(input: {
  resourceId: string;
  startsAt: string;
  durationMinutes: number;
  customerName: string;
  partySize: number;
  notes: string;
  holderTabId: string;
  holdId?: string | null;
  idempotencyKey: string;
}): Promise<BookingView> {
  const payload = parseBookingPayloadOrThrow(createBookingSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.manage');
  assertPromptCriticalMutationSupportOrThrow({ mutationFamily: 'booking' });

  const lockResourceKey = `booking-lock|${payload.resourceId}|${payload.startsAt}|${payload.durationMinutes}`;

  return withBookingLock(lockResourceKey, payload.holderTabId, async () => {
    const nowIso = new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();
    const endsAt = addMinutes(payload.startsAt, payload.durationMinutes);
    const requestHash = hashRequestPayload(payload);

    await db.transaction(
      'rw',
      db.bookings,
      db.orderHolds,
      db.idempotencyKeys,
      db.auditEvents,
      async () => {
        await assertIdempotencyAvailableOrThrow(
          payload.idempotencyKey,
          'booking.create',
          requestHash,
          nowIso
        );

        await assertNoBookingConflict({
          resourceId: payload.resourceId,
          startsAt: payload.startsAt,
          endsAt
        });

        await assertNoActiveHoldConflict({
          resourceId: payload.resourceId,
          startsAt: payload.startsAt,
          endsAt,
          holderTabId: payload.holderTabId,
          ignoredHoldId: payload.holdId,
          nowMs
        });

        const bookingId = crypto.randomUUID();

        await db.bookings.add({
          id: bookingId,
          resourceId: payload.resourceId,
          resourceLabel: resolveResourceLabel(payload.resourceId),
          customerName: payload.customerName,
          partySize: payload.partySize,
          startsAt: payload.startsAt,
          endsAt,
          notes: payload.notes ?? '',
          status: 'confirmed',
          cancellationReason: null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          createdAt: nowIso,
          updatedAt: nowIso
        });

        if (payload.holdId) {
          await db.orderHolds.update(payload.holdId, { status: 'released' });
        }

        await writeIdempotencyRecord(
          payload.idempotencyKey,
          'booking.create',
          requestHash,
          bookingId,
          nowIso
        );

        await appendAuditEvent({
          actorUserId: actor.userId,
          actionType: 'BOOKING_CREATED',
          entityType: 'booking',
          entityId: bookingId,
          previousState: null,
          newState: {
            resourceId: payload.resourceId,
            startsAt: payload.startsAt,
            endsAt,
            customerName: payload.customerName
          }
        });
      }
    );

    const booking = await db.bookings
      .where('[resourceId+startsAt]')
      .equals([payload.resourceId, payload.startsAt])
      .last();

    if (!booking) {
      throw new AppError({
        code: 'RECORD_NOT_FOUND',
        message: 'Booking creation failed unexpectedly.'
      });
    }

    logger.info('booking', 'Created booking.', {
      actorUserId: actor.userId,
      bookingId: booking.id,
      resourceId: booking.resourceId,
      startsAt: booking.startsAt
    });

    return mapBooking(booking);
  });
}

export async function rescheduleBooking(input: {
  bookingId: string;
  resourceId: string;
  startsAt: string;
  durationMinutes: number;
  holderTabId: string;
  holdId?: string | null;
  idempotencyKey: string;
}): Promise<BookingView> {
  const payload = parseBookingPayloadOrThrow(rescheduleBookingSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.manage');
  assertPromptCriticalMutationSupportOrThrow({ mutationFamily: 'booking' });

  const lockResourceKey = `booking-reschedule-lock|${payload.bookingId}|${payload.resourceId}|${payload.startsAt}`;

  return withBookingLock(lockResourceKey, payload.holderTabId, async () => {
    const nowIso = new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();
    const endsAt = addMinutes(payload.startsAt, payload.durationMinutes);
    const requestHash = hashRequestPayload(payload);

    await db.transaction(
      'rw',
      db.bookings,
      db.orderHolds,
      db.idempotencyKeys,
      db.auditEvents,
      async () => {
        await assertIdempotencyAvailableOrThrow(
          payload.idempotencyKey,
          'booking.reschedule',
          requestHash,
          nowIso
        );

        const booking = await db.bookings.get(payload.bookingId);
        if (!booking) {
          throw new AppError({
            code: 'RECORD_NOT_FOUND',
            message: 'Booking not found for reschedule.'
          });
        }

        if (booking.status !== 'confirmed') {
          throw new AppError({
            code: 'CONFLICT',
            message: 'Only confirmed bookings can be rescheduled.'
          });
        }

        await assertNoBookingConflict({
          resourceId: payload.resourceId,
          startsAt: payload.startsAt,
          endsAt,
          ignoredBookingId: booking.id
        });

        await assertNoActiveHoldConflict({
          resourceId: payload.resourceId,
          startsAt: payload.startsAt,
          endsAt,
          holderTabId: payload.holderTabId,
          ignoredHoldId: payload.holdId,
          nowMs
        });

        const previousState = {
          resourceId: booking.resourceId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt
        };

        await db.bookings.update(booking.id, {
          resourceId: payload.resourceId,
          resourceLabel: resolveResourceLabel(payload.resourceId),
          startsAt: payload.startsAt,
          endsAt,
          updatedBy: actor.userId,
          updatedAt: nowIso
        });

        if (payload.holdId) {
          await db.orderHolds.update(payload.holdId, { status: 'released' });
        }

        await writeIdempotencyRecord(
          payload.idempotencyKey,
          'booking.reschedule',
          requestHash,
          booking.id,
          nowIso
        );

        await appendAuditEvent({
          actorUserId: actor.userId,
          actionType: 'BOOKING_RESCHEDULED',
          entityType: 'booking',
          entityId: booking.id,
          previousState,
          newState: {
            resourceId: payload.resourceId,
            startsAt: payload.startsAt,
            endsAt
          }
        });
      }
    );

    const updated = await db.bookings.get(payload.bookingId);
    if (!updated) {
      throw new AppError({
        code: 'RECORD_NOT_FOUND',
        message: 'Booking not found after reschedule mutation.'
      });
    }

    logger.info('booking', 'Rescheduled booking.', {
      actorUserId: actor.userId,
      bookingId: updated.id,
      resourceId: updated.resourceId,
      startsAt: updated.startsAt
    });

    return mapBooking(updated);
  });
}

export async function cancelBooking(input: {
  bookingId: string;
  reason?: string;
  idempotencyKey: string;
}): Promise<BookingView> {
  const payload = parseBookingPayloadOrThrow(cancelBookingSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.booking.manage');
  assertPromptCriticalMutationSupportOrThrow({ mutationFamily: 'booking' });

  const holderTabId = `${actor.userId}-cancel`;
  const lockResourceKey = `booking-cancel-lock|${payload.bookingId}`;

  return withBookingLock(lockResourceKey, holderTabId, async () => {
    const nowIso = new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();
    const requestHash = hashRequestPayload(payload);

    await db.transaction('rw', db.bookings, db.idempotencyKeys, db.auditEvents, async () => {
      await assertIdempotencyAvailableOrThrow(
        payload.idempotencyKey,
        'booking.cancel',
        requestHash,
        nowIso
      );

      const booking = await db.bookings.get(payload.bookingId);
      if (!booking) {
        throw new AppError({
          code: 'RECORD_NOT_FOUND',
          message: 'Booking not found for cancellation.'
        });
      }

      if (booking.status !== 'confirmed') {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Only confirmed bookings can be cancelled.'
        });
      }

      const startsAtMs = new Date(booking.startsAt).getTime();
      const isLateCancel = startsAtMs - nowMs < FREE_CANCELLATION_WINDOW_MS;
      const nextStatus: BookingStatus = isLateCancel ? 'late_cancelled' : 'cancelled';
      const cancellationReason = payload.reason?.trim() || null;

      await db.bookings.update(booking.id, {
        status: nextStatus,
        cancellationReason,
        updatedBy: actor.userId,
        updatedAt: nowIso
      });

      await writeIdempotencyRecord(
        payload.idempotencyKey,
        'booking.cancel',
        requestHash,
        `${booking.id}:${nextStatus}`,
        nowIso
      );

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'BOOKING_CANCELLED',
        entityType: 'booking',
        entityId: booking.id,
        previousState: { status: booking.status },
        newState: { status: nextStatus, cancellationReason }
      });
    });

    const updated = await db.bookings.get(payload.bookingId);
    if (!updated) {
      throw new AppError({
        code: 'RECORD_NOT_FOUND',
        message: 'Booking not found after cancellation.'
      });
    }

    logger.info('booking', 'Cancelled booking.', {
      actorUserId: actor.userId,
      bookingId: updated.id,
      status: updated.status
    });

    return mapBooking(updated);
  });
}

export function canManageBookingActions(roles: RoleName[]): boolean {
  try {
    assertCapability(roles, 'workspace.booking.manage');
    return true;
  } catch {
    return false;
  }
}

export function getBookingResources() {
  return [...BOOKING_RESOURCES];
}

export function getBookingDurationOptions() {
  return [...BOOKING_DURATION_OPTIONS];
}

export function todayBookingDateKey(): string {
  return toLocalDateKey(new Date());
}
