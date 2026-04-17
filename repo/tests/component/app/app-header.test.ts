import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AppHeaderHarness from './AppHeaderHarness.svelte';

describe('AppHeader', () => {
  it('shows username when logged in', () => {
    const { getByText } = render(AppHeaderHarness, {
      props: { username: 'admin', roles: ['Administrator'], loggedIn: true }
    });
    expect(getByText('admin')).toBeTruthy();
  });

  it('shows Merchant Console nav for Administrator', () => {
    const { getByText } = render(AppHeaderHarness, {
      props: { username: 'admin', roles: ['Administrator'], loggedIn: true }
    });
    expect(getByText('Merchant Console')).toBeTruthy();
    expect(getByText('Booking Desk')).toBeTruthy();
    expect(getByText('Org Admin')).toBeTruthy();
  });

  it('shows only Booking Desk nav for BookingAgent', () => {
    const { getByText, queryByText } = render(AppHeaderHarness, {
      props: { username: 'booking.agent', roles: ['BookingAgent'], loggedIn: true }
    });
    expect(getByText('Booking Desk')).toBeTruthy();
    expect(queryByText('Merchant Console')).toBeNull();
    expect(queryByText('Org Admin')).toBeNull();
  });

  it('hides nav and session controls when logged out', () => {
    const { queryByText } = render(AppHeaderHarness, {
      props: { username: '', roles: [], loggedIn: false }
    });
    expect(queryByText('Logout')).toBeNull();
    expect(queryByText('Lock now')).toBeNull();
    expect(queryByText('Merchant Console')).toBeNull();
  });

  it('shows Lock now and Logout buttons when logged in', () => {
    const { getByText } = render(AppHeaderHarness, {
      props: { username: 'admin', roles: ['Administrator'], loggedIn: true }
    });
    expect(getByText('Lock now')).toBeTruthy();
    expect(getByText('Logout')).toBeTruthy();
  });
});
