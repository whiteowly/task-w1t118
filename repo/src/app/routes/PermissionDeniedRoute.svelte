<script lang="ts">
  import { link } from 'svelte-spa-router';
</script>

<section class="card">
  <h1>Permission denied</h1>
  <p>Your account does not have access to this workspace route.</p>
  <a href="/login" use:link>Return to login</a>
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
</style>
