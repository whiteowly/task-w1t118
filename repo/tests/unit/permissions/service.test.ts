import { describe, expect, it } from 'vitest';

import { defaultRouteForRoles, hasCapability } from '../../../src/core/permissions/service';

describe('permission service', () => {
  it('grants booking manage capability to BookingAgent', () => {
    expect(hasCapability(['BookingAgent'], 'workspace.booking.manage')).toBe(true);
  });

  it('denies publish capability to MerchantEditor', () => {
    expect(hasCapability(['MerchantEditor'], 'workspace.merchant.reviewPublish')).toBe(false);
  });

  it('chooses a role-aware default route', () => {
    expect(defaultRouteForRoles(['Recruiter'])).toBe('/recruiting');
  });
});
