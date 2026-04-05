<script lang="ts">
  import { onMount } from 'svelte';

  import { hasCapability } from '../../core/permissions/service';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { sessionStore } from '../../shared/stores/session-store';
  import {
    collaborationContextLabelForPath,
    createCannedResponse,
    createSharedNote,
    listCannedResponses,
    listContextHistory,
    listSharedNotes,
    normalizeCollaborationContextKey,
    postContextMessage,
    searchCollaborationRecords,
    setCannedResponseArchived,
    setContextMessageArchived,
    setSharedNoteArchived,
    updateSharedNote,
    type CollaborationCannedResponseView,
    type CollaborationMessageView,
    type CollaborationNoteView,
    type CollaborationSearchResultView
  } from './collaboration-service';

  export let contextPath = '/';

  let messages: CollaborationMessageView[] = [];
  let notes: CollaborationNoteView[] = [];
  let cannedResponses: CollaborationCannedResponseView[] = [];
  let searchResults: CollaborationSearchResultView[] = [];

  let messageBody = '';
  let noteBody = '';
  let cannedTitle = '';
  let cannedBody = '';
  let cannedTags = '';

  let searchKeyword = '';
  let searchStartDate = '';
  let searchEndDate = '';
  let searchScope: 'current' | 'all' = 'current';

  let includeArchived = false;
  let includeArchivedSearch = false;

  let isLoading = true;
  let isSubmittingMessage = false;
  let isSubmittingNote = false;
  let isSubmittingCanned = false;
  let busyRecordId: string | null = null;
  let isSearching = false;
  let refreshTrigger = '';

  let actionError = '';
  let actionNotice = '';

  let noteDraftById: Record<string, string> = {};

  $: contextKey = normalizeCollaborationContextKey(contextPath);
  $: contextLabel = collaborationContextLabelForPath(contextKey);
  $: currentUser = $sessionStore.user;
  $: canUseCollaboration = currentUser
    ? hasCapability(currentUser.roles, 'workspace.collaboration.use')
    : false;

  function clearNotices(): void {
    actionError = '';
    actionNotice = '';
  }

  function hydrateNoteDrafts(nextNotes: CollaborationNoteView[]): void {
    noteDraftById = Object.fromEntries(nextNotes.map((note) => [note.id, note.noteBody]));
  }

  async function refreshContextData(): Promise<void> {
    if (!canUseCollaboration) {
      messages = [];
      notes = [];
      cannedResponses = [];
      searchResults = [];
      return;
    }

    isLoading = true;

    try {
      const [nextMessages, nextNotes, nextCannedResponses] = await Promise.all([
        listContextHistory({ contextKey, includeArchived }),
        listSharedNotes({ contextKey, includeArchived }),
        listCannedResponses(includeArchived)
      ]);

      messages = nextMessages;
      notes = nextNotes;
      cannedResponses = nextCannedResponses;
      hydrateNoteDrafts(nextNotes);
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isLoading = false;
    }
  }

  async function submitMessage(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canUseCollaboration) {
      return;
    }

    isSubmittingMessage = true;
    clearNotices();

    try {
      await postContextMessage({
        contextKey,
        contextLabel,
        messageBody,
        source: 'manual'
      });
      messageBody = '';
      actionNotice = 'Context message posted.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingMessage = false;
    }
  }

  async function postCannedResponse(response: CollaborationCannedResponseView): Promise<void> {
    if (!canUseCollaboration) {
      return;
    }

    isSubmittingMessage = true;
    clearNotices();

    try {
      await postContextMessage({
        contextKey,
        contextLabel,
        messageBody: response.body,
        source: 'canned'
      });
      actionNotice = `Posted canned response: ${response.title}.`;
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingMessage = false;
    }
  }

  function insertCannedResponse(response: CollaborationCannedResponseView): void {
    messageBody = response.body;
  }

  async function submitSharedNote(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canUseCollaboration) {
      return;
    }

    isSubmittingNote = true;
    clearNotices();

    try {
      await createSharedNote({ contextKey, contextLabel, noteBody });
      noteBody = '';
      actionNotice = 'Shared note saved.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingNote = false;
    }
  }

  async function saveNote(note: CollaborationNoteView): Promise<void> {
    if (!canUseCollaboration) {
      return;
    }

    busyRecordId = note.id;
    clearNotices();

    try {
      await updateSharedNote({
        noteId: note.id,
        noteBody: noteDraftById[note.id] ?? note.noteBody
      });
      actionNotice = 'Shared note updated.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      busyRecordId = null;
    }
  }

  async function setMessageArchived(recordId: string, archived: boolean): Promise<void> {
    busyRecordId = recordId;
    clearNotices();

    try {
      await setContextMessageArchived({ recordId, archived });
      actionNotice = archived ? 'Message archived.' : 'Message restored.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      busyRecordId = null;
    }
  }

  async function setNoteArchived(recordId: string, archived: boolean): Promise<void> {
    busyRecordId = recordId;
    clearNotices();

    try {
      await setSharedNoteArchived({ recordId, archived });
      actionNotice = archived ? 'Note archived.' : 'Note restored.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      busyRecordId = null;
    }
  }

  async function submitCannedResponse(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canUseCollaboration) {
      return;
    }

    isSubmittingCanned = true;
    clearNotices();

    try {
      await createCannedResponse({
        title: cannedTitle,
        body: cannedBody,
        tags: cannedTags
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      });

      cannedTitle = '';
      cannedBody = '';
      cannedTags = '';
      actionNotice = 'Canned response created.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingCanned = false;
    }
  }

  async function setCannedArchived(recordId: string, archived: boolean): Promise<void> {
    busyRecordId = recordId;
    clearNotices();

    try {
      await setCannedResponseArchived({ recordId, archived });
      actionNotice = archived ? 'Canned response archived.' : 'Canned response restored.';
      await refreshContextData();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      busyRecordId = null;
    }
  }

  async function runSearch(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canUseCollaboration) {
      return;
    }

    isSearching = true;
    clearNotices();

    try {
      searchResults = await searchCollaborationRecords({
        keyword: searchKeyword,
        startDate: searchStartDate || null,
        endDate: searchEndDate || null,
        includeArchived: includeArchivedSearch,
        contextKey: searchScope === 'current' ? contextKey : undefined
      });
      actionNotice = `Search returned ${searchResults.length} result${searchResults.length === 1 ? '' : 's'}.`;
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  $: {
    const nextTrigger = `${canUseCollaboration}-${contextKey}-${includeArchived}`;
    if (nextTrigger !== refreshTrigger) {
      refreshTrigger = nextTrigger;
      if (canUseCollaboration) {
        void refreshContextData();
      }
    }
  }

  onMount(async () => {
    if (canUseCollaboration) {
      await refreshContextData();
    }
  });
</script>

<section class="conversation-panel" aria-label="Collaboration panel">
  <header>
    <h3>Collaboration panel</h3>
    <p>Context: {contextLabel}</p>
  </header>

  {#if actionError}
    <p class="error" role="alert">{actionError}</p>
  {/if}
  {#if actionNotice}
    <p class="notice" role="status">{actionNotice}</p>
  {/if}

  {#if !canUseCollaboration}
    <p class="muted">Your current role cannot access collaboration tools.</p>
  {:else}
    <label class="toggle">
      <input type="checkbox" bind:checked={includeArchived} />
      <span>Show archived entries in context sections</span>
    </label>

    {#if isLoading}
      <p class="muted">Loading collaboration context…</p>
    {:else}
      <div class="grid">
        <section class="card">
          <h4>Context history</h4>
          <form on:submit={submitMessage}>
            <label for="collab-message">Post message</label>
            <textarea id="collab-message" bind:value={messageBody} rows="3"></textarea>
            <button type="submit" disabled={isSubmittingMessage}>
              {#if isSubmittingMessage}Posting…{:else}Post message{/if}
            </button>
          </form>

          {#if messages.length === 0}
            <p class="muted">No context messages yet.</p>
          {:else}
            <ul class="record-list">
              {#each messages as message}
                <li class:archived={message.archived}>
                  <p>{message.messageBody}</p>
                  <div class="meta-row">
                    <span
                      >{message.source === 'canned' ? 'Canned' : 'Manual'} · {message.createdAt}</span
                    >
                    <button
                      type="button"
                      disabled={busyRecordId === message.id}
                      on:click={() => setMessageArchived(message.id, !message.archived)}
                    >
                      {message.archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="card">
          <h4>Canned responses</h4>
          <form on:submit={submitCannedResponse}>
            <label for="canned-title">Title</label>
            <input id="canned-title" bind:value={cannedTitle} />
            <label for="canned-body">Body</label>
            <textarea id="canned-body" bind:value={cannedBody} rows="2"></textarea>
            <label for="canned-tags">Tags (comma-separated)</label>
            <input id="canned-tags" bind:value={cannedTags} />
            <button type="submit" disabled={isSubmittingCanned}>
              {#if isSubmittingCanned}Saving…{:else}Add canned response{/if}
            </button>
          </form>

          <ul class="record-list">
            {#each cannedResponses as response}
              <li class:archived={response.archived}>
                <strong>{response.title}</strong>
                <p>{response.body}</p>
                <div class="meta-row">
                  <span>{response.tags.join(', ') || 'No tags'}</span>
                  <div class="inline-actions">
                    <button type="button" on:click={() => insertCannedResponse(response)}
                      >Insert</button
                    >
                    <button type="button" on:click={() => postCannedResponse(response)}>Post</button
                    >
                    <button
                      type="button"
                      disabled={busyRecordId === response.id}
                      on:click={() => setCannedArchived(response.id, !response.archived)}
                    >
                      {response.archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </section>

        <section class="card">
          <h4>Shared notes</h4>
          <form on:submit={submitSharedNote}>
            <label for="shared-note">New shared note</label>
            <textarea id="shared-note" bind:value={noteBody} rows="3"></textarea>
            <button type="submit" disabled={isSubmittingNote}>
              {#if isSubmittingNote}Saving…{:else}Save note{/if}
            </button>
          </form>

          {#if notes.length === 0}
            <p class="muted">No shared notes yet.</p>
          {:else}
            <ul class="record-list">
              {#each notes as note}
                <li class:archived={note.archived}>
                  <textarea rows="2" bind:value={noteDraftById[note.id]}></textarea>
                  <div class="meta-row">
                    <span>Updated {note.updatedAt}</span>
                    <div class="inline-actions">
                      <button
                        type="button"
                        disabled={busyRecordId === note.id}
                        on:click={() => saveNote(note)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={busyRecordId === note.id}
                        on:click={() => setNoteArchived(note.id, !note.archived)}
                      >
                        {note.archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="card">
          <h4>Search collaboration</h4>
          <form on:submit={runSearch}>
            <label for="search-keyword">Keyword</label>
            <input id="search-keyword" bind:value={searchKeyword} />
            <label for="search-start-date">Start date</label>
            <input id="search-start-date" type="date" bind:value={searchStartDate} />
            <label for="search-end-date">End date</label>
            <input id="search-end-date" type="date" bind:value={searchEndDate} />
            <label for="search-scope">Scope</label>
            <select id="search-scope" bind:value={searchScope}>
              <option value="current">Current context</option>
              <option value="all">All contexts</option>
            </select>
            <label class="toggle">
              <input type="checkbox" bind:checked={includeArchivedSearch} />
              <span>Include archived in search</span>
            </label>
            <button type="submit" disabled={isSearching}>
              {#if isSearching}Searching…{:else}Run search{/if}
            </button>
          </form>

          {#if searchResults.length === 0}
            <p class="muted">No search results yet.</p>
          {:else}
            <ul class="record-list">
              {#each searchResults as result}
                <li class:archived={result.archived}>
                  <strong
                    >{result.resultType === 'message' ? 'Message' : 'Note'} · {result.contextLabel}</strong
                  >
                  <p>{result.body}</p>
                  <span class="muted">{result.timestamp}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  {/if}
</section>

<style>
  .conversation-panel {
    margin-top: 1rem;
    border: 1px solid #d0d5dd;
    border-radius: 0.75rem;
    padding: 0.9rem;
    background: #ffffff;
  }

  header h3 {
    margin: 0;
    font-size: 1rem;
  }

  header p {
    margin: 0.2rem 0 0;
    color: #475467;
    font-size: 0.9rem;
  }

  .grid {
    margin-top: 0.8rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.75rem;
  }

  .card {
    border: 1px solid #e4e7ec;
    border-radius: 0.65rem;
    padding: 0.65rem;
    background: #fcfcfd;
  }

  .card h4 {
    margin: 0 0 0.45rem;
    font-size: 0.95rem;
  }

  form {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 0.55rem;
  }

  label,
  .toggle {
    font-size: 0.85rem;
    color: #344054;
  }

  input,
  textarea,
  select,
  button {
    font: inherit;
  }

  input,
  textarea,
  select {
    border: 1px solid #d0d5dd;
    border-radius: 0.45rem;
    padding: 0.4rem 0.45rem;
    background: #fff;
  }

  button {
    border: 1px solid #344054;
    border-radius: 0.45rem;
    background: #1f2937;
    color: #f9fafb;
    padding: 0.35rem 0.55rem;
    cursor: pointer;
  }

  .record-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.45rem;
  }

  .record-list li {
    border: 1px solid #eaecf0;
    border-radius: 0.5rem;
    padding: 0.45rem;
    background: #ffffff;
  }

  .record-list li p {
    margin: 0.3rem 0;
    white-space: pre-wrap;
  }

  .record-list li.archived {
    opacity: 0.72;
    background: #f8fafc;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.78rem;
    color: #475467;
  }

  .inline-actions {
    display: flex;
    gap: 0.35rem;
  }

  .error {
    margin-top: 0.4rem;
    color: #b42318;
  }

  .notice {
    margin-top: 0.4rem;
    color: #05603a;
  }

  .muted {
    color: #667085;
    margin: 0.35rem 0;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }
</style>
