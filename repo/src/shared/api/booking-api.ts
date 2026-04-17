import { api } from './client';

export async function listBookingAvailabilityViaApi(date?: string) {
  return api.listBookingAvailability(date);
}

export async function listBookingsViaApi(date?: string) {
  return api.listBookings(date);
}

export async function createBookingViaApi(input: {
  resourceId: string;
  startsAt: string;
  durationMinutes: number;
  customerName: string;
  partySize: number;
  notes: string;
  idempotencyKey: string;
}) {
  return api.createBooking(input);
}

export async function rescheduleBookingViaApi(
  bookingId: string,
  input: {
    resourceId: string;
    startsAt: string;
    durationMinutes: number;
    idempotencyKey: string;
  }
) {
  return api.rescheduleBooking(bookingId, input);
}

export async function cancelBookingViaApi(
  bookingId: string,
  input: { reason?: string; idempotencyKey: string }
) {
  return api.cancelBooking(bookingId, input);
}
