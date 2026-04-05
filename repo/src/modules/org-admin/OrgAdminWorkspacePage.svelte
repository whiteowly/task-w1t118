<script lang="ts">
  import { onMount } from 'svelte';

  import {
    createManagedUser,
    listManagedUsers,
    setManagedUserRoles,
    setManagedUserStatus,
    type ManagedUserView
  } from '../../core/auth/user-admin-service';
  import { hasCapability } from '../../core/permissions/service';
  import { normalizeUnknownError } from '../../core/validation/errors';
  import { sessionStore } from '../../shared/stores/session-store';
  import { ROLE_NAMES, type RoleName } from '../../shared/types/auth';
  import {
    canManageOrgAdminStructure,
    computePositionOccupancyStats,
    createHierarchyNode,
    createPositionDefinition,
    listOrgHierarchyNodes,
    listPositionDictionary,
    type HierarchyNodeView,
    type PositionDictionaryView,
    type PositionOccupancyStatView
  } from './org-admin-structure-service';
  import ImportExportPanel from './components/ImportExportPanel.svelte';

  let users: ManagedUserView[] = [];
  let draftRolesByUserId: Record<string, RoleName[]> = {};

  let hierarchyNodes: HierarchyNodeView[] = [];
  let positionDictionary: PositionDictionaryView[] = [];
  let occupancyStats: PositionOccupancyStatView[] = [];

  let isLoading = true;
  let isSubmittingCreate = false;
  let rowBusyUserId: string | null = null;
  let isSavingHierarchyNode = false;
  let isSavingPosition = false;
  let isComputingOccupancy = false;

  let pageError = '';
  let formError = '';
  let fieldErrors: Record<string, string[]> = {};
  let actionNotice = '';

  let username = '';
  let password = '';
  let confirmPassword = '';
  let selectedRoles: RoleName[] = [];

  let hierarchyNodeName = '';
  let hierarchyNodeType: HierarchyNodeView['nodeType'] = 'department';
  let hierarchyParentId = '';

  let positionTitle = '';
  let positionDepartmentId = '';
  let positionGradeId = '';
  let positionClassId = '';
  let positionResponsibilities = '';
  let positionEligibilityRules = '';
  let positionHeadcountLimit = 1;

  $: currentUser = $sessionStore.user;
  $: canManageUsers = currentUser
    ? hasCapability(currentUser.roles, 'workspace.orgAdmin.manage')
    : false;
  $: canManageStructure = currentUser ? canManageOrgAdminStructure(currentUser.roles) : false;

  $: organizationNodes = hierarchyNodes.filter((node) => node.nodeType === 'organization');
  $: departmentNodes = hierarchyNodes.filter((node) => node.nodeType === 'department');
  $: gradeNodes = hierarchyNodes.filter((node) => node.nodeType === 'grade');
  $: classNodes = hierarchyNodes.filter((node) => node.nodeType === 'class');

  $: hierarchyParentOptions =
    hierarchyNodeType === 'department'
      ? organizationNodes
      : hierarchyNodeType === 'grade'
        ? departmentNodes
        : hierarchyNodeType === 'class'
          ? gradeNodes
          : [];

  $: if (
    hierarchyNodeType !== 'organization' &&
    hierarchyParentOptions.length > 0 &&
    !hierarchyParentOptions.some((node) => node.id === hierarchyParentId)
  ) {
    hierarchyParentId = hierarchyParentOptions[0].id;
  }

  function toggleRoleSelection(role: RoleName): void {
    if (selectedRoles.includes(role)) {
      selectedRoles = selectedRoles.filter((existing) => existing !== role);
    } else {
      selectedRoles = [...selectedRoles, role];
    }
  }

  function toggleRowRole(userId: string, role: RoleName): void {
    const currentRoles = draftRolesByUserId[userId] ?? [];
    const nextRoles = currentRoles.includes(role)
      ? currentRoles.filter((entry) => entry !== role)
      : [...currentRoles, role];

    draftRolesByUserId = {
      ...draftRolesByUserId,
      [userId]: nextRoles
    };
  }

  function hydrateDraftRoles(nextUsers: ManagedUserView[]): void {
    const nextDraft: Record<string, RoleName[]> = {};
    nextUsers.forEach((user) => {
      nextDraft[user.id] = [...user.roles];
    });
    draftRolesByUserId = nextDraft;
  }

  function hierarchyNodeTypeLabel(nodeType: HierarchyNodeView['nodeType']): string {
    if (nodeType === 'organization') return 'Organization';
    if (nodeType === 'department') return 'Department';
    if (nodeType === 'grade') return 'Grade';
    return 'Class';
  }

  function clearNotices(): void {
    formError = '';
    fieldErrors = {};
    actionNotice = '';
  }

  async function refreshUsers(): Promise<void> {
    users = await listManagedUsers();
    hydrateDraftRoles(users);
  }

  async function refreshOrgStructure(): Promise<void> {
    const [nodes, positions] = await Promise.all([
      listOrgHierarchyNodes(),
      listPositionDictionary()
    ]);
    hierarchyNodes = nodes;
    positionDictionary = positions;

    if (!hierarchyParentId) {
      const defaultOrganization = nodes.find((node) => node.nodeType === 'organization');
      if (defaultOrganization) {
        hierarchyParentId = defaultOrganization.id;
      }
    }

    if (!positionDepartmentId && departmentNodes.length > 0) {
      positionDepartmentId = departmentNodes[0].id;
    }

    if (!positionGradeId && gradeNodes.length > 0) {
      positionGradeId = gradeNodes[0].id;
    }

    if (!positionClassId && classNodes.length > 0) {
      positionClassId = classNodes[0].id;
    }
  }

  async function refreshAll(): Promise<void> {
    isLoading = true;
    pageError = '';

    try {
      await Promise.all([refreshUsers(), refreshOrgStructure()]);
    } catch (error) {
      pageError = normalizeUnknownError(error).message;
    } finally {
      isLoading = false;
    }
  }

  async function submitCreateUser(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canManageUsers) {
      return;
    }

    isSubmittingCreate = true;
    clearNotices();

    try {
      await createManagedUser({ username, password, confirmPassword, roles: selectedRoles });
      actionNotice = 'User created successfully.';
      username = '';
      password = '';
      confirmPassword = '';
      selectedRoles = [];
      await refreshUsers();
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      formError = normalized.message;
      fieldErrors = normalized.fieldErrors ?? {};
    } finally {
      isSubmittingCreate = false;
    }
  }

  function rolesChanged(user: ManagedUserView): boolean {
    const draftRoles = draftRolesByUserId[user.id] ?? [];
    if (draftRoles.length !== user.roles.length) {
      return true;
    }

    return draftRoles.some((role) => !user.roles.includes(role));
  }

  async function saveUserRoles(user: ManagedUserView): Promise<void> {
    if (!canManageUsers) {
      return;
    }

    rowBusyUserId = user.id;
    clearNotices();

    try {
      await setManagedUserRoles(user.id, draftRolesByUserId[user.id] ?? []);
      actionNotice = `Updated roles for ${user.username}.`;
      await refreshUsers();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      rowBusyUserId = null;
    }
  }

  async function toggleUserStatus(user: ManagedUserView): Promise<void> {
    if (!canManageUsers) {
      return;
    }

    rowBusyUserId = user.id;
    clearNotices();

    try {
      const nextStatus = user.status === 'active' ? 'disabled' : 'active';
      await setManagedUserStatus(user.id, nextStatus);
      actionNotice = `${user.username} is now ${nextStatus}.`;
      await refreshUsers();
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      rowBusyUserId = null;
    }
  }

  async function submitCreateHierarchyNode(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canManageStructure) {
      return;
    }

    isSavingHierarchyNode = true;
    clearNotices();

    try {
      await createHierarchyNode({
        name: hierarchyNodeName,
        nodeType: hierarchyNodeType,
        parentId: hierarchyNodeType === 'organization' ? null : hierarchyParentId || null
      });
      actionNotice = `${hierarchyNodeTypeLabel(hierarchyNodeType)} node created.`;
      hierarchyNodeName = '';
      await refreshOrgStructure();
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      formError = normalized.message;
      fieldErrors = normalized.fieldErrors ?? {};
    } finally {
      isSavingHierarchyNode = false;
    }
  }

  async function submitCreatePosition(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canManageStructure) {
      return;
    }

    isSavingPosition = true;
    clearNotices();

    try {
      await createPositionDefinition({
        title: positionTitle,
        departmentNodeId: positionDepartmentId,
        gradeNodeId: positionGradeId,
        classNodeId: positionClassId,
        headcountLimit: Number(positionHeadcountLimit),
        responsibilities: positionResponsibilities
          .split('\n')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
        eligibilityRules: positionEligibilityRules
          .split('\n')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      });

      actionNotice = 'Position dictionary entry created.';
      positionTitle = '';
      positionResponsibilities = '';
      positionEligibilityRules = '';
      positionHeadcountLimit = 1;
      await refreshOrgStructure();
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      formError = normalized.message;
      fieldErrors = normalized.fieldErrors ?? {};
    } finally {
      isSavingPosition = false;
    }
  }

  async function computeOccupancy(): Promise<void> {
    isComputingOccupancy = true;
    clearNotices();

    try {
      occupancyStats = await computePositionOccupancyStats();
      actionNotice = 'Occupancy statistics computed on demand.';
    } catch (error) {
      formError = normalizeUnknownError(error).message;
    } finally {
      isComputingOccupancy = false;
    }
  }

  onMount(async () => {
    await refreshAll();
  });
