<script lang="ts">
  import Router, { location, push } from 'svelte-spa-router';
  import { onMount } from 'svelte';

  import { initializeApp, registerServiceWorker } from './bootstrap';
  import { resolveRouteRedirect } from './guarding';
  import { routes } from './routes';
  import { getBrowserCapabilityReport } from '../core/concurrency/browser-support';
  import AppHeader from './components/AppHeader.svelte';
  import SessionLockModal from './components/SessionLockModal.svelte';
  import ConversationPanel from '../modules/collaboration/ConversationPanel.svelte';
  import { appBootstrapStore } from '../shared/stores/app-store';
  import { sessionStore } from '../shared/stores/session-store';

  const capabilityReport = getBrowserCapabilityReport();
  const browserSupportWarnings = [...capabilityReport.warnings];
  const browserSupportBlockers = [...capabilityReport.blockingReasons];

  function normalizePath(path: string): string {
    const [pathname] = path.split('?');
    return pathname || '/';
  }

  $: currentPath = normalizePath($location);
  $: redirectTarget = $appBootstrapStore.initialized
    ? resolveRouteRedirect({
        path: currentPath,
        bootstrapRequired: $appBootstrapStore.bootstrapRequired,
        sessionStatus: $sessionStore.status,
        roles: $sessionStore.user?.roles ?? []
      })
    : null;

  $: if (redirectTarget && redirectTarget !== currentPath) {
    push(redirectTarget);
  }

  onMount(async () => {
    await initializeApp();
    await registerServiceWorker();
  });
</script>

<main class="app-root">
  <AppHeader />

  {#if browserSupportBlockers.length > 0}
    <section class="warning-banner blocked" aria-live="polite">
      <h2>Prompt-critical mutation support unavailable</h2>
      <ul>
        {#each browserSupportBlockers as warning}
          <li>{warning}</li>
        {/each}
      </ul>
      <p class="muted">
        Booking and import commit mutations are blocked until required browser support is available.
      </p>
    </section>
  {/if}

  {#if browserSupportWarnings.length > 0}
    <section class="warning-banner" aria-live="polite">
      <h2>Browser capability warnings</h2>
      <ul>
        {#each browserSupportWarnings as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if !$appBootstrapStore.initialized}
    <section class="status-card">Initializing LocalOps workspace…</section>
  {:else if $appBootstrapStore.startupError}
    <section class="status-card error">
      <h2>Startup error</h2>
      <p>IndexedDB startup failed: {$appBootstrapStore.startupError}</p>
      <p>Check browser storage settings and refresh the app.</p>
    </section>
  {:else}
    <section class="content-frame">
      <Router {routes} />

      {#if $sessionStore.status !== 'logged_out'}
        <ConversationPanel contextPath={currentPath} />
      {/if}
    </section>
  {/if}

  <SessionLockModal open={$sessionStore.status === 'locked'} />
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    background: #f3f4f6;
    color: #111827;
  }

  .app-root {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
  }

  .content-frame {
    padding: 1rem;
    max-width: 70rem;
    width: 100%;
    margin: 0 auto;
  }

  .status-card {
    margin: 1rem auto;
    width: min(42rem, 92vw);
    background: #fff;
    border: 1px solid #d5d7dc;
    border-radius: 0.75rem;
    padding: 1rem;
  }

  .status-card.error {
    border-color: #fda29b;
  }

  .warning-banner {
    margin: 1rem auto 0;
    width: min(70rem, 92vw);
    border: 1px solid #f79009;
    background: #fffaeb;
    border-radius: 0.65rem;
    padding: 0.75rem 1rem;
  }

  .warning-banner.blocked {
    border-color: #f04438;
    background: #fef3f2;
  }

  .warning-banner h2 {
    margin: 0;
    font-size: 1rem;
  }

  .warning-banner ul {
    margin: 0.45rem 0 0;
    padding-left: 1.1rem;
  }
</style>
