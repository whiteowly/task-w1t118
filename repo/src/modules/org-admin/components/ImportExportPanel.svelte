<script lang="ts">
  import {
    commitImport,
    exportEntity,
    listImportExportEntityOptions,
    previewImport,
    type ExportArtifact,
    type ImportFormat,
    type ImportMode,
    type ImportPreview
  } from '../../../core/import-export/import-export-service';
  import { normalizeUnknownError } from '../../../core/validation/errors';

  export let canManage = false;

  const entityOptions = listImportExportEntityOptions();

  let selectedEntityType = entityOptions[0]?.entityType ?? 'workspaceBackup';
  let selectedFormat: ImportFormat = 'json';
  let selectedMode: ImportMode = 'upsert';

  let selectedFile: File | null = null;
  let latestPreview: ImportPreview | null = null;

  let isExporting = false;
  let isPreviewing = false;
  let isCommitting = false;

  let actionError = '';
  let actionNotice = '';

  $: activeOption = entityOptions.find((option) => option.entityType === selectedEntityType);
  $: supportedFormats = activeOption?.supportedFormats ?? ['json'];
  $: if (!supportedFormats.includes(selectedFormat)) {
    selectedFormat = supportedFormats[0] as ImportFormat;
  }

  function clearNotices(): void {
    actionError = '';
    actionNotice = '';
  }

  function triggerDownload(artifact: ExportArtifact): void {
    const objectUrl = URL.createObjectURL(artifact.blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = artifact.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }

  function onFileChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);
    selectedFile = file ?? null;
    latestPreview = null;
  }

  async function runExport(): Promise<void> {
    if (!canManage) {
      return;
    }

    clearNotices();
    isExporting = true;

    try {
      const artifact = await exportEntity({
        entityType: selectedEntityType,
        format: selectedFormat
      });
      triggerDownload(artifact);
      actionNotice = `Generated ${artifact.recordCount} record export: ${artifact.fileName}`;
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isExporting = false;
    }
  }

  async function runPreviewImport(): Promise<void> {
    if (!canManage) {
      return;
    }

    clearNotices();
    isPreviewing = true;

    try {
      if (!selectedFile) {
        throw new Error('Choose an import file before previewing.');
      }

      latestPreview = await previewImport({
        file: selectedFile,
        entityType: selectedEntityType,
        format: selectedFormat,
        mode: selectedMode
      });

      actionNotice = `Preview ready: ${latestPreview.validRows}/${latestPreview.totalRows} rows valid.`;
    } catch (error) {
      latestPreview = null;
      actionError = normalizeUnknownError(error).message;
    } finally {
      isPreviewing = false;
    }
  }

  async function runCommitImport(): Promise<void> {
    if (!canManage || !latestPreview) {
      return;
    }

    clearNotices();
    isCommitting = true;

    try {
      const result = await commitImport(latestPreview);
      actionNotice = `Import committed: ${result.committedRows} rows (${result.mode}).`;
      latestPreview = null;
      selectedFile = null;
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isCommitting = false;
    }
  }
</script>

