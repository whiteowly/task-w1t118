<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let open = false;
  export let actionLabel = '';
  export let merchantName = '';
  export let requiresReason = false;
  export let isSubmitting = false;

  let reason = '';

  $: if (!open) {
    reason = '';
  }

  $: canConfirm = !requiresReason || reason.trim().length > 0;

  const dispatch = createEventDispatcher<{
    cancel: void;
    confirm: { reason?: string };
  }>();

  function onConfirm(): void {
    dispatch('confirm', { reason: reason.trim() || undefined });
  }

  function onCancel(): void {
    dispatch('cancel');
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="transition-title">
    <section class="modal">
      <h3 id="transition-title">{actionLabel} merchant</h3>
      <p>
        Confirm <strong>{actionLabel.toLowerCase()}</strong> for <strong>{merchantName}</strong>.
      </p>

      {#if requiresReason}
        <label for="transition-reason">Reason</label>
        <textarea id="transition-reason" bind:value={reason} rows="4"></textarea>
      {/if}

      <div class="actions">
        <button type="button" on:click={onCancel} disabled={isSubmitting}>Cancel</button>
        <button type="button" on:click={onConfirm} disabled={!canConfirm || isSubmitting}>
          {#if isSubmitting}{actionLabel}...{:else}{actionLabel}{/if}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(15 23 42 / 65%);
    display: grid;
    place-items: center;
    z-index: 90;
  }

  .modal {
    width: min(30rem, 92vw);
    background: #fff;
    border-radius: 0.75rem;
    border: 1px solid #d0d5dd;
    padding: 1rem;
    display: grid;
    gap: 0.65rem;
  }

  h3,
  p {
    margin: 0;
  }

  textarea,
  button {
    font: inherit;
    padding: 0.55rem 0.65rem;
  }

  .actions {
    display: flex;
    justify-content: end;
    gap: 0.5rem;
  }
</style>
