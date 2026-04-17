<script lang="ts">
  import { sessionStore } from '../../../src/shared/stores/session-store';
  import AppHeader from '../../../src/app/components/AppHeader.svelte';

  export let username = '';
  export let roles: string[] = [];
  export let loggedIn = true;

  if (loggedIn && username) {
    sessionStore.set({
      status: 'authenticated',
      user: { id: 'test-id', username, roles: roles as any }
    });
  } else {
    sessionStore.set({ status: 'logged_out', user: null });
  }
</script>

<AppHeader />
