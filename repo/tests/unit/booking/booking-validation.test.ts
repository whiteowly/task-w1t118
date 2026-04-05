import { describe, expect, it } from 'vitest';

import {
  createBookingSchema,
  parseBookingPayloadOrThrow
} from '../../../src/modules/booking/booking-validation';

describe('booking validation', () => {
  it('accepts valid booking payload', () => {
    const parsed = parseBookingPayloadOrThrow(createBookingSchema, {
      resourceId: 'patio-a',
      startsAt: '2026-04-07T10:00:00.000Z',
      durationMinutes: 60,
      customerName: 'Alice',
      partySize: 4,
      notes: 'Window side',
      holderTabId: 'tab-a',
      idempotencyKey: 'create:tab-a:one'
    });

    expect(parsed.customerName).toBe('Alice');
    expect(parsed.durationMinutes).toBe(60);
  });

  it('rejects unsupported booking duration', () => {
    expect(() =>
      parseBookingPayloadOrThrow(createBookingSchema, {
        resourceId: 'patio-a',
        startsAt: '2026-04-07T10:00:00.000Z',
        durationMinutes: 45,
        customerName: 'Alice',
        partySize: 4,
        notes: '',
        holderTabId: 'tab-a',
        idempotencyKey: 'create:tab-a:two'
      })
    ).toThrow('Validation failed.');
  });

  it('rejects invalid iso datetime payload', () => {
    expect(() =>
      parseBookingPayloadOrThrow(createBookingSchema, {
        resourceId: 'patio-a',
        startsAt: 'not-a-date',
        durationMinutes: 60,
        customerName: 'Alice',
        partySize: 4,
        notes: '',
        holderTabId: 'tab-a',
        idempotencyKey: 'create:tab-a:three'
      })
    ).toThrow('Validation failed.');
  });
});
