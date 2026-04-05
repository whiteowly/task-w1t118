<script lang="ts">
  import { link, push } from 'svelte-spa-router';

  import { bootstrapAdministrator } from '../../core/auth/auth-service';
  import { logger } from '../../core/logging/logger';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { appBootstrapStore } from '../../shared/stores/app-store';

  let username = '';
  let password = '';
  let confirmPassword = '';
  let isSubmitting = false;
  let formError = '';
  let fieldErrors: Record<string, string[]> = {};

  $: bootstrapRequired = $appBootstrapStore.bootstrapRequired;

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    isSubmitting = true;
    formError = '';
    fieldErrors = {};

    try {
      await bootstrapAdministrator({ username, password, confirmPassword });
      appBootstrapStore.update((state) => ({ ...state, bootstrapRequired: false }));
      push('/login');
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      fieldErrors = normalized.fieldErrors ?? {};
      formError = normalized.message;
      logger.error('auth', 'Bootstrap admin setup failed.', normalized);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<section class="card">
  <h1>Create initial administrator</h1>

  {#if !bootstrapRequired}
    <p>Administrator account already exists. Continue to the login screen.</p>
    <a href="/login" use:link>Go to login</a>
  {:else}
    <p>This workspace has no local users yet. Create the first Administrator account.</p>

    <form on:submit={handleSubmit}>
      <label for="bootstrap-username">Username</label>
      <input id="bootstrap-username" bind:value={username} autocomplete="username" />
      {#if fieldErrors.username}
        <p class="error">{fieldErrors.username[0]}</p>
      {/if}

      <label for="bootstrap-password">Password</label>
      <input
        id="bootstrap-password"
        type="password"
        bind:value={password}
        autocomplete="new-password"
      />
      {#if fieldErrors.password}
        <p class="error">{fieldErrors.password[0]}</p>
      {/if}

      <label for="bootstrap-confirm-password">Confirm password</label>
      <input
        id="bootstrap-confirm-password"
        type="password"
        bind:value={confirmPassword}
        autocomplete="new-password"
      />
      {#if fieldErrors.confirmPassword}
        <p class="error">{fieldErrors.confirmPassword[0]}</p>
      {/if}

      {#if formError}
        <p class="error" role="alert">{formError}</p>
      {/if}

      <button type="submit" disabled={isSubmitting}>
        {#if isSubmitting}Creating administrator...{:else}Create administrator{/if}
      </button>
    </form>
  {/if}
</section>

<style>
  .card {
    max-width: 30rem;
    margin: 1rem auto;
    border: 1px solid #d5d7dc;
    border-radius: 0.75rem;
    padding: 1rem;
    background: #fff;
  }

  h1 {
    margin-top: 0;
  }

  form {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }

  input,
  button {
    font: inherit;
    padding: 0.55rem 0.65rem;
  }

  .error {
    color: #b42318;
    margin: 0;
  }
</style>
