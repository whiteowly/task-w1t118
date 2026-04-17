<script lang="ts">
  import SignatureCanvas from '../../../src/modules/recruiting/components/SignatureCanvas.svelte';
  export let disabled = false;
  let value = '';
</script>

<SignatureCanvas bind:value {disabled} />
<output data-testid="canvas-value">{value}</output>
