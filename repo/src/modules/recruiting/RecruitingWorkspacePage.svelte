<script lang="ts">
  import { onMount } from 'svelte';

  import { hasCapability } from '../../core/permissions/service';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { sessionStore } from '../../shared/stores/session-store';
  import SignatureCanvas from './components/SignatureCanvas.svelte';
  import {
    approveOffer,
    canApproveRecruitingActions,
    canManageRecruitingActions,
    captureOfferSignature,
    createOfferFromTemplate,
    getOnboardingDocument,
    listOfferTemplates,
    listOnboardingChecklist,
    listRecruitingOffers,
    rejectOffer,
    updateChecklistItemStatus,
    upsertOnboardingDocument,
    type OnboardingChecklistItemView,
    type OnboardingDocumentView,
    type RecruitingOfferTemplateView,
    type RecruitingOfferView
  } from './recruiting-service';

  let templates: RecruitingOfferTemplateView[] = [];
  let offers: RecruitingOfferView[] = [];

  let selectedOfferId = '';
  let checklistItems: OnboardingChecklistItemView[] = [];
  let onboardingDocument: OnboardingDocumentView | null = null;

  let isLoading = true;
  let isSubmittingCreate = false;
  let isSubmittingApproval = false;
  let isSubmittingSignature = false;
  let isSubmittingDocuments = false;
  let checklistBusyItemId: string | null = null;

  let pageError = '';
  let actionError = '';
  let successNotice = '';

  let templateId = '';
  let candidateName = '';
  let candidateEmail = '';

  let rejectReason = '';

  let typedSignerName = '';
  let drawnSignatureDataUrl = '';
  let signatureCanvasRef: { clearSignature: () => void } | null = null;

  let legalName = '';
  let addressLine1 = '';
  let city = '';
  let stateProvince = '';
  let postalCode = '';
  let ssn = '';
  let emergencyContactName = '';
  let emergencyContactPhone = '';

  $: currentUser = $sessionStore.user;
  $: canViewRecruiting = currentUser
    ? hasCapability(currentUser.roles, 'workspace.recruiting.view')
    : false;
  $: canManageRecruiting = currentUser ? canManageRecruitingActions(currentUser.roles) : false;
  $: canApproveRecruiting = currentUser ? canApproveRecruitingActions(currentUser.roles) : false;
  $: selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? null;

  function clearNotices(): void {
    actionError = '';
    successNotice = '';
  }

  function approvalStatusLabel(status: RecruitingOfferView['approvalStatus']): string {
    if (status === 'pending_hr_approval') return 'Pending HR approval';
    if (status === 'approved') return 'Approved';
    return 'Rejected';
  }

  function onboardingStatusLabel(status: RecruitingOfferView['onboardingStatus']): string {
    if (status === 'not_started') return 'Not Started';
    if (status === 'in_progress') return 'In Progress';
    return 'Complete';
  }

  function checklistStatusLabel(status: OnboardingChecklistItemView['status']): string {
    if (status === 'not_started') return 'Not Started';
    if (status === 'in_progress') return 'In Progress';
    return 'Complete';
  }

  async function refreshWorkspace(): Promise<void> {
    isLoading = true;
    pageError = '';

    try {
      const [templateRows, offerRows] = await Promise.all([
        listOfferTemplates(),
        listRecruitingOffers()
      ]);
      templates = templateRows;
      offers = offerRows;

      if (!templateId && templates.length > 0) {
        templateId = templates[0].id;
      }

      if (selectedOfferId) {
        const stillExists = offerRows.some((offer) => offer.id === selectedOfferId);
        if (!stillExists) {
          selectedOfferId = '';
          checklistItems = [];
          onboardingDocument = null;
        }
      }

      if (selectedOfferId) {
        await loadSelectedOfferDetail(selectedOfferId);
      }
    } catch (error) {
      pageError = normalizeUnknownError(error).message;
    } finally {
      isLoading = false;
    }
  }

  async function loadSelectedOfferDetail(offerId: string): Promise<void> {
    try {
      const [items, docs] = await Promise.all([
        listOnboardingChecklist(offerId),
        getOnboardingDocument(offerId)
      ]);
      checklistItems = items;
      onboardingDocument = docs;

      if (docs) {
        legalName = docs.legalName;
        addressLine1 = docs.addressLine1;
        city = docs.city;
        stateProvince = docs.stateProvince;
        postalCode = docs.postalCode;
        emergencyContactName = docs.emergencyContactName;
        emergencyContactPhone = docs.emergencyContactPhone;
      }
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    }
  }

  async function selectOffer(offerId: string): Promise<void> {
    selectedOfferId = offerId;
    clearNotices();
    typedSignerName = '';
    drawnSignatureDataUrl = '';
    ssn = '';
    signatureCanvasRef?.clearSignature();
    await loadSelectedOfferDetail(offerId);
  }

  async function submitCreateOffer(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canManageRecruiting) {
      return;
    }

    clearNotices();
    isSubmittingCreate = true;

    try {
      const created = await createOfferFromTemplate({ templateId, candidateName, candidateEmail });
      successNotice = 'Offer created and routed to HR Manager approval queue.';
      candidateName = '';
      candidateEmail = '';
      await refreshWorkspace();
      selectedOfferId = created.id;
      await loadSelectedOfferDetail(created.id);
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingCreate = false;
    }
  }

  async function approveSelectedOffer(): Promise<void> {
    if (!selectedOffer || !canApproveRecruiting) {
      return;
    }

    clearNotices();
    isSubmittingApproval = true;

    try {
      await approveOffer({ offerId: selectedOffer.id });
      successNotice = 'Offer approved by HR Manager.';
      rejectReason = '';
      await refreshWorkspace();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingApproval = false;
    }
  }

  async function rejectSelectedOffer(): Promise<void> {
    if (!selectedOffer || !canApproveRecruiting) {
      return;
    }

    clearNotices();
    isSubmittingApproval = true;

    try {
      await rejectOffer({ offerId: selectedOffer.id, reason: rejectReason });
      successNotice = 'Offer rejected.';
      await refreshWorkspace();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingApproval = false;
    }
  }

  async function submitSignature(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!selectedOffer || !canManageRecruiting) {
      return;
    }

    clearNotices();
    isSubmittingSignature = true;

    try {
      await captureOfferSignature({
        offerId: selectedOffer.id,
        typedSignerName,
        drawnSignatureDataUrl: drawnSignatureDataUrl || undefined
      });
      successNotice = 'E-signature captured successfully.';
      await refreshWorkspace();
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingSignature = false;
    }
  }

  async function submitOnboardingDocuments(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!selectedOffer || !canManageRecruiting) {
      return;
    }

    clearNotices();
    isSubmittingDocuments = true;

    try {
      onboardingDocument = await upsertOnboardingDocument({
        offerId: selectedOffer.id,
        legalName,
        addressLine1,
        city,
        stateProvince,
        postalCode,
        ssn,
        emergencyContactName,
        emergencyContactPhone
      });

      successNotice = 'Onboarding documents saved with masked SSN display.';
      ssn = '';
      await refreshWorkspace();
      await loadSelectedOfferDetail(selectedOffer.id);
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      isSubmittingDocuments = false;
    }
  }

  async function setChecklistStatus(
    checklistItem: OnboardingChecklistItemView,
    status: OnboardingChecklistItemView['status']
  ): Promise<void> {
    if (!selectedOffer || !canManageRecruiting) {
      return;
    }

    clearNotices();
    checklistBusyItemId = checklistItem.id;

    try {
      checklistItems = await updateChecklistItemStatus({
        offerId: selectedOffer.id,
        checklistItemId: checklistItem.id,
        status
      });
      successNotice = `Checklist updated: ${checklistItem.label} -> ${checklistStatusLabel(status)}.`;
      await refreshWorkspace();
      await loadSelectedOfferDetail(selectedOffer.id);
    } catch (error) {
      actionError = normalizeUnknownError(error).message;
    } finally {
      checklistBusyItemId = null;
    }
  }

  onMount(async () => {
    await refreshWorkspace();
  });
