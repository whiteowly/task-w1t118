import { z } from 'zod';

import { AppError } from '../../core/validation/errors';
import { BOOKING_DURATION_OPTIONS } from './booking-config';

const isoDateTimeSchema = z.string().datetime({ offset: true });
const durationSchema = z
  .number()
  .int()
  .refine(
    (value) =>
      BOOKING_DURATION_OPTIONS.includes(value as (typeof BOOKING_DURATION_OPTIONS)[number]),
    {
      message: `Duration must be one of: ${BOOKING_DURATION_OPTIONS.join(', ')}`
    }
  );

export const bookingDraftSchema = z.object({
  resourceId: z.string().min(1),
  startsAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  holderTabId: z.string().min(1)
});

export const createBookingSchema = z.object({
  resourceId: z.string().min(1),
  startsAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  customerName: z.string().trim().min(1).max(120),
  partySize: z.number().int().min(1).max(20),
  notes: z.string().trim().max(300).default(''),
  holderTabId: z.string().min(1),
  holdId: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(120)
});

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().min(1),
  resourceId: z.string().min(1),
  startsAt: isoDateTimeSchema,
  durationMinutes: durationSchema,
  holderTabId: z.string().min(1),
  holdId: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(120)
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(120)
});

export const scheduleDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() ?? 'form';
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

export function parseBookingPayloadOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      fieldErrors: zodFieldErrors(parsed.error)
    });
  }

  return parsed.data;
}