</script>

<section class="panel">
  <header>
    <h2>Local user administration</h2>
    <p>
      Manage local users, role assignments, hierarchy trees, position dictionary entries, and
      occupancy insights.
    </p>
  </header>

  {#if pageError}
    <p class="error" role="alert">{pageError}</p>
  {/if}

  {#if actionNotice}
    <p class="notice" role="status">{actionNotice}</p>
  {/if}

  {#if isLoading}
    <p class="muted">Loading Org Admin workspace...</p>
  {:else}
    <div class="layout-grid">
      <section class="card">
        <h3>Create user</h3>

        {#if !canManageUsers}
          <p class="muted">
            Your roles can view Org Admin but cannot manage local users. Contact an Administrator
            for changes.
          </p>
        {:else}
          <form on:submit={submitCreateUser}>
            <label for="create-username">Username</label>
            <input id="create-username" bind:value={username} autocomplete="off" />
            {#if fieldErrors.username}
              <p class="error">{fieldErrors.username[0]}</p>
            {/if}

            <label for="create-password">Temporary password</label>
            <input
              id="create-password"
              type="password"
              bind:value={password}
              autocomplete="new-password"
            />
            {#if fieldErrors.password}
              <p class="error">{fieldErrors.password[0]}</p>
            {/if}

            <label for="create-confirm-password">Confirm password</label>
            <input
              id="create-confirm-password"
              type="password"
              bind:value={confirmPassword}
              autocomplete="new-password"
            />
            {#if fieldErrors.confirmPassword}
              <p class="error">{fieldErrors.confirmPassword[0]}</p>
            {/if}

            <fieldset>
              <legend>Assign roles</legend>
              <div class="role-grid">
                {#each ROLE_NAMES as role}
                  <label class="checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      on:change={() => toggleRoleSelection(role)}
                    />
                    <span>{role}</span>
                  </label>
                {/each}
              </div>
            </fieldset>

            {#if fieldErrors.roles}
              <p class="error">{fieldErrors.roles[0]}</p>
            {/if}

            {#if formError}
              <p class="error" role="alert">{formError}</p>
            {/if}

            <button type="submit" disabled={isSubmittingCreate}>
              {#if isSubmittingCreate}Creating user...{:else}Create user{/if}
            </button>
          </form>
        {/if}
      </section>

      <section class="card">
        <h3>Existing users</h3>

        {#if users.length === 0}
          <p class="muted">No local users found.</p>
        {:else}
          <ul class="user-list">
            {#each users as user}
              <li class="user-row">
                <div class="user-row-header">
                  <div>
                    <p class="username">{user.username}</p>
                    <p class="meta">
                      Status:
                      <span class={user.status === 'active' ? 'status-active' : 'status-disabled'}>
                        {user.status}
                      </span>
                    </p>
                  </div>

                  {#if canManageUsers}
                    <button
                      type="button"
                      on:click={() => toggleUserStatus(user)}
                      disabled={rowBusyUserId === user.id}
                    >
                      {user.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  {/if}
                </div>

                <div class="role-grid">
                  {#each ROLE_NAMES as role}
                    <label class="checkbox-item">
                      <input
                        type="checkbox"
                        checked={(draftRolesByUserId[user.id] ?? []).includes(role)}
                        on:change={() => toggleRowRole(user.id, role)}
                        disabled={!canManageUsers || rowBusyUserId === user.id}
                      />
                      <span>{role}</span>
                    </label>
                  {/each}
                </div>

                {#if canManageUsers}
                  <button
                    type="button"
                    on:click={() => saveUserRoles(user)}
                    disabled={!rolesChanged(user) || rowBusyUserId === user.id}
                  >
                    Save roles
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <section class="card block-card">
      <h3>Organization hierarchy tree</h3>
      <p class="muted">
        LocalOps uses a single seeded organization root (`org-localops`). Create department, grade,
        and class nodes under that root.
      </p>

      {#if !canManageStructure}
        <p class="muted">Only Org Admin managers can mutate hierarchy nodes.</p>
      {/if}

      <form on:submit={submitCreateHierarchyNode}>
        <label for="hierarchy-node-name">Node name</label>
        <input
          id="hierarchy-node-name"
          bind:value={hierarchyNodeName}
          autocomplete="off"
          disabled={!canManageStructure}
        />

        <label for="hierarchy-node-type">Node type</label>
        <select
          id="hierarchy-node-type"
          bind:value={hierarchyNodeType}
          disabled={!canManageStructure}
        >
          <option value="department">Department</option>
          <option value="grade">Grade</option>
          <option value="class">Class</option>
        </select>

        <label for="hierarchy-parent-id">Parent node</label>
        <select
          id="hierarchy-parent-id"
          bind:value={hierarchyParentId}
          disabled={!canManageStructure || hierarchyParentOptions.length === 0}
        >
          {#if hierarchyParentOptions.length === 0}
            <option value="">No parent options available</option>
          {:else}
            {#each hierarchyParentOptions as node}
              <option value={node.id}>{node.name} ({hierarchyNodeTypeLabel(node.nodeType)})</option>
            {/each}
          {/if}
        </select>

        <button type="submit" disabled={!canManageStructure || isSavingHierarchyNode}>
          {#if isSavingHierarchyNode}Saving node...{:else}Create hierarchy node{/if}
        </button>
      </form>

      <ul class="hierarchy-list">
        {#each hierarchyNodes as node}
          <li style={`margin-left: ${node.depth * 1.25}rem`}>
            <strong>{node.name}</strong> — {hierarchyNodeTypeLabel(node.nodeType)}
          </li>
        {/each}
      </ul>
    </section>

    <section class="card block-card">
      <h3>Position dictionary</h3>

      {#if !canManageStructure}
        <p class="muted">Only Org Admin managers can create position dictionary entries.</p>
      {/if}

      <form on:submit={submitCreatePosition}>
        <label for="position-title">Position title</label>
        <input
          id="position-title"
          bind:value={positionTitle}
          autocomplete="off"
          disabled={!canManageStructure}
        />

        <div class="triple-grid">
          <div>
            <label for="position-department">Department</label>
            <select
              id="position-department"
              bind:value={positionDepartmentId}
              disabled={!canManageStructure}
            >
              {#each departmentNodes as node}
                <option value={node.id}>{node.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="position-grade">Grade</label>
            <select id="position-grade" bind:value={positionGradeId} disabled={!canManageStructure}>
              {#each gradeNodes as node}
                <option value={node.id}>{node.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="position-class">Class</label>
            <select id="position-class" bind:value={positionClassId} disabled={!canManageStructure}>
              {#each classNodes as node}
                <option value={node.id}>{node.name}</option>
              {/each}
            </select>
          </div>
        </div>

        <label for="position-headcount">Headcount limit</label>
        <input
          id="position-headcount"
          type="number"
          min="1"
          max="500"
          bind:value={positionHeadcountLimit}
          disabled={!canManageStructure}
        />

        <label for="position-responsibilities">Responsibilities (one per line)</label>
        <textarea
          id="position-responsibilities"
          rows="4"
          bind:value={positionResponsibilities}
          disabled={!canManageStructure}
        ></textarea>

        <label for="position-eligibility">Eligibility rules (one per line)</label>
        <textarea
          id="position-eligibility"
          rows="4"
          bind:value={positionEligibilityRules}
          disabled={!canManageStructure}
        ></textarea>

        <button type="submit" disabled={!canManageStructure || isSavingPosition}>
          {#if isSavingPosition}Saving position...{:else}Create position{/if}
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Hierarchy</th>
            <th>Headcount</th>
            <th>Responsibilities</th>
            <th>Eligibility</th>
          </tr>
        </thead>
        <tbody>
          {#if positionDictionary.length === 0}
            <tr>
              <td colspan="5" class="muted">No positions found.</td>
            </tr>
          {:else}
            {#each positionDictionary as position}
              <tr>
                <td>{position.title}</td>
                <td>
                  {position.departmentName} / {position.gradeName} / {position.className}
                </td>
                <td>{position.headcountLimit}</td>
                <td>{position.responsibilities.join('; ')}</td>
                <td>{position.eligibilityRules.join('; ')}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </section>

    <section class="card block-card">
      <div class="occupancy-header">
        <h3>Occupancy statistics</h3>
        <button type="button" on:click={computeOccupancy} disabled={isComputingOccupancy}>
          {#if isComputingOccupancy}Computing...{:else}Compute occupancy statistics{/if}
        </button>
      </div>

      {#if occupancyStats.length === 0}
        <p class="muted">No occupancy stats computed yet.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Position</th>
              <th>Headcount</th>
              <th>Occupied</th>
              <th>Open</th>
              <th>Approved not onboarded</th>
              <th>Pending approval</th>
            </tr>
          </thead>
          <tbody>
            {#each occupancyStats as row}
              <tr>
                <td>{row.positionTitle}</td>
                <td>{row.headcountLimit}</td>
                <td>{row.occupiedCount}</td>
                <td>{row.openCount}</td>
                <td>{row.approvedNotOnboardedCount}</td>
                <td>{row.pendingApprovalCount}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <ImportExportPanel canManage={canManageStructure} />
  {/if}
</section>

<style>
  .panel {
    background: #fff;
    border: 1px solid #d5d7dc;
    border-radius: 0.75rem;
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
  }

  header h2 {
    margin: 0;
  }

  header p {
    margin: 0.35rem 0 0;
    color: #4d5761;
  }

  .layout-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(21rem, 1fr));
  }

  .card {
    border: 1px solid #d5d7dc;
    border-radius: 0.6rem;
    padding: 0.85rem;
    background: #fcfcfd;
    display: grid;
    gap: 0.65rem;
  }

  .block-card {
    margin-top: 0.4rem;
  }

  .card h3 {
    margin: 0;
  }

  form {
    display: grid;
    gap: 0.5rem;
  }

  input,
  button,
  select,
  textarea {
    font: inherit;
    padding: 0.5rem 0.6rem;
  }

  fieldset {
    border: 1px solid #d0d5dd;
    border-radius: 0.55rem;
    padding: 0.5rem;
  }

  legend {
    padding: 0 0.25rem;
  }

  .role-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.35rem;
  }

  .checkbox-item {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .checkbox-item input {
    margin: 0;
    width: 0.95rem;
    height: 0.95rem;
  }

  .user-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }

  .user-row {
    border: 1px solid #d0d5dd;
    border-radius: 0.6rem;
    padding: 0.65rem;
    display: grid;
    gap: 0.6rem;
    background: #fff;
  }

  .user-row-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .username {
    margin: 0;
    font-weight: 600;
  }

  .meta {
    margin: 0.15rem 0 0;
    color: #4d5761;
    font-size: 0.92rem;
  }

  .status-active {
    color: #067647;
    font-weight: 600;
  }

  .status-disabled {
    color: #b42318;
    font-weight: 600;
  }

  .hierarchy-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }

  .triple-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .triple-grid > div {
    display: grid;
    gap: 0.3rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #eaecf0;
    text-align: left;
    vertical-align: top;
    padding: 0.45rem;
  }

  .occupancy-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .muted {
    color: #667085;
  }

  .error {
    color: #b42318;
  }

  .notice {
    color: #175cd3;
  }

  @media (max-width: 920px) {
    .triple-grid {
      grid-template-columns: 1fr;
    }

    .occupancy-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