</script>

<section class="recruiting-panel">
  <header>
    <h2>Recruiting Workspace</h2>
    <p>
      Create offers from templates, route approvals to HR Manager, capture e-signatures, and run
      onboarding workflows with validated document collection.
    </p>
  </header>

  {#if pageError}
    <p class="error" role="alert">{pageError}</p>
  {/if}

  {#if actionError}
    <p class="error" role="alert">{actionError}</p>
  {/if}

  {#if successNotice}
    <p class="notice" role="status">{successNotice}</p>
  {/if}

  {#if isLoading}
    <p class="muted">Loading recruiting workspace...</p>
  {:else if !canViewRecruiting}
    <p class="muted">Your account cannot access recruiting workflows.</p>
  {:else}
    <div class="layout-grid">
      <section class="card">
        <h3>Create offer from template</h3>
        {#if templates.length === 0}
          <p class="muted">No offer templates available yet.</p>
        {:else if !canManageRecruiting}
          <p class="muted">You can review offers but cannot create or mutate recruiting records.</p>
        {:else}
          <form on:submit={submitCreateOffer}>
            <label for="offer-template">Template</label>
            <select id="offer-template" bind:value={templateId}>
              {#each templates as template}
                <option value={template.id}>
                  {template.name} — {template.positionTitle} ({template.compensationPreview})
                </option>
              {/each}
            </select>

            <label for="candidate-name">Candidate name</label>
            <input id="candidate-name" bind:value={candidateName} autocomplete="off" />

            <label for="candidate-email">Candidate email</label>
            <input
              id="candidate-email"
              type="email"
              bind:value={candidateEmail}
              autocomplete="off"
            />

            <button type="submit" disabled={isSubmittingCreate}>
              {#if isSubmittingCreate}Creating offer...{:else}Create offer{/if}
            </button>
          </form>
        {/if}
      </section>

      <section class="card">
        <h3>Offer queue</h3>
        {#if offers.length === 0}
          <p class="muted">No offers have been created yet.</p>
        {:else}
          <ul class="offer-list">
            {#each offers as offer}
              <li class:selected={offer.id === selectedOfferId}>
                <button type="button" class="offer-select" on:click={() => selectOffer(offer.id)}>
                  <strong>{offer.candidateName}</strong>
                  <span>{offer.templateName}</span>
                  <span>{approvalStatusLabel(offer.approvalStatus)}</span>
                  <span>{onboardingStatusLabel(offer.onboardingStatus)}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    {#if selectedOffer}
      <section class="card detail-card">
        <header class="detail-header">
          <h3>Offer details</h3>
          <span class={`status ${selectedOffer.approvalStatus}`}>
            {approvalStatusLabel(selectedOffer.approvalStatus)}
          </span>
        </header>

        <div class="detail-grid">
          <p><strong>Candidate:</strong> {selectedOffer.candidateName}</p>
          <p><strong>Email:</strong> {selectedOffer.candidateEmail}</p>
          <p><strong>Position:</strong> {selectedOffer.positionTitle}</p>
          <p><strong>Department:</strong> {selectedOffer.departmentName}</p>
          <p><strong>Compensation:</strong> {selectedOffer.compensationDisplay}</p>
          <p>
            <strong>Onboarding:</strong>
            {onboardingStatusLabel(selectedOffer.onboardingStatus)}
          </p>
          <p><strong>Approval route:</strong> {selectedOffer.approvalRoutingRole}</p>
          {#if selectedOffer.rejectionReason}
            <p class="warning">
              <strong>Rejection reason:</strong>
              {selectedOffer.rejectionReason}
            </p>
          {/if}
        </div>

        <section class="subcard">
          <h4>Approval actions</h4>
          {#if canApproveRecruiting}
            <div class="actions">
              <button
                type="button"
                on:click={approveSelectedOffer}
                disabled={selectedOffer.approvalStatus !== 'pending_hr_approval' ||
                  isSubmittingApproval}
              >
                {#if isSubmittingApproval}Saving...{:else}Approve offer{/if}
              </button>
              <input
                placeholder="Reject reason"
                bind:value={rejectReason}
                disabled={selectedOffer.approvalStatus !== 'pending_hr_approval' ||
                  isSubmittingApproval}
              />
              <button
                type="button"
                class="danger"
                on:click={rejectSelectedOffer}
                disabled={selectedOffer.approvalStatus !== 'pending_hr_approval' ||
                  isSubmittingApproval}
              >
                Reject offer
              </button>
            </div>
          {:else}
            <p class="muted">Approval and rejection require HR Manager role permissions.</p>
          {/if}
        </section>

        <section class="subcard">
          <h4>E-signature capture</h4>
          <form on:submit={submitSignature}>
            <label for="typed-signer-name">Typed name (required)</label>
            <input
              id="typed-signer-name"
              bind:value={typedSignerName}
              autocomplete="off"
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <p class="muted">
              Drawn signature is optional and captured as a canvas image snapshot.
            </p>

            <SignatureCanvas
              bind:value={drawnSignatureDataUrl}
              bind:this={signatureCanvasRef}
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <button
              type="submit"
              disabled={!canManageRecruiting ||
                selectedOffer.approvalStatus !== 'approved' ||
                isSubmittingSignature}
            >
              {#if isSubmittingSignature}Saving signature...{:else}Capture signature{/if}
            </button>
          </form>

          {#if selectedOffer.signatureTypedName}
            <p class="notice">
              Signed by {selectedOffer.signatureTypedName} on
              {selectedOffer.signatureSignedAt
                ? new Date(selectedOffer.signatureSignedAt).toLocaleString()
                : '—'}.
            </p>
          {/if}
        </section>

        <section class="subcard">
          <h4>Onboarding document collection</h4>
          <form on:submit={submitOnboardingDocuments}>
            <label for="legal-name">Legal name</label>
            <input
              id="legal-name"
              bind:value={legalName}
              autocomplete="off"
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <label for="address-line1">Address line 1</label>
            <input
              id="address-line1"
              bind:value={addressLine1}
              autocomplete="off"
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <div class="triple-grid">
              <div>
                <label for="city">City</label>
                <input
                  id="city"
                  bind:value={city}
                  autocomplete="off"
                  disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
                />
              </div>
              <div>
                <label for="state-province">State / Province</label>
                <input
                  id="state-province"
                  bind:value={stateProvince}
                  autocomplete="off"
                  disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
                />
              </div>
              <div>
                <label for="postal-code">Postal code</label>
                <input
                  id="postal-code"
                  bind:value={postalCode}
                  autocomplete="off"
                  disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
                />
              </div>
            </div>

            <label for="ssn">SSN (###-##-####)</label>
            <input
              id="ssn"
              bind:value={ssn}
              autocomplete="off"
              placeholder="123-45-6789"
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <label for="emergency-contact-name">Emergency contact name</label>
            <input
              id="emergency-contact-name"
              bind:value={emergencyContactName}
              autocomplete="off"
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <label for="emergency-contact-phone">Emergency contact phone</label>
            <input
              id="emergency-contact-phone"
              bind:value={emergencyContactPhone}
              autocomplete="off"
              disabled={!canManageRecruiting || selectedOffer.approvalStatus !== 'approved'}
            />

            <button
              type="submit"
              disabled={!canManageRecruiting ||
                selectedOffer.approvalStatus !== 'approved' ||
                isSubmittingDocuments}
            >
              {#if isSubmittingDocuments}Saving documents...{:else}Save onboarding documents{/if}
            </button>
          </form>

          {#if onboardingDocument}
            <p class="notice">
              Documents saved. SSN shown as masked value: <strong
                >{onboardingDocument.ssnMasked}</strong
              >
            </p>
          {/if}
        </section>

        <section class="subcard">
          <h4>Onboarding checklist</h4>
          {#if checklistItems.length === 0}
            <p class="muted">No onboarding checklist items found.</p>
          {:else}
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Set status</th>
                </tr>
              </thead>
              <tbody>
                {#each checklistItems as checklistItem}
                  <tr>
                    <td>{checklistItem.label}</td>
                    <td>{checklistStatusLabel(checklistItem.status)}</td>
                    <td>
                      <select
                        value={checklistItem.status}
                        on:change={(event) =>
                          setChecklistStatus(
                            checklistItem,
                            (event.currentTarget as HTMLSelectElement)
                              .value as OnboardingChecklistItemView['status']
                          )}
                        disabled={!canManageRecruiting ||
                          selectedOffer.approvalStatus !== 'approved' ||
                          checklistBusyItemId === checklistItem.id}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="complete">Complete</option>
                      </select>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </section>
      </section>
    {/if}
  {/if}
</section>

<style>
  .recruiting-panel {
    background: #fff;
    border: 1px solid #d5d7dc;
    border-radius: 0.75rem;
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
  }

  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  header p {
    margin-top: 0.3rem;
    color: #4d5761;
  }

  .layout-grid {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  }

  .card {
    border: 1px solid #d0d5dd;
    border-radius: 0.6rem;
    padding: 0.8rem;
    background: #fcfcfd;
    display: grid;
    gap: 0.65rem;
  }

  .detail-card {
    margin-top: 0.4rem;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .detail-grid {
    display: grid;
    gap: 0.3rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }

  .subcard {
    border: 1px solid #d0d5dd;
    border-radius: 0.55rem;
    background: #fff;
    padding: 0.7rem;
    display: grid;
    gap: 0.6rem;
  }

  form {
    display: grid;
    gap: 0.45rem;
  }

  .triple-grid {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .triple-grid > div {
    display: grid;
    gap: 0.35rem;
  }

  input,
  select,
  button {
    font: inherit;
    padding: 0.45rem 0.6rem;
  }

  .actions {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: auto 1fr auto;
    align-items: center;
  }

  .offer-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }

  .offer-list li {
    border: 1px solid #d0d5dd;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .offer-list li.selected {
    border-color: #175cd3;
  }

  .offer-select {
    width: 100%;
    text-align: left;
    border: 0;
    background: #fff;
    display: grid;
    gap: 0.2rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #eaecf0;
    text-align: left;
    padding: 0.45rem;
  }

  .status {
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    font-size: 0.82rem;
    border: 1px solid #d0d5dd;
  }

  .status.pending_hr_approval {
    background: #fffaeb;
    color: #b54708;
    border-color: #fedf89;
  }

  .status.approved {
    background: #ecfdf3;
    color: #067647;
    border-color: #abefc6;
  }

  .status.rejected {
    background: #fef3f2;
    color: #b42318;
    border-color: #fecdca;
  }

  .error {
    color: #b42318;
  }

  .warning {
    color: #b54708;
  }

  .notice {
    color: #155eef;
  }

  .muted {
    color: #475467;
  }

  .danger {
    border-color: #d92d20;
    color: #b42318;
  }

  @media (max-width: 900px) {
    .actions {
      grid-template-columns: 1fr;
    }

    .triple-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
