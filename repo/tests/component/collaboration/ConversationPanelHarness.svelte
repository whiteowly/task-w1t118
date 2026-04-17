<script lang="ts">
  import { sessionStore } from '../../../src/shared/stores/session-store';
  import ConversationPanel from '../../../src/modules/collaboration/ConversationPanel.svelte';

  export let roles: string[] = ['Administrator'];
  export let contextPath = '/merchant';

  sessionStore.set({
    status: 'authenticated',
    user: { id: 'test-user-id', username: 'test.admin', roles: roles as any }
  });
</script>

<ConversationPanel {contextPath} />
