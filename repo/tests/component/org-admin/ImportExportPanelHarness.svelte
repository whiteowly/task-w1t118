<script lang="ts">
  import ImportExportPanel from '../../../src/modules/org-admin/components/ImportExportPanel.svelte';
  export let canManage = false;
</script>

<ImportExportPanel {canManage} />
