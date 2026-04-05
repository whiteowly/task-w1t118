export const BOOKING_RESOURCES = [
  { id: 'patio-a', label: 'Patio A', capacity: 4 },
  { id: 'patio-b', label: 'Patio B', capacity: 4 },
  { id: 'dining-room', label: 'Dining Room', capacity: 6 }
] as const;

export const BOOKING_SLOT_INTERVAL_MINUTES = 30;
export const BOOKING_OPEN_HOUR = 9;
export const BOOKING_CLOSE_HOUR = 22;

export const BOOKING_LOCK_TTL_MS = 5 * 60 * 1000;
export const BOOKING_HOLD_TTL_MS = 10 * 60 * 1000;
export const BOOKING_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export const FREE_CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000;

export const BOOKING_DURATION_OPTIONS = [30, 60, 90, 120] as const;
