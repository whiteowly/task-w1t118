<script lang="ts">
  import { link } from 'svelte-spa-router';

  import { lockSession, logout } from '../../core/auth/auth-service';
  import { hasCapability } from '../../core/permissions/service';
  import { sessionStore } from '../../shared/stores/session-store';

  const navItems = [
    {
      href: '/merchant',
      label: 'Merchant Console',
      capability: 'workspace.merchant.view' as const
    },
    { href: '/booking', label: 'Booking Desk', capability: 'workspace.booking.view' as const },
    { href: '/recruiting', label: 'Recruiting', capability: 'workspace.recruiting.view' as const },
    { href: '/org-admin', label: 'Org Admin', capability: 'workspace.orgAdmin.view' as const }
  ];

  $: user = $sessionStore.user;
  $: roleLabel = user?.roles.join(', ') ?? '';
  $: visibleNavItems =
    user === null ? [] : navItems.filter((item) => hasCapability(user.roles, item.capability));
</script>

<header class="app-header">
  <div class="title-block">
    <h1>LocalOps Workspace</h1>
    {#if user}
      <p>Signed in as <strong>{user.username}</strong> ({roleLabel})</p>
    {/if}
  </div>

  {#if user}
    <nav aria-label="Workspace">
      {#each visibleNavItems as item}
        <a href={item.href} use:link>{item.label}</a>
      {/each}
    </nav>

    <div class="session-controls">
      <button type="button" on:click={() => lockSession('Manual lock requested.')}>Lock now</button>
      <button type="button" on:click={logout}>Logout</button>
    </div>
  {/if}
</header>

<style>
  .app-header {
    background: #0f172a;
    color: #e5e7eb;
    padding: 0.9rem 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .title-block h1 {
    margin: 0;
    font-size: 1.2rem;
  }

  .title-block p {
    margin: 0.35rem 0 0;
    color: #cbd5e1;
    font-size: 0.95rem;
  }

  nav {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  a {
    color: #c7d2fe;
    text-decoration: none;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    padding: 0.35rem 0.6rem;
    background: #111827;
  }

  .session-controls {
    display: flex;
    gap: 0.5rem;
  }

  button {
    font: inherit;
    border: 1px solid #475569;
    background: #1e293b;
    color: #f8fafc;
    border-radius: 0.45rem;
    padding: 0.35rem 0.6rem;
  }
</style>
