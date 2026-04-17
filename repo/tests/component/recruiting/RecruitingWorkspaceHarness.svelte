<script lang="ts">
  import { sessionStore } from '../../../src/shared/stores/session-store';
  import RecruitingWorkspacePage from '../../../src/modules/recruiting/RecruitingWorkspacePage.svelte';

  export let roles: string[] = ['Recruiter'];

  sessionStore.set({
    status: 'authenticated',
    user: { id: 'test-user-id', username: 'test.recruiter', roles: roles as any }
  });
</script>

<RecruitingWorkspacePage />
