<script lang="ts">
  import { reauthenticate } from '../../core/auth/auth-service';
  import { normalizeUnknownError } from '../../core/validation/errors';

  export let open = false;

  let password = '';
  let isSubmitting = false;
  let errorMessage = '';

  async function unlock(): Promise<void> {
    isSubmitting = true;
    errorMessage = '';

    try {
      await reauthenticate({ password });
      password = '';
    } catch (error) {
      errorMessage = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="lock-title">
    <section class="modal">
      <h2 id="lock-title">Session locked</h2>
      <p>Your workspace is locked due to inactivity or manual lock. Re-enter your password.</p>

      <label for="reauth-password">Password</label>
      <input
        id="reauth-password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
      />

      {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}

      <button type="button" on:click={unlock} disabled={isSubmitting}>
        {#if isSubmitting}Unlocking...{:else}Unlock session{/if}
      </button>
    </section>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(15 23 42 / 75%);
    display: grid;
    place-items: center;
    z-index: 100;
  }

  .modal {
    width: min(28rem, 92vw);
    background: #fff;
    border-radius: 0.75rem;
    border: 1px solid #d5d7dc;
    padding: 1rem;
    display: grid;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
  }

  p {
    margin: 0;
  }

  input,
  button {
    font: inherit;
    padding: 0.55rem 0.65rem;
  }

  .error {
    color: #b42318;
  }
</style>
