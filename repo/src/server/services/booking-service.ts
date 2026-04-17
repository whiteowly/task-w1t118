import crypto from 'node:crypto';
import { getDb } from '../db/connection.js';

const BOOKING_RESOURCES = [
  { id: 'patio-a', label: 'Patio A', capacity: 4 },
  { id: 'patio-b', label: 'Patio B', capacity: 4 },
  { id: 'dining-room', label: 'Dining Room', capacity: 6 }
];

const BOOKING_OPEN_HOUR = 9;
const BOOKING_CLOSE_HOUR = 22;
const BOOKING_SLOT_INTERVAL_MINUTES = 30;
const FREE_CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

interface ActorContext { userId: string; roles: string[] }

interface BookingRow {
  id: string;
  resource_id: string;
  resource_label: string;
  customer_name: string;
  party_size: number;
  starts_at: string;
  ends_at: string;
  notes: string;
  status: string;
  cancellation_reason: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

function appendAudit(actorUserId: string, actionType: string, entityType: string, entityId: string, previousState: unknown, newState: unknown): void {
  const db = getDb();
  db.prepare(`INSERT INTO audit_events (id, actor_user_id, action_type, entity_type, entity_id, previous_state, new_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), actorUserId, actionType, entityType, entityId,
    previousState ? JSON.stringify(previousState) : null,
    newState ? JSON.stringify(newState) : null,
    new Date().toISOString()
  );
}

function mapBooking(row: BookingRow) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    customerName: row.customer_name,
    partySize: row.party_size,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    notes: row.notes,
    status: row.status,
    cancellationReason: row.cancellation_reason,
    updatedAt: row.updated_at
  };
}

function addMinutes(isoDate: string, minutes: number): string {
  return new Date(new Date(isoDate).getTime() + minutes * 60_000).toISOString();
}

function toLocalDateKey(value: Date): string {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, '0');
  const d = `${value.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayBounds(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function intervalOverlaps(ls: number, le: number, rs: number, re: number): boolean {
  return ls < re && rs < le;
}

function resolveResourceLabel(resourceId: string): string {
  return BOOKING_RESOURCES.find((r) => r.id === resourceId)?.label ?? resourceId;
}

function assertNoBookingConflict(resourceId: string, startsAt: string, endsAt: string, ignoredBookingId?: string): void {
  const db = getDb();
  const bookings = db.prepare('SELECT * FROM bookings WHERE resource_id = ? AND status = ?').all(resourceId, 'confirmed') as BookingRow[];
  const ts = new Date(startsAt).getTime();
  const te = new Date(endsAt).getTime();

  for (const b of bookings) {
    if (b.id === ignoredBookingId) continue;
    if (intervalOverlaps(ts, te, new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime())) {
      throw Object.assign(new Error(`Resource ${resolveResourceLabel(resourceId)} is already booked.`), { code: 'CONFLICT' });
    }
  }
}

function assertIdempotency(key: string, operationType: string, requestHash: string, nowIso: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(key) as { expires_at: string; operation_type: string; request_hash: string } | undefined;

  if (!existing) return;

  if (new Date(existing.expires_at).getTime() <= new Date(nowIso).getTime()) {
    db.prepare('DELETE FROM idempotency_keys WHERE key = ?').run(key);
    return;
  }

  if (existing.operation_type === operationType && existing.request_hash === requestHash) {
    throw Object.assign(new Error('Duplicate submission blocked by idempotency key.'), { code: 'DUPLICATE_REQUEST' });
  }

  throw Object.assign(new Error('Idempotency key reuse detected with different payload.'), { code: 'CONFLICT' });
}

function writeIdempotency(key: string, operationType: string, requestHash: string, responseHash: string, nowIso: string): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO idempotency_keys (key, operation_type, request_hash, response_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    key, operationType, requestHash, responseHash, nowIso,
    new Date(new Date(nowIso).getTime() + IDEMPOTENCY_TTL_MS).toISOString()
  );
}

export function listBookingAvailability(_actor: ActorContext, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error('Invalid date format.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const { startsAt: dayStart, endsAt: dayEnd } = dayBounds(date);
  const bookings = db.prepare('SELECT * FROM bookings WHERE status = ?').all('confirmed') as BookingRow[];
  const holds = db.prepare("SELECT * FROM booking_holds WHERE status = 'active'").all() as { resource_key: string; expires_at: string }[];
  const nowMs = Date.now();
  const activeHolds = holds.filter((h) => new Date(h.expires_at).getTime() > nowMs);

  const rows: unknown[] = [];
  const cursor = new Date(dayStart);
  cursor.setHours(BOOKING_OPEN_HOUR, 0, 0, 0);
  const closeMs = new Date(dayStart).setHours(BOOKING_CLOSE_HOUR, 0, 0, 0);

  while (cursor.getTime() < closeMs) {
    const slotStartMs = cursor.getTime();
    const slotEndMs = slotStartMs + BOOKING_SLOT_INTERVAL_MINUTES * 60_000;
    const slotStart = new Date(slotStartMs).toISOString();
    const slotEnd = new Date(slotEndMs).toISOString();

    const cells = BOOKING_RESOURCES.map((resource) => {
      const hasBooking = bookings.some((b) =>
        b.resource_id === resource.id &&
        intervalOverlaps(slotStartMs, slotEndMs, new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime())
      );
      if (hasBooking) return { resourceId: resource.id, resourceLabel: resource.label, state: 'booked', conflictMessage: 'Confirmed booking exists' };

      const hasHold = activeHolds.some((h) => {
        const parts = h.resource_key.split('|');
        if (parts[0] !== 'booking-hold' || parts[1] !== resource.id) return false;
        return intervalOverlaps(slotStartMs, slotEndMs, new Date(parts[2]).getTime(), new Date(parts[3]).getTime());
      });
      if (hasHold) return { resourceId: resource.id, resourceLabel: resource.label, state: 'held', conflictMessage: 'Held by another active draft' };

      return { resourceId: resource.id, resourceLabel: resource.label, state: 'available', conflictMessage: null };
    });

    rows.push({ slotStartsAt: slotStart, slotEndsAt: slotEnd, slotLabel: `${new Date(slotStartMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(slotEndMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, cells });
    cursor.setMinutes(cursor.getMinutes() + BOOKING_SLOT_INTERVAL_MINUTES);
  }

  return { date, rows };
}

export function listBookings(_actor: ActorContext, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error('Invalid date format.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const { startsAt, endsAt } = dayBounds(date);
  const bookings = db.prepare('SELECT * FROM bookings WHERE starts_at >= ? AND starts_at < ? ORDER BY starts_at ASC').all(startsAt, endsAt) as BookingRow[];
  return bookings.map(mapBooking);
}

export function createBooking(actor: ActorContext, input: {
  resourceId: string; startsAt: string; durationMinutes: number;
  customerName: string; partySize: number; notes: string; idempotencyKey: string;
}) {
  if (!input.resourceId || !input.startsAt || !input.customerName || !input.idempotencyKey) {
    throw Object.assign(new Error('Missing required booking fields.'), { code: 'VALIDATION_ERROR' });
  }
  if (!input.durationMinutes || input.durationMinutes < 1) {
    throw Object.assign(new Error('Duration must be positive.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const endsAt = addMinutes(input.startsAt, input.durationMinutes);
  const nowIso = new Date().toISOString();
  const requestHash = JSON.stringify(input);
  const bookingId = crypto.randomUUID();

  const txn = db.transaction(() => {
    assertIdempotency(input.idempotencyKey, 'booking.create', requestHash, nowIso);
    assertNoBookingConflict(input.resourceId, input.startsAt, endsAt);

    db.prepare(`INSERT INTO bookings (id, resource_id, resource_label, customer_name, party_size, starts_at, ends_at, notes, status, cancellation_reason, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', NULL, ?, ?, ?, ?)`).run(
      bookingId, input.resourceId, resolveResourceLabel(input.resourceId),
      input.customerName.trim(), input.partySize ?? 1, input.startsAt, endsAt,
      input.notes ?? '', actor.userId, actor.userId, nowIso, nowIso
    );

    writeIdempotency(input.idempotencyKey, 'booking.create', requestHash, bookingId, nowIso);
    appendAudit(actor.userId, 'BOOKING_CREATED', 'booking', bookingId, null,
      { resourceId: input.resourceId, startsAt: input.startsAt, endsAt, customerName: input.customerName }
    );
  });
  txn();

  const created = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as BookingRow;
  return mapBooking(created);
}

export function rescheduleBooking(actor: ActorContext, bookingId: string, input: {
  resourceId: string; startsAt: string; durationMinutes: number; idempotencyKey: string;
}) {
  if (!input.resourceId || !input.startsAt || !input.idempotencyKey) {
    throw Object.assign(new Error('Missing required reschedule fields.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as BookingRow | undefined;
  if (!booking) throw Object.assign(new Error('Booking not found.'), { code: 'RECORD_NOT_FOUND' });
  if (booking.status !== 'confirmed') throw Object.assign(new Error('Only confirmed bookings can be rescheduled.'), { code: 'CONFLICT' });

  const endsAt = addMinutes(input.startsAt, input.durationMinutes);
  const nowIso = new Date().toISOString();
  const requestHash = JSON.stringify({ bookingId, ...input });

  const txn = db.transaction(() => {
    assertIdempotency(input.idempotencyKey, 'booking.reschedule', requestHash, nowIso);
    assertNoBookingConflict(input.resourceId, input.startsAt, endsAt, bookingId);

    db.prepare(`UPDATE bookings SET resource_id = ?, resource_label = ?, starts_at = ?, ends_at = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      input.resourceId, resolveResourceLabel(input.resourceId), input.startsAt, endsAt, actor.userId, nowIso, bookingId
    );

    writeIdempotency(input.idempotencyKey, 'booking.reschedule', requestHash, bookingId, nowIso);
    appendAudit(actor.userId, 'BOOKING_RESCHEDULED', 'booking', bookingId,
      { resourceId: booking.resource_id, startsAt: booking.starts_at },
      { resourceId: input.resourceId, startsAt: input.startsAt, endsAt }
    );
  });
  txn();

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as BookingRow;
  return mapBooking(updated);
}

export function cancelBooking(actor: ActorContext, bookingId: string, input: { reason?: string; idempotencyKey: string }) {
  if (!input.idempotencyKey) {
    throw Object.assign(new Error('Idempotency key is required.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as BookingRow | undefined;
  if (!booking) throw Object.assign(new Error('Booking not found.'), { code: 'RECORD_NOT_FOUND' });
  if (booking.status !== 'confirmed') throw Object.assign(new Error('Only confirmed bookings can be cancelled.'), { code: 'CONFLICT' });

  const nowIso = new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const requestHash = JSON.stringify({ bookingId, ...input });

  const startsAtMs = new Date(booking.starts_at).getTime();
  const isLateCancel = startsAtMs - nowMs < FREE_CANCELLATION_WINDOW_MS;
  const nextStatus = isLateCancel ? 'late_cancelled' : 'cancelled';
  const cancellationReason = input.reason?.trim() || null;

  const txn = db.transaction(() => {
    assertIdempotency(input.idempotencyKey, 'booking.cancel', requestHash, nowIso);

    db.prepare(`UPDATE bookings SET status = ?, cancellation_reason = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      nextStatus, cancellationReason, actor.userId, nowIso, bookingId
    );

    writeIdempotency(input.idempotencyKey, 'booking.cancel', requestHash, `${bookingId}:${nextStatus}`, nowIso);
    appendAudit(actor.userId, 'BOOKING_CANCELLED', 'booking', bookingId,
      { status: booking.status },
      { status: nextStatus, cancellationReason }
    );
  });
  txn();

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as BookingRow;
  return mapBooking(updated);
}

export function todayDateKey(): string {
  return toLocalDateKey(new Date());
}
