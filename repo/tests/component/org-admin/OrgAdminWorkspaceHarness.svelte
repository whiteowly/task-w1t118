<script lang="ts">
  import { sessionStore } from '../../../src/shared/stores/session-store';
  import OrgAdminWorkspacePage from '../../../src/modules/org-admin/OrgAdminWorkspacePage.svelte';

  export let roles: string[] = ['Administrator'];

  sessionStore.set({
    status: 'authenticated',
    user: { id: 'test-user-id', username: 'test.admin', roles: roles as any }
  });
</script>

<OrgAdminWorkspacePage />
