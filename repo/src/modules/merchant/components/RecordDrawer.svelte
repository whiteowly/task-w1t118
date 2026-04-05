<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let open = false;
  export let title = '';

  const dispatch = createEventDispatcher<{ close: void }>();

  function close(): void {
    dispatch('close');
  }
</script>

{#if open}
  <div class="drawer-backdrop" on:click|self={close} role="presentation">
    <div class="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header>
        <h3>{title}</h3>
        <button type="button" on:click={close}>Close</button>
      </header>
      <div class="drawer-content">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(15 23 42 / 40%);
    z-index: 80;
  }

  .drawer {
    position: absolute;
    top: 0;
    right: 0;
    width: min(32rem, 95vw);
    height: 100%;
    background: #fff;
    border-left: 1px solid #d0d5dd;
    padding: 1rem;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.8rem;
    overflow: auto;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  h3 {
    margin: 0;
  }

  button {
    font: inherit;
    padding: 0.45rem 0.6rem;
  }

  .drawer-content {
    min-height: 0;
  }
</style>
