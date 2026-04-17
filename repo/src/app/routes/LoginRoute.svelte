<script lang="ts">
  import { push } from 'svelte-spa-router';

  import { loginViaApi } from '../../shared/api/auth-api';
  import { defaultRouteForRoles } from '../../core/permissions/service';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { sessionStore } from '../../shared/stores/session-store';

  let username = '';
  let password = '';
  let isSubmitting = false;
  let formError = '';
  let fieldErrors: Record<string, string[]> = {};

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    isSubmitting = true;
    formError = '';
    fieldErrors = {};

    try {
      await loginViaApi({ username, password });
      const session = $sessionStore;
      const route = session.user ? defaultRouteForRoles(session.user.roles) : '/denied';
      push(route);
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      fieldErrors = normalized.fieldErrors ?? {};
      formError = normalized.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<section class="card">
  <h1>Sign in</h1>
  <p>Use your local LocalOps username and password.</p>

  <form on:submit={handleSubmit}>
    <label for="login-username">Username</label>
    <input id="login-username" bind:value={username} autocomplete="username" />
    {#if fieldErrors.username}
      <p class="error">{fieldErrors.username[0]}</p>
    {/if}

    <label for="login-password">Password</label>
    <input
      id="login-password"
      type="password"
      bind:value={password}
      autocomplete="current-password"
    />
    {#if fieldErrors.password}
      <p class="error">{fieldErrors.password[0]}</p>
    {/if}

    {#if formError}
      <p class="error" role="alert">{formError}</p>
    {/if}

    <button type="submit" disabled={isSubmitting}>
      {#if isSubmitting}Signing in...{:else}Sign in{/if}
    </button>
  </form>
</section>

<style>
  .card {
    max-width: 28rem;
    margin: 1rem auto;
    border: 1px solid #d5d7dc;
    border-radius: 0.75rem;
    padding: 1rem;
    background: #fff;
  }

  h1 {
    margin: 0;
  }

  p {
    color: #4d5761;
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
