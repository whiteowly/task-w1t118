import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SessionLockModalHarness from './SessionLockModalHarness.svelte';

describe('SessionLockModal', () => {
  it('renders heading when open', () => {
    const { getByRole } = render(SessionLockModalHarness, { props: { open: true } });
    expect(getByRole('heading', { name: 'Session locked' })).toBeTruthy();
  });

  it('does not render when closed', () => {
    const { queryByRole } = render(SessionLockModalHarness, { props: { open: false } });
    expect(queryByRole('heading', { name: 'Session locked' })).toBeNull();
  });

  it('renders password input and unlock button when open', () => {
    const { getByLabelText, getByRole } = render(SessionLockModalHarness, { props: { open: true } });
    expect(getByLabelText('Password')).toBeTruthy();
    expect(getByRole('button', { name: 'Unlock session' })).toBeTruthy();
  });

  it('shows unlock button with correct default text', () => {
    const { getByRole } = render(SessionLockModalHarness, { props: { open: true } });
    const button = getByRole('button', { name: 'Unlock session' });
    expect(button.textContent).toContain('Unlock session');
  });
});
