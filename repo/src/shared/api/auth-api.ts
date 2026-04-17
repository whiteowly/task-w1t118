import { api, setAuthToken } from './client';
import { sessionStore } from '../stores/session-store';
import type { RoleName } from '../types/auth';

export async function bootstrapAdministratorViaApi(input: {
  username: string;
  password: string;
  confirmPassword: string;
}): Promise<void> {
  await api.bootstrapAdmin(input);
}

export async function loginViaApi(input: { username: string; password: string }): Promise<void> {
  const result = await api.login(input);
  sessionStore.set({
    status: 'authenticated',
    user: {
      id: result.user.id,
      username: result.user.username,
      roles: result.user.roles as RoleName[]
    }
  });
}

export async function logoutViaApi(): Promise<void> {
  try {
    await api.logout();
  } catch {
    // Logout should not fail visibly
  }
  setAuthToken(null);
  sessionStore.set({ status: 'logged_out', user: null });
}
