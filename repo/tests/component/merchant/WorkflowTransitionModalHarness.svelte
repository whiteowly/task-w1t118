<script lang="ts">
  import WorkflowTransitionModal from '../../../src/modules/merchant/components/WorkflowTransitionModal.svelte';

  let capturedReason = '';

  function onConfirm(event: CustomEvent<{ reason?: string }>): void {
    capturedReason = event.detail.reason ?? '';
  }
</script>

<WorkflowTransitionModal
  open={true}
  actionLabel="Reject"
  merchantName="Merchant A"
  requiresReason={true}
  isSubmitting={false}
  on:confirm={onConfirm}
/>

<output data-testid="captured-reason">{capturedReason}</output>
