<script lang="ts">
  import { sessionStore } from '../../../src/shared/stores/session-store';
  import BookingWorkspacePage from '../../../src/modules/booking/BookingWorkspacePage.svelte';

  export let roles: string[] = ['BookingAgent'];

  sessionStore.set({
    status: 'authenticated',
    user: { id: 'test-user-id', username: 'test.agent', roles: roles as any }
  });
</script>

<BookingWorkspacePage />
