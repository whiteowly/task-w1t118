import { writable } from 'svelte/store';

export interface AppBootstrapState {
  initialized: boolean;
  bootstrapRequired: boolean;
  startupError: string | null;
}

const initialState: AppBootstrapState = {
  initialized: false,
  bootstrapRequired: false,
  startupError: null
};

export const appBootstrapStore = writable<AppBootstrapState>(initialState);
