import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { sessionStore } from '../../../src/shared/stores/session-store';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset();
  sessionStore.set({ status: 'logged_out', user: null });
  localStorage.clear();
});

afterEach(() => {
  sessionStore.set({ status: 'logged_out', user: null });
  localStorage.clear();
});

describe('auth-api frontend integration', () => {
  it('loginViaApi calls POST /api/v1/auth/login and updates session store', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'test-token-abc',
        user: { id: 'u1', username: 'admin', roles: ['Administrator'] }
      })
    });

    const { loginViaApi } = await import('../../../src/shared/api/auth-api');
    await loginViaApi({ username: 'admin', password: 'password-123' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ username: 'admin', password: 'password-123' });

    const session = get(sessionStore);
    expect(session.status).toBe('authenticated');
    expect(session.user?.username).toBe('admin');
    expect(session.user?.roles).toEqual(['Administrator']);
    expect(localStorage.getItem('localops_token')).toBe('test-token-abc');
  });

  it('bootstrapAdministratorViaApi calls POST /api/v1/auth/bootstrap-admin', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Administrator created.' })
    });

    const { bootstrapAdministratorViaApi } = await import('../../../src/shared/api/auth-api');
    await bootstrapAdministratorViaApi({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/bootstrap-admin');
    expect(opts.method).toBe('POST');
  });

  it('logoutViaApi calls POST /api/v1/auth/logout and clears session', async () => {
    sessionStore.set({
      status: 'authenticated',
      user: { id: 'u1', username: 'admin', roles: ['Administrator'] }
    });
    localStorage.setItem('localops_token', 'old-token');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Logged out.' })
    });

    const { logoutViaApi } = await import('../../../src/shared/api/auth-api');
    await logoutViaApi();

    const session = get(sessionStore);
    expect(session.status).toBe('logged_out');
    expect(session.user).toBeNull();
    expect(localStorage.getItem('localops_token')).toBeNull();
  });

  it('loginViaApi throws on API error response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { code: 'PERMISSION_DENIED', message: 'Invalid username or password.' }
      })
    });

    const { loginViaApi } = await import('../../../src/shared/api/auth-api');
    await expect(loginViaApi({ username: 'bad', password: 'bad' })).rejects.toThrow(
      'Invalid username or password.'
    );
  });
});
