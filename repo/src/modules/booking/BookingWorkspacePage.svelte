<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { hasCapability } from '../../core/permissions/service';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { sessionStore } from '../../shared/stores/session-store';
  import type { BookingStatus } from '../../core/db/database';
  import {
    cancelBooking,
    canManageBookingActions,
    createBooking,
    createOrRefreshBookingHold,
    getBookingDurationOptions,
    getBookingResources,
    listBookingAvailabilityForDate,
    listBookingsForDate,
    previewBookingConflict,
    releaseBookingHold,
    rescheduleBooking,
    todayBookingDateKey,
    type BookingAvailabilityView,
    type BookingView
  } from './booking-service';

  type WizardMode = 'create' | 'reschedule';

  const resources = getBookingResources();
  const durationOptions = getBookingDurationOptions();

  const holderTabId = crypto.randomUUID();

  let selectedDate = todayBookingDateKey();
  let availability: BookingAvailabilityView | null = null;
  let bookings: BookingView[] = [];

  let isLoadingAvailability = true;
  let isLoadingBookings = true;
  let isSubmitting = false;

  let pageError = '';
  let formError = '';
  let conflictNotice = '';
  let duplicateNotice = '';
  let successNotice = '';

  let wizardMode: WizardMode = 'create';
  let wizardStep = 1;
  let selectedBookingId: string | null = null;

  let selectedResourceId: string = resources[0]?.id ?? '';
  let selectedStartsAt = '';
  let durationMinutes: number = durationOptions[1] ?? durationOptions[0] ?? 60;

  let customerName = '';
  let partySize = 2;
  let notes = '';

  let activeHoldId: string | null = null;
  let activeHoldExpiresAt = '';
  let submitIdempotencyKey = '';

  let conflictPreviewAvailable = false;
  let conflictPreviewReason = 'Pick a slot to check live conflict status.';

  $: currentUser = $sessionStore.user;
  $: canViewBookingWorkspace = currentUser
    ? hasCapability(currentUser.roles, 'workspace.booking.view')
    : false;
  $: canManageBooking = currentUser ? canManageBookingActions(currentUser.roles) : false;

  function bookingStatusLabel(status: BookingStatus): string {
    if (status === 'late_cancelled') {
      return 'Late Cancel';
    }

    if (status === 'cancelled') {
      return 'Cancelled';
    }

    return 'Confirmed';
  }

  function clearNotices(): void {
    formError = '';
    conflictNotice = '';
    duplicateNotice = '';
    successNotice = '';
  }

  async function refreshAvailability(): Promise<void> {
    isLoadingAvailability = true;
    pageError = '';

    try {
      availability = await listBookingAvailabilityForDate(selectedDate);
    } catch (error) {
      pageError = normalizeUnknownError(error).message;
    } finally {
      isLoadingAvailability = false;
    }
  }

  async function refreshBookings(): Promise<void> {
    isLoadingBookings = true;

    try {
      bookings = await listBookingsForDate(selectedDate);
    } catch (error) {
      pageError = normalizeUnknownError(error).message;
    } finally {
      isLoadingBookings = false;
    }
  }

  async function refreshAll(): Promise<void> {
    await refreshAvailability();
    await refreshBookings();
    await refreshConflictPreview();
  }

  async function onDateChange(): Promise<void> {
    await resetWizard();
    await refreshAll();
  }

  function selectedEndsAt(): string {
    if (!selectedStartsAt) {
      return '';
    }

    return new Date(new Date(selectedStartsAt).getTime() + durationMinutes * 60_000).toISOString();
  }

  function selectedSlotLabel(): string {
    if (!selectedStartsAt) {
      return 'No slot selected';
    }

    const endsAt = selectedEndsAt();
    const start = new Date(selectedStartsAt).toLocaleString();
    const end = new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${start} -> ${end}`;
  }

  function selectedResourceLabel(): string {
    return (
      resources.find((resource) => resource.id === selectedResourceId)?.label ?? selectedResourceId
    );
  }

  async function refreshConflictPreview(): Promise<void> {
    if (!selectedResourceId || !selectedStartsAt) {
      conflictPreviewAvailable = false;
      conflictPreviewReason = 'Pick a slot to check live conflict status.';
      return;
    }

    try {
      const preview = await previewBookingConflict({
        resourceId: selectedResourceId,
        startsAt: selectedStartsAt,
        durationMinutes,
        holderTabId,
        ignoredBookingId: selectedBookingId ?? undefined,
        ignoredHoldId: activeHoldId
      });

      conflictPreviewAvailable = preview.available;
      conflictPreviewReason = preview.reason ?? 'Slot is currently available.';
    } catch (error) {
      conflictPreviewAvailable = false;
      conflictPreviewReason = normalizeUnknownError(error).message;
    }
  }

  async function selectSlot(resourceId: string, startsAt: string): Promise<void> {
    clearNotices();
    selectedResourceId = resourceId;
    selectedStartsAt = startsAt;
    await refreshConflictPreview();
  }

  async function onDurationChange(event: Event): Promise<void> {
    const nextDuration = Number((event.target as HTMLSelectElement).value);
    durationMinutes = nextDuration;
    await refreshConflictPreview();
  }

  function nextIdempotencyKey(operation: 'create' | 'reschedule' | 'cancel'): string {
    return `${operation}:${holderTabId}:${Date.now()}:${crypto.randomUUID()}`;
  }

  async function goToDetailsStep(): Promise<void> {
    clearNotices();

    if (!canManageBooking) {
      return;
    }

    if (!selectedResourceId || !selectedStartsAt) {
      conflictNotice = 'Select a schedule slot before continuing.';
      return;
    }

    if (!conflictPreviewAvailable) {
      conflictNotice = conflictPreviewReason || 'Selected slot is currently unavailable.';
      return;
    }

    isSubmitting = true;
    try {
      const hold = await createOrRefreshBookingHold({
        resourceId: selectedResourceId,
        startsAt: selectedStartsAt,
        durationMinutes,
        holderTabId,
        holdId: activeHoldId
      });

      activeHoldId = hold.holdId;
      activeHoldExpiresAt = hold.expiresAt;
      wizardStep = 2;
      successNotice = 'Slot hold placed. Complete booking details.';
      conflictNotice = '';
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      if (normalized.code === 'CONFLICT' || normalized.code === 'LOCK_UNAVAILABLE') {
        conflictNotice = normalized.message;
      } else {
        formError = normalized.message;
      }
    } finally {
      isSubmitting = false;
    }
  }

  function goBackToSlotStep(): void {
    wizardStep = 1;
    submitIdempotencyKey = '';
  }

  function goToReviewStep(): void {
    clearNotices();

    if (!customerName.trim()) {
      formError = 'Customer name is required.';
      return;
    }

    if (partySize < 1) {
      formError = 'Party size must be at least 1.';
      return;
    }

    wizardStep = 3;
    if (!submitIdempotencyKey) {
      submitIdempotencyKey = nextIdempotencyKey(wizardMode === 'create' ? 'create' : 'reschedule');
    }
  }

  async function submitWizardBooking(): Promise<void> {
    if (!canManageBooking || !selectedResourceId || !selectedStartsAt) {
      return;
    }

    clearNotices();
    isSubmitting = true;

    try {
      if (wizardMode === 'create') {
        await createBooking({
          resourceId: selectedResourceId,
          startsAt: selectedStartsAt,
          durationMinutes,
          customerName,
          partySize,
          notes,
          holderTabId,
          holdId: activeHoldId,
          idempotencyKey: submitIdempotencyKey || nextIdempotencyKey('create')
        });

        successNotice = 'Booking created successfully.';
      } else {
        if (!selectedBookingId) {
          throw new Error('No booking selected for reschedule.');
        }

        await rescheduleBooking({
          bookingId: selectedBookingId,
          resourceId: selectedResourceId,
          startsAt: selectedStartsAt,
          durationMinutes,
          holderTabId,
          holdId: activeHoldId,
          idempotencyKey: submitIdempotencyKey || nextIdempotencyKey('reschedule')
        });

        successNotice = 'Booking rescheduled successfully.';
      }

      await resetWizard();
      await refreshAll();
    } catch (error) {
      const normalized = normalizeUnknownError(error);

      if (normalized.code === 'DUPLICATE_REQUEST') {
        duplicateNotice = normalized.message;
      } else if (normalized.code === 'CONFLICT' || normalized.code === 'LOCK_UNAVAILABLE') {
        conflictNotice = normalized.message;
      } else {
        formError = normalized.message;
      }

      await refreshConflictPreview();
    } finally {
      isSubmitting = false;
    }
  }

  async function resetWizard(): Promise<void> {
    if (activeHoldId) {
      try {
        await releaseBookingHold(activeHoldId);
      } catch {
        // Best-effort cleanup; recovery sweep handles stale holds.
      }
    }

    wizardMode = 'create';
    wizardStep = 1;
    selectedBookingId = null;
    selectedResourceId = resources[0]?.id ?? '';
    selectedStartsAt = '';
    durationMinutes = durationOptions[1] ?? durationOptions[0] ?? 60;
    customerName = '';
    partySize = 2;
    notes = '';
    activeHoldId = null;
    activeHoldExpiresAt = '';
    submitIdempotencyKey = '';
    conflictPreviewAvailable = false;
    conflictPreviewReason = 'Pick a slot to check live conflict status.';
  }

  async function startReschedule(booking: BookingView): Promise<void> {
    clearNotices();
    await resetWizard();

    wizardMode = 'reschedule';
    selectedBookingId = booking.id;
    selectedResourceId = booking.resourceId;
    selectedStartsAt = booking.startsAt;
    durationMinutes = Math.max(
      durationOptions[0],
      Math.round(
        (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60_000
      )
    );
    customerName = booking.customerName;
    partySize = booking.partySize;
    notes = booking.notes;
    wizardStep = 1;

    await refreshConflictPreview();
  }

  async function cancelBookingRecord(booking: BookingView): Promise<void> {
    if (!canManageBooking || booking.status !== 'confirmed') {
      return;
    }

    clearNotices();
    isSubmitting = true;

    try {
      const cancelled = await cancelBooking({
        bookingId: booking.id,
        idempotencyKey: nextIdempotencyKey('cancel'),
        reason: 'Operator cancellation request'
      });

      successNotice =
        cancelled.status === 'late_cancelled'
          ? 'Booking cancelled as Late Cancel (within 2 hours of start).'
          : 'Booking cancelled (free cancellation window).';

      await refreshAll();
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      if (normalized.code === 'DUPLICATE_REQUEST') {
        duplicateNotice = normalized.message;
      } else if (normalized.code === 'CONFLICT' || normalized.code === 'LOCK_UNAVAILABLE') {
        conflictNotice = normalized.message;
      } else {
        formError = normalized.message;
      }
    } finally {
      isSubmitting = false;
    }
  }

  onMount(async () => {
    await refreshAll();
  });

  onDestroy(() => {
    if (activeHoldId) {
      void releaseBookingHold(activeHoldId);
    }
  });
</script>

<section class="booking-console">
  <header>
    <h2>Booking Desk</h2>
    <p>Track schedule availability and run guided booking create/reschedule/cancel operations.</p>
  </header>

  {#if !canViewBookingWorkspace}
    <p class="error" role="alert">You do not have access to Booking Desk.</p>
  {:else}
    {#if pageError}
      <p class="error" role="alert">{pageError}</p>
    {/if}

    {#if formError}
      <p class="error" role="alert">{formError}</p>
    {/if}

    {#if conflictNotice}
      <p class="warning" role="alert">{conflictNotice}</p>
    {/if}

    {#if duplicateNotice}
      <p class="warning" role="status">{duplicateNotice}</p>
    {/if}

    {#if successNotice}
      <p class="notice" role="status">{successNotice}</p>
    {/if}

    <section class="card controls">
      <label for="booking-date">Schedule date</label>
      <input id="booking-date" type="date" bind:value={selectedDate} on:change={onDateChange} />
      <button type="button" on:click={refreshAll} disabled={isSubmitting}>Refresh schedule</button>
    </section>

    <section class="layout-grid">
      <section class="card schedule-card">
        <h3>Availability schedule</h3>

        {#if isLoadingAvailability}
          <p class="muted">Loading schedule...</p>
        {:else if !availability || availability.rows.length === 0}
          <p class="muted">No schedule slots found for the selected day.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Time</th>
                {#each resources as resource}
                  <th>{resource.label}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each availability.rows as row}
                <tr>
                  <td>{row.slotLabel}</td>
                  {#each row.cells as cell}
                    <td>
                      {#if cell.state === 'available'}
                        <button
                          type="button"
                          class:selected={selectedResourceId === cell.resourceId &&
                            selectedStartsAt === row.slotStartsAt}
                          on:click={() => selectSlot(cell.resourceId, row.slotStartsAt)}
                          disabled={!canManageBooking || isSubmitting}
                        >
                          Select
                        </button>
                      {:else if cell.state === 'booked'}
                        <span class="slot blocked">Booked</span>
                      {:else}
                        <span class="slot held">Held</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

      <section class="card wizard-card">
        <h3>{wizardMode === 'create' ? 'Guided booking flow' : 'Guided reschedule flow'}</h3>
        <p class="step-label">Step {wizardStep} of 3</p>

        {#if !canManageBooking}
          <p class="muted">
            Your role can view schedule availability but cannot perform booking mutations.
          </p>
        {:else if wizardStep === 1}
          <div class="wizard-step">
            <p>
              Selected slot: <strong>{selectedSlotLabel()}</strong>
            </p>

            <label for="duration-select">Duration</label>
            <select id="duration-select" bind:value={durationMinutes} on:change={onDurationChange}>
              {#each durationOptions as duration}
                <option value={duration}>{duration} minutes</option>
              {/each}
            </select>

            <p class={conflictPreviewAvailable ? 'notice' : 'warning'}>{conflictPreviewReason}</p>

            <button
              type="button"
              on:click={goToDetailsStep}
              disabled={!selectedStartsAt || !conflictPreviewAvailable || isSubmitting}
            >
              {#if isSubmitting}Holding slot...{:else}Continue to details{/if}
            </button>
          </div>
        {:else if wizardStep === 2}
          <form class="wizard-step" on:submit|preventDefault={goToReviewStep}>
            <p>
              Holding <strong>{selectedResourceLabel()}</strong> at
              <strong>{selectedSlotLabel()}</strong>
            </p>

            {#if activeHoldExpiresAt}
              <p class="muted">
                Hold expires at {new Date(activeHoldExpiresAt).toLocaleTimeString()}.
              </p>
            {/if}

            <label for="customer-name">Customer name</label>
            <input id="customer-name" bind:value={customerName} autocomplete="off" />

            <label for="party-size">Party size</label>
            <input id="party-size" type="number" min="1" max="20" bind:value={partySize} />

            <label for="booking-notes">Notes</label>
            <textarea id="booking-notes" rows="3" bind:value={notes}></textarea>

            <div class="wizard-actions">
              <button type="button" on:click={goBackToSlotStep} disabled={isSubmitting}>Back</button
              >
              <button type="submit" disabled={isSubmitting}>Review booking</button>
            </div>
          </form>
        {:else}
          <div class="wizard-step">
            <p><strong>Resource:</strong> {selectedResourceLabel()}</p>
            <p><strong>Slot:</strong> {selectedSlotLabel()}</p>
            <p><strong>Customer:</strong> {customerName}</p>
            <p><strong>Party size:</strong> {partySize}</p>
            <p><strong>Notes:</strong> {notes || '—'}</p>

            <div class="wizard-actions">
              <button type="button" on:click={() => (wizardStep = 2)} disabled={isSubmitting}
                >Edit</button
              >
              <button type="button" on:click={submitWizardBooking} disabled={isSubmitting}>
                {#if isSubmitting}
                  Submitting...
                {:else if wizardMode === 'create'}
                  Confirm booking
                {:else}
                  Confirm reschedule
                {/if}
              </button>
            </div>
          </div>
        {/if}

        <button type="button" class="ghost" on:click={resetWizard} disabled={isSubmitting}>
          Reset flow
        </button>
      </section>
    </section>

    <section class="card">
      <h3>Bookings for {selectedDate}</h3>
      {#if isLoadingBookings}
        <p class="muted">Loading bookings...</p>
      {:else if bookings.length === 0}
        <p class="muted">No bookings found for this day.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Resource</th>
              <th>Slot</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each bookings as booking}
              <tr>
                <td>{booking.customerName} ({booking.partySize})</td>
                <td>{booking.resourceLabel}</td>
                <td>
                  {new Date(booking.startsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  -
                  {new Date(booking.endsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td>
                  <span class={`status ${booking.status}`}
                    >{bookingStatusLabel(booking.status)}</span
                  >
                </td>
                <td class="actions">
                  <button
                    type="button"
                    on:click={() => startReschedule(booking)}
                    disabled={!canManageBooking || booking.status !== 'confirmed' || isSubmitting}
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    on:click={() => cancelBookingRecord(booking)}
                    disabled={!canManageBooking || booking.status !== 'confirmed' || isSubmitting}
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}
</section>

<style>
  .booking-console {
    background: #fff;
    border: 1px solid #d0d5dd;
    border-radius: 0.8rem;
    padding: 1rem;
    display: grid;
    gap: 0.95rem;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  header p {
    margin-top: 0.3rem;
    color: #4d5761;
  }

  .controls {
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 0.6rem;
  }

  .layout-grid {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: 1.25fr 1fr;
  }

  .card {
    border: 1px solid #d0d5dd;
    border-radius: 0.6rem;
    padding: 0.8rem;
    background: #fcfcfd;
    display: grid;
    gap: 0.65rem;
  }

  .step-label {
    font-size: 0.86rem;
    color: #4d5761;
  }

  .wizard-step {
    display: grid;
    gap: 0.55rem;
  }

  .wizard-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #eaecf0;
    text-align: left;
    padding: 0.5rem;
    vertical-align: top;
  }

  input,
  select,
  textarea,
  button {
    font: inherit;
    padding: 0.45rem 0.6rem;
  }

  button.selected {
    border-color: #175cd3;
    background: #eef4ff;
  }

  .slot {
    font-size: 0.82rem;
    display: inline-block;
    border-radius: 999px;
    padding: 0.18rem 0.45rem;
    border: 1px solid #d0d5dd;
  }

  .slot.blocked {
    color: #b42318;
    background: #fee4e2;
    border-color: #fda29b;
  }

  .slot.held {
    color: #b54708;
    background: #fffaeb;
    border-color: #fdb022;
  }

  .status {
    font-size: 0.82rem;
    border: 1px solid #d0d5dd;
    border-radius: 999px;
    display: inline-block;
    padding: 0.2rem 0.5rem;
  }

  .status.confirmed {
    color: #027a48;
  }

  .status.cancelled {
    color: #1d2939;
  }

  .status.late_cancelled {
    color: #b42318;
  }

  .actions {
    display: flex;
    gap: 0.45rem;
  }

  .ghost {
    background: transparent;
  }

  .notice {
    color: #027a48;
  }

  .warning {
    color: #b54708;
  }

  .error {
    color: #b42318;
  }

  .muted {
    color: #4d5761;
  }

  @media (max-width: 1080px) {
    .layout-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .controls {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .actions,
    .wizard-actions {
      flex-direction: column;
    }
  }
</style>