<section class="panel" aria-label="Import export operations panel">
  <header>
    <h3>Import / Export operations</h3>
    <p>
      Generate in-browser backup/export files and run bulk import preview/commit in CSV or JSON.
    </p>
  </header>

  {#if actionError}
    <p class="error" role="alert">{actionError}</p>
  {/if}
  {#if actionNotice}
    <p class="notice" role="status">{actionNotice}</p>
  {/if}

  {#if !canManage}
    <p class="muted">Import/export operations require Org Admin manage permissions.</p>
  {:else}
    <div class="layout">
      <section class="card">
        <h4>Export data</h4>

        <label for="export-entity">Export entity</label>
        <select id="export-entity" bind:value={selectedEntityType}>
          {#each entityOptions as option}
            <option value={option.entityType}>{option.label}</option>
          {/each}
        </select>

        <label for="export-format">Export format</label>
        <select id="export-format" bind:value={selectedFormat}>
          {#each supportedFormats as formatOption}
            <option value={formatOption}>{formatOption.toUpperCase()}</option>
          {/each}
        </select>

        <button type="button" on:click={runExport} disabled={isExporting}>
          {#if isExporting}Generating…{:else}Export entity data{/if}
        </button>
      </section>

      <section class="card">
        <h4>Import data</h4>

        <label for="import-entity">Import entity</label>
        <select id="import-entity" bind:value={selectedEntityType}>
          {#each entityOptions as option}
            <option value={option.entityType}>{option.label}</option>
          {/each}
        </select>

        <label for="import-format">Import format</label>
        <select id="import-format" bind:value={selectedFormat}>
          {#each supportedFormats as formatOption}
            <option value={formatOption}>{formatOption.toUpperCase()}</option>
          {/each}
        </select>

        <label for="import-mode">Mode</label>
        <select id="import-mode" bind:value={selectedMode}>
          <option value="upsert">Upsert</option>
          <option value="replace">Replace</option>
        </select>

        <label for="import-file">Import file</label>
        <input
          id="import-file"
          type="file"
          accept={selectedFormat === 'csv' ? '.csv,text/csv' : '.json,application/json'}
          on:change={onFileChange}
        />

        <div class="actions">
          <button
            type="button"
            on:click={runPreviewImport}
            disabled={isPreviewing || !selectedFile}
          >
            {#if isPreviewing}Previewing…{:else}Preview import{/if}
          </button>
          <button
            type="button"
            class="primary"
            on:click={runCommitImport}
            disabled={isCommitting || !latestPreview || latestPreview.invalidRows > 0}
          >
            {#if isCommitting}Committing…{:else}Commit import{/if}
          </button>
        </div>

        {#if latestPreview}
          <div class="preview" aria-live="polite">
            <p><strong>File:</strong> {latestPreview.fileName}</p>
            <p>
              <strong>Rows:</strong>
              total {latestPreview.totalRows} · valid {latestPreview.validRows} · invalid
              {latestPreview.invalidRows}
            </p>

            {#if latestPreview.validationIssues.length > 0}
              <ul>
                {#each latestPreview.validationIssues.slice(0, 5) as issue}
                  <li>Row {issue.rowNumber}: {issue.message}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .panel {
    border: 1px solid #d0d5dd;
    border-radius: 0.7rem;
    padding: 0.8rem;
    background: #fff;
  }

  .panel h3 {
    margin: 0;
  }

  .panel header p {
    margin: 0.35rem 0 0;
    color: #475467;
  }

  .layout {
    margin-top: 0.7rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.7rem;
  }

  .card {
    border: 1px solid #eaecf0;
    border-radius: 0.6rem;
    padding: 0.65rem;
    display: grid;
    gap: 0.4rem;
  }

  .card h4 {
    margin: 0 0 0.2rem;
  }

  label {
    font-size: 0.85rem;
    color: #344054;
  }

  input,
  select,
  button {
    font: inherit;
  }

  input,
  select {
    border: 1px solid #d0d5dd;
    border-radius: 0.45rem;
    padding: 0.4rem 0.45rem;
  }

  button {
    border: 1px solid #344054;
    border-radius: 0.45rem;
    background: #1f2937;
    color: #f8fafc;
    padding: 0.4rem 0.6rem;
  }

  button.primary {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .preview {
    margin-top: 0.35rem;
    border: 1px dashed #98a2b3;
    border-radius: 0.5rem;
    padding: 0.45rem;
    background: #f8fafc;
  }

  .preview p {
    margin: 0.2rem 0;
  }

  .preview ul {
    margin: 0.35rem 0 0;
    padding-left: 1rem;
  }

  .error {
    color: #b42318;
  }

  .notice {
    color: #05603a;
  }

  .muted {
    color: #667085;
  }
</style>
