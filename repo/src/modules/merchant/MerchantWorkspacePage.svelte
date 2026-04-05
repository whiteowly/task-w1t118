<script lang="ts">
  import { onMount } from 'svelte';

  import { hasCapability } from '../../core/permissions/service';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { sessionStore } from '../../shared/stores/session-store';
  import { AMENITY_OPTIONS, MERCHANT_TAG_OPTIONS } from './merchant-config';
  import RecordDrawer from './components/RecordDrawer.svelte';
  import WorkflowTransitionModal from './components/WorkflowTransitionModal.svelte';
  import {
    canEditDraftActions,
    canReviewPublishActions,
    compareMerchantVersions,
    createCombo,
    createMediaAsset,
    createMenu,
    createMerchantDraft,
    createStore,
    getMediaAssetDataUrl,
    isWorkflowTransitionAllowed,
    listCombos,
    listMenus,
    listMerchants,
    listMerchantVersions,
    listStores,
    publishMerchant,
    rejectMerchant,
    submitMerchantForReview,
    updateCombo,
    updateMenu,
    updateMerchantDraft,
    updateStore,
    approveMerchant
  } from './merchant-service';
  import { validateMerchantImageFile } from './merchant-validation';

  type MerchantWorkflowAction = 'submit' | 'approve' | 'reject' | 'publish';

  interface MerchantView {
    id: string;
    workflowState: 'draft' | 'in_review' | 'approved' | 'rejected' | 'published';
    latestVersionNo: number;
    draftVersionNo: number;
    inReviewVersionNo: number | null;
    publishedVersionNo: number | null;
    rejectionReason: string | null;
    snapshot: {
      name: string;
      description: string;
      tags: string[];
      amenities: string[];
      imageAssetId: string | null;
    };
    createdAt: string;
    updatedAt: string;
  }

  interface StoreView {
    id: string;
    merchantId: string;
    name: string;
    description: string;
    tags: string[];
    amenities: string[];
    imageAssetId: string | null;
    updatedAt: string;
  }

  interface MenuView {
    id: string;
    storeId: string;
    name: string;
    description: string;
    updatedAt: string;
  }

  interface ComboView {
    id: string;
    menuId: string;
    name: string;
    description: string;
    priceLabel: string;
    updatedAt: string;
  }

  interface VersionView {
    versionNo: number;
    snapshot: {
      name: string;
      description: string;
      tags: string[];
      amenities: string[];
      imageAssetId: string | null;
    };
    createdAt: string;
  }

  let merchants: MerchantView[] = [];
  let stores: StoreView[] = [];
  let menus: MenuView[] = [];
  let combos: ComboView[] = [];
  let merchantVersions: VersionView[] = [];

  let selectedMerchantId: string | null = null;
  let selectedStoreId: string | null = null;
  let selectedMenuId: string | null = null;

  let isLoadingMerchants = true;
  let isLoadingStores = false;
  let isLoadingMenus = false;
  let isLoadingCombos = false;
  let isSubmitting = false;

  let pageError = '';
  let formError = '';
  let inlineError = '';
  let notice = '';

  let merchantCreateName = '';
  let storeCreateName = '';
  let menuCreateName = '';
  let comboCreateName = '';

  let merchantDrawerOpen = false;
  let merchantDrawerTarget: MerchantView | null = null;
  let merchantDraftName = '';
  let merchantDraftDescription = '';
  let merchantDraftTags: string[] = [];
  let merchantDraftAmenities: string[] = [];
  let merchantDraftImagePreview = '';
  let merchantDraftImageFile: File | null = null;

  let storeDrawerOpen = false;
  let storeDrawerTarget: StoreView | null = null;
  let storeDraftName = '';
  let storeDraftDescription = '';
  let storeDraftTags: string[] = [];
  let storeDraftAmenities: string[] = [];
  let storeDraftImagePreview = '';
  let storeDraftImageFile: File | null = null;

  let menuDrawerOpen = false;
  let menuDrawerTarget: MenuView | null = null;
  let menuDraftName = '';
  let menuDraftDescription = '';

  let comboDrawerOpen = false;
  let comboDrawerTarget: ComboView | null = null;
  let comboDraftName = '';
  let comboDraftDescription = '';
  let comboDraftPriceLabel = '';

  let workflowModalOpen = false;
  let workflowModalAction: MerchantWorkflowAction | null = null;
  let workflowModalMerchant: MerchantView | null = null;

  let compareLeftVersionNo: number | null = null;
  let compareRightVersionNo: number | null = null;
  let compareLeftSnapshot = '';
  let compareRightSnapshot = '';
  let compareError = '';

  $: currentUser = $sessionStore.user;
  $: canEditDraft = currentUser ? canEditDraftActions(currentUser.roles) : false;
  $: canReviewPublish = currentUser ? canReviewPublishActions(currentUser.roles) : false;
  $: canViewMerchantWorkspace = currentUser
    ? hasCapability(currentUser.roles, 'workspace.merchant.view')
    : false;
  $: selectedMerchant = selectedMerchantId
    ? (merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null)
    : null;
  $: nestedEditBlockedByWorkflow =
    selectedMerchant?.workflowState === 'in_review' ||
    selectedMerchant?.workflowState === 'approved';
  $: merchantDrawerEditBlocked =
    merchantDrawerTarget?.workflowState === 'in_review' ||
    merchantDrawerTarget?.workflowState === 'approved';

  function clearMessages(): void {
    formError = '';
    inlineError = '';
    notice = '';
  }

  async function refreshMerchants(): Promise<void> {
    isLoadingMerchants = true;
    pageError = '';
    try {
      merchants = await listMerchants();

      if (selectedMerchantId) {
        const stillExists = merchants.some((merchant) => merchant.id === selectedMerchantId);
        if (!stillExists) {
          selectedMerchantId = null;
          selectedStoreId = null;
          selectedMenuId = null;
        }
      }
    } catch (error) {
      pageError = normalizeUnknownError(error).message;
    } finally {
      isLoadingMerchants = false;
    }
  }

  async function refreshStores(): Promise<void> {
    if (!selectedMerchantId) {
      stores = [];
      return;
    }

    isLoadingStores = true;
    try {
      stores = await listStores(selectedMerchantId);

      if (selectedStoreId && !stores.some((store) => store.id === selectedStoreId)) {
        selectedStoreId = null;
        selectedMenuId = null;
      }
    } catch (error) {
      inlineError = normalizeUnknownError(error).message;
    } finally {
      isLoadingStores = false;
    }
  }

  async function refreshMenus(): Promise<void> {
    if (!selectedStoreId) {
      menus = [];
      return;
    }

    isLoadingMenus = true;
    try {
      menus = await listMenus(selectedStoreId);

      if (selectedMenuId && !menus.some((menu) => menu.id === selectedMenuId)) {
        selectedMenuId = null;
      }
    } catch (error) {
      inlineError = normalizeUnknownError(error).message;
    } finally {
      isLoadingMenus = false;
    }
  }

  async function refreshCombos(): Promise<void> {
    if (!selectedMenuId) {
      combos = [];
      return;
    }

    isLoadingCombos = true;
    try {
      combos = await listCombos(selectedMenuId);
    } catch (error) {
      inlineError = normalizeUnknownError(error).message;
    } finally {
      isLoadingCombos = false;
    }
  }

  async function refreshVersions(): Promise<void> {
    compareError = '';
    compareLeftSnapshot = '';
    compareRightSnapshot = '';

    if (!selectedMerchantId) {
      merchantVersions = [];
      compareLeftVersionNo = null;
      compareRightVersionNo = null;
      return;
    }

    try {
      merchantVersions = await listMerchantVersions(selectedMerchantId);

      if (merchantVersions.length >= 2) {
        compareLeftVersionNo = merchantVersions[0].versionNo;
        compareRightVersionNo = merchantVersions[1].versionNo;
      } else if (merchantVersions.length === 1) {
        compareLeftVersionNo = merchantVersions[0].versionNo;
        compareRightVersionNo = merchantVersions[0].versionNo;
      } else {
        compareLeftVersionNo = null;
        compareRightVersionNo = null;
      }

      await runCompare();
    } catch (error) {
      compareError = normalizeUnknownError(error).message;
    }
  }

  async function runCompare(): Promise<void> {
    if (!selectedMerchantId || compareLeftVersionNo === null || compareRightVersionNo === null) {
      compareLeftSnapshot = '';
      compareRightSnapshot = '';
      return;
    }

    try {
      const compared = await compareMerchantVersions(
        selectedMerchantId,
        compareLeftVersionNo,
        compareRightVersionNo
      );
      compareLeftSnapshot = JSON.stringify(compared.left.snapshot, null, 2);
      compareRightSnapshot = JSON.stringify(compared.right.snapshot, null, 2);
      compareError = '';
    } catch (error) {
      compareError = normalizeUnknownError(error).message;
    }
  }

  async function chooseMerchant(merchantId: string): Promise<void> {
    selectedMerchantId = merchantId;
    selectedStoreId = null;
    selectedMenuId = null;
    await refreshStores();
    await refreshMenus();
    await refreshCombos();
    await refreshVersions();
  }

  async function chooseStore(storeId: string): Promise<void> {
    selectedStoreId = storeId;
    selectedMenuId = null;
    await refreshMenus();
    await refreshCombos();
  }

  async function chooseMenu(menuId: string): Promise<void> {
    selectedMenuId = menuId;
    await refreshCombos();
  }

  async function createMerchantRecord(): Promise<void> {
    if (!canEditDraft) {
      return;
    }

    clearMessages();
    isSubmitting = true;

    try {
      const created = await createMerchantDraft({
        name: merchantCreateName,
        description: '',
        tags: [],
        amenities: []
      });
      merchantCreateName = '';
      notice = 'Merchant draft created.';
      await refreshMerchants();
      await chooseMerchant(created.id);
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  async function createStoreRecord(): Promise<void> {
    if (!canEditDraft || !selectedMerchantId) {
      return;
    }

    clearMessages();
    isSubmitting = true;

    try {
      const created = await createStore({
        merchantId: selectedMerchantId,
        name: storeCreateName,
        description: '',
        tags: [],
        amenities: [],
        imageAssetId: null
      });
      storeCreateName = '';
      notice = 'Store created.';
      await refreshStores();
      await chooseStore(created.id);
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  async function createMenuRecord(): Promise<void> {
    if (!canEditDraft || !selectedStoreId) {
      return;
    }

    clearMessages();
    isSubmitting = true;

    try {
      const created = await createMenu({
        storeId: selectedStoreId,
        name: menuCreateName,
        description: ''
      });
      menuCreateName = '';
      notice = 'Menu created.';
      await refreshMenus();
      await chooseMenu(created.id);
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  async function createComboRecord(): Promise<void> {
    if (!canEditDraft || !selectedMenuId) {
      return;
    }

    clearMessages();
    isSubmitting = true;

    try {
      await createCombo({
        menuId: selectedMenuId,
        name: comboCreateName,
        description: '',
        priceLabel: 'TBD'
      });
      comboCreateName = '';
      notice = 'Combo created.';
      await refreshCombos();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  async function saveMerchantInlineName(merchant: MerchantView, name: string): Promise<void> {
    if (!canEditDraft) {
      return;
    }

    inlineError = '';
    try {
      await updateMerchantDraft({
        merchantId: merchant.id,
        expectedVersionNo: merchant.latestVersionNo,
        name,
        description: merchant.snapshot.description,
        tags: merchant.snapshot.tags,
        amenities: merchant.snapshot.amenities,
        imageAssetId: merchant.snapshot.imageAssetId
      });
      await refreshMerchants();
      await refreshVersions();
      notice = 'Merchant name updated.';
    } catch (error) {
      inlineError = normalizeUnknownError(error).message;
    }
  }

  async function openMerchantDrawer(merchant: MerchantView): Promise<void> {
    merchantDrawerTarget = merchant;
    merchantDraftName = merchant.snapshot.name;
    merchantDraftDescription = merchant.snapshot.description;
    merchantDraftTags = [...merchant.snapshot.tags];
    merchantDraftAmenities = [...merchant.snapshot.amenities];
    merchantDraftImageFile = null;
    merchantDraftImagePreview = (await getMediaAssetDataUrl(merchant.snapshot.imageAssetId)) ?? '';
    merchantDrawerOpen = true;
  }

  async function saveMerchantDrawer(): Promise<void> {
    if (!merchantDrawerTarget || !canEditDraft) {
      return;
    }

    formError = '';
    isSubmitting = true;

    try {
      let imageAssetId = merchantDrawerTarget.snapshot.imageAssetId;

      if (merchantDraftImageFile) {
        validateMerchantImageFile(merchantDraftImageFile);
        const media = await createMediaAsset({
          ownerType: 'merchant',
          ownerId: merchantDrawerTarget.id,
          file: merchantDraftImageFile
        });
        imageAssetId = media.assetId;
      }

      await updateMerchantDraft({
        merchantId: merchantDrawerTarget.id,
        expectedVersionNo: merchantDrawerTarget.latestVersionNo,
        name: merchantDraftName,
        description: merchantDraftDescription,
        tags: merchantDraftTags,
        amenities: merchantDraftAmenities,
        imageAssetId
      });

      merchantDrawerOpen = false;
      notice = 'Merchant draft saved.';
      await refreshMerchants();
      await refreshVersions();
      if (selectedMerchantId) {
        await refreshStores();
      }
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  function updateSelection(values: string[], value: string): string[] {
    if (values.includes(value)) {
      return values.filter((entry) => entry !== value);
    }

    return [...values, value];
  }

  function onMerchantFileSelected(event: Event): void {
    formError = '';
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      validateMerchantImageFile(file);
      merchantDraftImageFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        merchantDraftImagePreview = reader.result?.toString() ?? '';
      };
      reader.readAsDataURL(file);
    } catch (error) {
      merchantDraftImageFile = null;
      formError = normalizeUnknownError(error).message;
    }
  }

  async function openStoreDrawer(store: StoreView): Promise<void> {
    storeDrawerTarget = store;
    storeDraftName = store.name;
    storeDraftDescription = store.description;
    storeDraftTags = [...store.tags];
    storeDraftAmenities = [...store.amenities];
    storeDraftImageFile = null;
    storeDraftImagePreview = (await getMediaAssetDataUrl(store.imageAssetId)) ?? '';
    storeDrawerOpen = true;
  }

  function onStoreFileSelected(event: Event): void {
    formError = '';
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      validateMerchantImageFile(file);
      storeDraftImageFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        storeDraftImagePreview = reader.result?.toString() ?? '';
      };
      reader.readAsDataURL(file);
    } catch (error) {
      storeDraftImageFile = null;
      formError = normalizeUnknownError(error).message;
    }
  }

  async function saveStoreDrawer(): Promise<void> {
    if (!storeDrawerTarget || !canEditDraft) {
      return;
    }

    formError = '';
    isSubmitting = true;

    try {
      let imageAssetId = storeDrawerTarget.imageAssetId;
      if (storeDraftImageFile) {
        validateMerchantImageFile(storeDraftImageFile);
        const media = await createMediaAsset({
          ownerType: 'store',
          ownerId: storeDrawerTarget.id,
          file: storeDraftImageFile
        });
        imageAssetId = media.assetId;
      }

      await updateStore({
        storeId: storeDrawerTarget.id,
        name: storeDraftName,
        description: storeDraftDescription,
        tags: storeDraftTags,
        amenities: storeDraftAmenities,
        imageAssetId
      });

      storeDrawerOpen = false;
      notice = 'Store details saved.';
      await refreshStores();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  function openMenuDrawer(menu: MenuView): void {
    menuDrawerTarget = menu;
    menuDraftName = menu.name;
    menuDraftDescription = menu.description;
    menuDrawerOpen = true;
  }

  async function saveMenuDrawer(): Promise<void> {
    if (!menuDrawerTarget || !canEditDraft) {
      return;
    }

    formError = '';
    isSubmitting = true;

    try {
      await updateMenu({
        menuId: menuDrawerTarget.id,
        name: menuDraftName,
        description: menuDraftDescription
      });
      menuDrawerOpen = false;
      notice = 'Menu updated.';
      await refreshMenus();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  function openComboDrawer(combo: ComboView): void {
    comboDrawerTarget = combo;
    comboDraftName = combo.name;
    comboDraftDescription = combo.description;
    comboDraftPriceLabel = combo.priceLabel;
    comboDrawerOpen = true;
  }

  async function saveComboDrawer(): Promise<void> {
    if (!comboDrawerTarget || !canEditDraft) {
      return;
    }

    formError = '';
    isSubmitting = true;

    try {
      await updateCombo({
        comboId: comboDrawerTarget.id,
        name: comboDraftName,
        description: comboDraftDescription,
        priceLabel: comboDraftPriceLabel
      });
      comboDrawerOpen = false;
      notice = 'Combo updated.';
      await refreshCombos();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  function openWorkflowModal(merchant: MerchantView, action: MerchantWorkflowAction): void {
    workflowModalMerchant = merchant;
    workflowModalAction = action;
    workflowModalOpen = true;
  }

  function closeWorkflowModal(): void {
    workflowModalOpen = false;
    workflowModalAction = null;
    workflowModalMerchant = null;
  }

  function workflowActionLabel(action: MerchantWorkflowAction | null): string {
    if (!action) return '';
    if (action === 'submit') return 'Submit for review';
    if (action === 'approve') return 'Approve';
    if (action === 'reject') return 'Reject';
    return 'Publish';
  }

  async function executeWorkflowTransition(reason?: string): Promise<void> {
    if (!workflowModalAction || !workflowModalMerchant) return;

    formError = '';
    isSubmitting = true;
    try {
      if (workflowModalAction === 'submit') {
        await submitMerchantForReview({ merchantId: workflowModalMerchant.id, reason });
        notice = 'Merchant submitted for review.';
      } else if (workflowModalAction === 'approve') {
        await approveMerchant({ merchantId: workflowModalMerchant.id, reason });
        notice = 'Merchant approved.';
      } else if (workflowModalAction === 'reject') {
        await rejectMerchant({ merchantId: workflowModalMerchant.id, reason });
        notice = 'Merchant rejected.';
      } else {
        await publishMerchant({ merchantId: workflowModalMerchant.id, reason });
        notice = 'Merchant published.';
      }

      closeWorkflowModal();
      await refreshMerchants();
      await refreshVersions();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isSubmitting = false;
    }
  }

  onMount(async () => {
    await refreshMerchants();
  });
</script>

<section class="merchant-console">
  <header>
    <h2>Merchant Console</h2>
    <p>Manage merchant content records, review workflow transitions, and version comparisons.</p>
  </header>

  {#if !canViewMerchantWorkspace}
    <p class="error">You do not have access to Merchant Console.</p>
  {:else}
    {#if pageError}
      <p class="error" role="alert">{pageError}</p>
    {/if}

    {#if formError}
      <p class="error" role="alert">{formError}</p>
    {/if}

    {#if inlineError}
      <p class="error" role="alert">{inlineError}</p>
    {/if}

    {#if notice}
      <p class="notice" role="status">{notice}</p>
    {/if}

    <div class="create-row">
      <label for="merchant-create-name">New merchant</label>
      <input
        id="merchant-create-name"
        bind:value={merchantCreateName}
        placeholder="Merchant name"
      />
      <button
        type="button"
        on:click={createMerchantRecord}
        disabled={!canEditDraft || isSubmitting}
      >
        Create draft merchant
      </button>
    </div>

    {#if isLoadingMerchants}
      <p class="muted">Loading merchants...</p>
    {:else if merchants.length === 0}
      <p class="muted">No merchants yet. Create a draft merchant to begin.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Workflow</th>
            <th>Version</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each merchants as merchant}
            <tr class:selected={selectedMerchantId === merchant.id}>
              <td>
                <button type="button" class="row-link" on:click={() => chooseMerchant(merchant.id)}>
                  {merchant.snapshot.name}
                </button>

                {#if canEditDraft}
                  <div class="inline-edit">
                    <input
                      aria-label={`Rename ${merchant.snapshot.name}`}
                      value={merchant.snapshot.name}
                      on:change={(event) =>
                        saveMerchantInlineName(merchant, (event.target as HTMLInputElement).value)}
                      disabled={merchant.workflowState === 'in_review' ||
                        merchant.workflowState === 'approved'}
                    />
                  </div>
                {/if}
              </td>
              <td>
                <span class={`state ${merchant.workflowState}`}>{merchant.workflowState}</span>
                {#if merchant.rejectionReason}
                  <p class="reason">{merchant.rejectionReason}</p>
                {/if}
              </td>
              <td>v{merchant.latestVersionNo}</td>
              <td class="actions">
                <button type="button" on:click={() => openMerchantDrawer(merchant)}>
                  Edit details
                </button>

                {#if canEditDraft && isWorkflowTransitionAllowed(merchant.workflowState, 'submit')}
                  <button type="button" on:click={() => openWorkflowModal(merchant, 'submit')}>
                    Submit
                  </button>
                {/if}

                {#if canReviewPublish && isWorkflowTransitionAllowed(merchant.workflowState, 'approve')}
                  <button type="button" on:click={() => openWorkflowModal(merchant, 'approve')}>
                    Approve
                  </button>
                {/if}

                {#if canReviewPublish && isWorkflowTransitionAllowed(merchant.workflowState, 'reject')}
                  <button type="button" on:click={() => openWorkflowModal(merchant, 'reject')}>
                    Reject
                  </button>
                {/if}

                {#if canReviewPublish && isWorkflowTransitionAllowed(merchant.workflowState, 'publish')}
                  <button type="button" on:click={() => openWorkflowModal(merchant, 'publish')}>
                    Publish
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if selectedMerchantId}
      <section class="sub-entities">
        <h3>Stores</h3>
        <div class="create-row">
          <label for="store-create-name">New store</label>
          <input id="store-create-name" bind:value={storeCreateName} placeholder="Store name" />
          <button
            type="button"
            on:click={createStoreRecord}
            disabled={!canEditDraft || nestedEditBlockedByWorkflow || isSubmitting}
          >
            Add store
          </button>
        </div>

        {#if canEditDraft && nestedEditBlockedByWorkflow}
          <p class="muted">
            Store/menu/combo edits are blocked while merchant is in review or approved.
          </p>
        {/if}

        {#if isLoadingStores}
          <p class="muted">Loading stores...</p>
        {:else if stores.length === 0}
          <p class="muted">No stores for this merchant yet.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each stores as store}
                <tr class:selected={selectedStoreId === store.id}>
                  <td>
                    <button type="button" class="row-link" on:click={() => chooseStore(store.id)}>
                      {store.name}
                    </button>
                  </td>
                  <td>{new Date(store.updatedAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      on:click={() => openStoreDrawer(store)}
                      disabled={!canEditDraft || nestedEditBlockedByWorkflow}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}

    {#if selectedStoreId}
      <section class="sub-entities">
        <h3>Menus</h3>
        <div class="create-row">
          <label for="menu-create-name">New menu</label>
          <input id="menu-create-name" bind:value={menuCreateName} placeholder="Menu name" />
          <button
            type="button"
            on:click={createMenuRecord}
            disabled={!canEditDraft || nestedEditBlockedByWorkflow || isSubmitting}
          >
            Add menu
          </button>
        </div>

        {#if isLoadingMenus}
          <p class="muted">Loading menus...</p>
        {:else if menus.length === 0}
          <p class="muted">No menus for this store yet.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Menu</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each menus as menu}
                <tr class:selected={selectedMenuId === menu.id}>
                  <td>
                    <button type="button" class="row-link" on:click={() => chooseMenu(menu.id)}>
                      {menu.name}
                    </button>
                  </td>
                  <td>{new Date(menu.updatedAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      on:click={() => openMenuDrawer(menu)}
                      disabled={!canEditDraft || nestedEditBlockedByWorkflow}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}

    {#if selectedMenuId}
      <section class="sub-entities">
        <h3>Combos</h3>
        <div class="create-row">
          <label for="combo-create-name">New combo</label>
          <input id="combo-create-name" bind:value={comboCreateName} placeholder="Combo name" />
          <button
            type="button"
            on:click={createComboRecord}
            disabled={!canEditDraft || nestedEditBlockedByWorkflow || isSubmitting}
          >
            Add combo
          </button>
        </div>

        {#if isLoadingCombos}
          <p class="muted">Loading combos...</p>
        {:else if combos.length === 0}
          <p class="muted">No combos for this menu yet.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Combo</th>
                <th>Price</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each combos as combo}
                <tr>
                  <td>{combo.name}</td>
                  <td>{combo.priceLabel}</td>
                  <td>{new Date(combo.updatedAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      on:click={() => openComboDrawer(combo)}
                      disabled={!canEditDraft || nestedEditBlockedByWorkflow}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}

    {#if selectedMerchantId}
      <section class="compare-panel">
        <h3>Merchant version compare</h3>
        {#if merchantVersions.length === 0}
          <p class="muted">No versions available for comparison.</p>
        {:else}
          <div class="compare-controls">
            <label>
              Left version
              <select bind:value={compareLeftVersionNo} on:change={runCompare}>
                {#each merchantVersions as version}
                  <option value={version.versionNo}>v{version.versionNo}</option>
                {/each}
              </select>
            </label>

            <label>
              Right version
              <select bind:value={compareRightVersionNo} on:change={runCompare}>
                {#each merchantVersions as version}
                  <option value={version.versionNo}>v{version.versionNo}</option>
                {/each}
              </select>
            </label>
          </div>

          {#if compareError}
            <p class="error">{compareError}</p>
          {:else}
            <div class="compare-columns">
              <pre>{compareLeftSnapshot}</pre>
              <pre>{compareRightSnapshot}</pre>
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  {/if}
</section>

<RecordDrawer
  open={merchantDrawerOpen}
  title={merchantDrawerTarget
    ? `Merchant details: ${merchantDrawerTarget.snapshot.name}`
    : 'Merchant details'}
  on:close={() => (merchantDrawerOpen = false)}
>
  <form class="drawer-form" on:submit|preventDefault={saveMerchantDrawer}>
    <label for="merchant-drawer-name">Name</label>
    <input id="merchant-drawer-name" bind:value={merchantDraftName} />

    <label for="merchant-drawer-description">Description</label>
    <textarea id="merchant-drawer-description" bind:value={merchantDraftDescription} rows="4"
    ></textarea>

    <fieldset>
      <legend>Tags</legend>
      <div class="selection-grid">
        {#each MERCHANT_TAG_OPTIONS as tag}
          <label>
            <input
              type="checkbox"
              checked={merchantDraftTags.includes(tag)}
              on:change={() => (merchantDraftTags = updateSelection(merchantDraftTags, tag))}
            />
            <span>{tag}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Amenities</legend>
      <div class="selection-grid">
        {#each AMENITY_OPTIONS as amenity}
          <label>
            <input
              type="checkbox"
              checked={merchantDraftAmenities.includes(amenity)}
              on:change={() =>
                (merchantDraftAmenities = updateSelection(merchantDraftAmenities, amenity))}
            />
            <span>{amenity}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <label for="merchant-image-picker">Merchant image (JPEG/PNG, max 5 MB)</label>
    <input
      id="merchant-image-picker"
      type="file"
      accept="image/png,image/jpeg"
      on:change={onMerchantFileSelected}
    />

    {#if merchantDraftImagePreview}
      <img class="preview" src={merchantDraftImagePreview} alt="Merchant preview" />
    {/if}

    {#if merchantDrawerEditBlocked}
      <p class="muted">Merchant draft edits are blocked while merchant is in review or approved.</p>
    {/if}

    <button type="submit" disabled={!canEditDraft || merchantDrawerEditBlocked || isSubmitting}>
      {#if isSubmitting}Saving...{:else}Save merchant draft{/if}
    </button>
  </form>
</RecordDrawer>

<RecordDrawer
  open={storeDrawerOpen}
  title={storeDrawerTarget ? `Store details: ${storeDrawerTarget.name}` : 'Store details'}
  on:close={() => (storeDrawerOpen = false)}
>
  <form class="drawer-form" on:submit|preventDefault={saveStoreDrawer}>
    <label for="store-drawer-name">Name</label>
    <input id="store-drawer-name" bind:value={storeDraftName} />

    <label for="store-drawer-description">Description</label>
    <textarea id="store-drawer-description" bind:value={storeDraftDescription} rows="4"></textarea>

    <fieldset>
      <legend>Tags</legend>
      <div class="selection-grid">
        {#each MERCHANT_TAG_OPTIONS as tag}
          <label>
            <input
              type="checkbox"
              checked={storeDraftTags.includes(tag)}
              on:change={() => (storeDraftTags = updateSelection(storeDraftTags, tag))}
            />
            <span>{tag}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Amenities</legend>
      <div class="selection-grid">
        {#each AMENITY_OPTIONS as amenity}
          <label>
            <input
              type="checkbox"
              checked={storeDraftAmenities.includes(amenity)}
              on:change={() =>
                (storeDraftAmenities = updateSelection(storeDraftAmenities, amenity))}
            />
            <span>{amenity}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <label for="store-image-picker">Store image (JPEG/PNG, max 5 MB)</label>
    <input
      id="store-image-picker"
      type="file"
      accept="image/png,image/jpeg"
      on:change={onStoreFileSelected}
    />

    {#if storeDraftImagePreview}
      <img class="preview" src={storeDraftImagePreview} alt="Store preview" />
    {/if}

    <button type="submit" disabled={!canEditDraft || isSubmitting}>
      {#if isSubmitting}Saving...{:else}Save store{/if}
    </button>
  </form>
</RecordDrawer>

<RecordDrawer
  open={menuDrawerOpen}
  title={menuDrawerTarget ? `Menu details: ${menuDrawerTarget.name}` : 'Menu details'}
  on:close={() => (menuDrawerOpen = false)}
>
  <form class="drawer-form" on:submit|preventDefault={saveMenuDrawer}>
    <label for="menu-drawer-name">Name</label>
    <input id="menu-drawer-name" bind:value={menuDraftName} />

    <label for="menu-drawer-description">Description</label>
    <textarea id="menu-drawer-description" bind:value={menuDraftDescription} rows="4"></textarea>

    <button type="submit" disabled={!canEditDraft || isSubmitting}>
      {#if isSubmitting}Saving...{:else}Save menu{/if}
    </button>
  </form>
</RecordDrawer>

<RecordDrawer
  open={comboDrawerOpen}
  title={comboDrawerTarget ? `Combo details: ${comboDrawerTarget.name}` : 'Combo details'}
  on:close={() => (comboDrawerOpen = false)}
>
  <form class="drawer-form" on:submit|preventDefault={saveComboDrawer}>
    <label for="combo-drawer-name">Name</label>
    <input id="combo-drawer-name" bind:value={comboDraftName} />

    <label for="combo-drawer-description">Description</label>
    <textarea id="combo-drawer-description" bind:value={comboDraftDescription} rows="4"></textarea>

    <label for="combo-drawer-price">Price label</label>
    <input id="combo-drawer-price" bind:value={comboDraftPriceLabel} />

    <button type="submit" disabled={!canEditDraft || isSubmitting}>
      {#if isSubmitting}Saving...{:else}Save combo{/if}
    </button>
  </form>
</RecordDrawer>

<WorkflowTransitionModal
  open={workflowModalOpen}
  actionLabel={workflowActionLabel(workflowModalAction)}
  merchantName={workflowModalMerchant?.snapshot.name ?? ''}
  requiresReason={workflowModalAction === 'reject'}
  {isSubmitting}
  on:cancel={closeWorkflowModal}
  on:confirm={(event) => executeWorkflowTransition(event.detail.reason)}
/>

<style>
  .merchant-console {
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
    color: #4d5761;
    margin-top: 0.35rem;
  }

  .create-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
  }

  input,
  textarea,
  select,
  button {
    font: inherit;
    padding: 0.5rem 0.6rem;
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

  tr.selected {
    background: #eef4ff;
  }

  .row-link {
    border: none;
    background: none;
    padding: 0;
    color: #175cd3;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }

  .inline-edit {
    margin-top: 0.45rem;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.4rem, 1fr));
    gap: 0.35rem;
  }

  .state {
    font-size: 0.8rem;
    display: inline-block;
    border-radius: 999px;
    padding: 0.2rem 0.5rem;
    text-transform: capitalize;
    border: 1px solid #d0d5dd;
    background: #f9fafb;
  }

  .state.draft {
    color: #175cd3;
  }

  .state.in_review {
    color: #b54708;
  }

  .state.approved {
    color: #027a48;
  }

  .state.rejected {
    color: #b42318;
  }

  .state.published {
    color: #1d2939;
  }

  .reason {
    margin-top: 0.3rem;
    font-size: 0.82rem;
    color: #b42318;
  }

  .sub-entities,
  .compare-panel {
    border-top: 1px solid #eaecf0;
    padding-top: 0.8rem;
    display: grid;
    gap: 0.7rem;
  }

  .compare-controls {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  .compare-columns {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }

  pre {
    margin: 0;
    background: #f8fafc;
    border: 1px solid #d0d5dd;
    border-radius: 0.55rem;
    padding: 0.75rem;
    overflow: auto;
    max-height: 18rem;
  }

  .drawer-form {
    display: grid;
    gap: 0.55rem;
  }

  fieldset {
    border: 1px solid #d0d5dd;
    border-radius: 0.55rem;
    padding: 0.5rem;
  }

  legend {
    padding: 0 0.25rem;
  }

  .selection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.35rem;
  }

  .selection-grid label {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    font-size: 0.9rem;
  }

  .preview {
    width: 100%;
    max-height: 14rem;
    object-fit: contain;
    border: 1px solid #d0d5dd;
    border-radius: 0.55rem;
  }

  .notice {
    color: #027a48;
  }

  .error {
    color: #b42318;
  }

  .muted {
    color: #4d5761;
  }

  @media (max-width: 720px) {
    .create-row {
      grid-template-columns: 1fr;
    }
  }
</style>
