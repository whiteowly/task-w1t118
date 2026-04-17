import { describe, expect, it } from 'vitest';
import { canManageBookingActions, getBookingResources, getBookingDurationOptions } from '../../../src/modules/booking/booking-service';

describe('booking service helpers', () => {
  it('canManageBookingActions grants BookingAgent', () => {
    expect(canManageBookingActions(['BookingAgent'])).toBe(true);
  });

  it('canManageBookingActions grants Administrator', () => {
    expect(canManageBookingActions(['Administrator'])).toBe(true);
  });

  it('canManageBookingActions denies MerchantEditor', () => {
    expect(canManageBookingActions(['MerchantEditor'])).toBe(false);
  });

  it('getBookingResources returns a non-empty list', () => {
    const resources = getBookingResources();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0]).toHaveProperty('id');
    expect(resources[0]).toHaveProperty('label');
  });

  it('getBookingDurationOptions returns a non-empty list', () => {
    const options = getBookingDurationOptions();
    expect(options.length).toBeGreaterThan(0);
  });
});
