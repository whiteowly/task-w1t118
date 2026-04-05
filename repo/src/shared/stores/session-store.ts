import { writable } from 'svelte/store';

import type { SessionState } from '../types/auth';

const initialSessionState: SessionState = {
  status: 'logged_out',
  user: null
};

export const sessionStore = writable<SessionState>(initialSessionState);
