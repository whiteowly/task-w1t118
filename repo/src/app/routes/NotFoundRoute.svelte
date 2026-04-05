<script lang="ts">
  import { link } from 'svelte-spa-router';
</script>

<section class="card">
  <h1>Page not found</h1>
  <p>The route you requested does not exist in this workspace.</p>
  <a href="/" use:link>Go to app home</a>
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
