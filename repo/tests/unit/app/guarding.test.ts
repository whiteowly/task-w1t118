import { describe, expect, it } from 'vitest';

import { resolveRouteRedirect } from '../../../src/app/guarding';

describe('resolveRouteRedirect', () => {
  it('forces bootstrap route when no users exist', () => {
    const redirect = resolveRouteRedirect({
      path: '/login',
      bootstrapRequired: true,
      sessionStatus: 'logged_out',
      roles: []
    });

    expect(redirect).toBe('/bootstrap-admin');
  });

  it('sends logged out users to login for protected routes', () => {
    const redirect = resolveRouteRedirect({
      path: '/merchant',
      bootstrapRequired: false,
      sessionStatus: 'logged_out',
      roles: []
    });

    expect(redirect).toBe('/login');
  });

  it('redirects logged out root access to login', () => {
    const redirect = resolveRouteRedirect({
      path: '/',
      bootstrapRequired: false,
      sessionStatus: 'logged_out',
      roles: []
    });

    expect(redirect).toBe('/login');
  });

  it('redirects unauthorized authenticated users to denied route', () => {
    const redirect = resolveRouteRedirect({
      path: '/booking',
      bootstrapRequired: false,
      sessionStatus: 'authenticated',
      roles: ['MerchantEditor']
    });

    expect(redirect).toBe('/denied');
  });

  it('allows unknown route to flow to not-found surface', () => {
    const redirect = resolveRouteRedirect({
      path: '/something-unknown',
      bootstrapRequired: false,
      sessionStatus: 'logged_out',
      roles: []
    });

    expect(redirect).toBeNull();
  });

  it('redirects authenticated root to role default workspace', () => {
    const redirect = resolveRouteRedirect({
      path: '/',
      bootstrapRequired: false,
      sessionStatus: 'authenticated',
      roles: ['BookingAgent']
    });

    expect(redirect).toBe('/booking');
  });
});
