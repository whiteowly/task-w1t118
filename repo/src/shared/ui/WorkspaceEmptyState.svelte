<script lang="ts">
  export let title: string;
  export let description: string;
</script>

<section class="empty-state" aria-live="polite">
  <h2>{title}</h2>
  <p>{description}</p>
</section>

<style>
  .empty-state {
    border: 1px solid #d5d7dc;
    border-radius: 0.6rem;
    background: #fff;
    padding: 1rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.2rem;
  }

  p {
    margin: 0;
    color: #4d5761;
  }
</style>
