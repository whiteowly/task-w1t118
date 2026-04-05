# In-Browser Service Contract Spec

No network backend is used. UI routes call local module services directly.

## Error contract

Service methods throw normalized `AppError` instances with:

- `code` (e.g., `VALIDATION_ERROR`, `PERMISSION_DENIED`, `RECORD_NOT_FOUND`, `CONFLICT`, `SESSION_LOCKED`, `UNSUPPORTED_BROWSER`)
- `message`
- optional `fieldErrors`
- optional `details`

UI layers normalize unknown failures via `normalizeUnknownError`.

## AuthService (implemented)

Module: `src/core/auth/auth-service.ts`

- `bootstrapAdministrator(input)`
- `login(input)`
- `reauthenticate(input)`
- `logout()`
- `lockSession(reason)`

Guarantees:

- bootstrap allowed only when no users exist
- encrypted-at-rest auth artifacts persisted
- inactivity lock and manual lock supported

## UserAdminService (implemented)

Module: `src/core/auth/user-admin-service.ts`

- `listManagedUsers()`
- `createManagedUser({ username, password, confirmPassword, roles })`
- `setManagedUserRoles(userId, roles)`
- `setManagedUserStatus(userId, status)`

Guarantees:

- manage capability required for mutations
- conflict safeguards (duplicate username, last-active-admin, self-disable/self-role-removal restrictions)
- audit events written for user mutations

## MerchantService (implemented)

Module: `src/modules/merchant/merchant-service.ts`

### Query methods

- `listMerchants()`
- `listMerchantVersions(merchantId)`
- `compareMerchantVersions(merchantId, leftVersionNo, rightVersionNo)`
- `listStores(merchantId)`
- `listMenus(storeId)`
- `listCombos(menuId)`
- `getMediaAssetDataUrl(assetId)`

### Merchant mutation methods

- `createMerchantDraft({ name, description, tags, amenities })`
- `updateMerchantDraft({ merchantId, expectedVersionNo, name, description, tags, amenities, imageAssetId })`
- `submitMerchantForReview({ merchantId, reason? })`
- `approveMerchant({ merchantId, reason? })`
- `rejectMerchant({ merchantId, reason? })`
- `publishMerchant({ merchantId, reason? })`

### Nested merchant-content mutation methods

- `createStore({ merchantId, name, description, tags, amenities, imageAssetId })`
- `updateStore({ storeId, name, description, tags, amenities, imageAssetId })`
- `createMenu({ storeId, name, description })`
- `updateMenu({ menuId, name, description })`
- `createCombo({ menuId, name, description, priceLabel })`
- `updateCombo({ comboId, name, description, priceLabel })`
- `createMediaAsset({ ownerType, ownerId, file })`

### Merchant authorization and workflow guarantees

- View methods require `workspace.merchant.view`
- Draft mutation methods require `workspace.merchant.editDraft`
- Review/publish transitions require `workspace.merchant.reviewPublish`
- Transition constraints:
  - submit only from `draft` or `rejected`
  - approve only from `in_review`
  - reject from `in_review` or `approved`
  - publish only from `approved`
- Merchant Editor cannot publish directly (`PERMISSION_DENIED`)
- Merchant draft update requires `expectedVersionNo`; stale writes return `CONFLICT` with version details
- Nested content mutations (store/menu/combo) bump merchant content version and force merchant workflow back to `draft`
- Nested mutations are blocked during `in_review` and `approved` merchant states (`CONFLICT`)
- Critical merchant mutations append audit events in transaction scope

### Media validation guarantees

- only `image/jpeg` and `image/png`
- max 5 MB
- invalid files throw `VALIDATION_ERROR`

## BookingService (implemented)

Module: `src/modules/booking/booking-service.ts`

### Query methods

- `listBookingAvailabilityForDate(date)`
- `listBookingsForDate(date)`
- `previewBookingConflict({ resourceId, startsAt, durationMinutes, holderTabId, ignoredBookingId?, ignoredHoldId? })`
- `todayBookingDateKey()`
- `getBookingResources()`
- `getBookingDurationOptions()`

### Hold methods

- `createOrRefreshBookingHold({ resourceId, startsAt, durationMinutes, holderTabId, holdId? })`
- `releaseBookingHold(holdId)`

### Booking mutation methods

- `createBooking({ resourceId, startsAt, durationMinutes, customerName, partySize, notes, holderTabId, holdId?, idempotencyKey })`
- `rescheduleBooking({ bookingId, resourceId, startsAt, durationMinutes, holderTabId, holdId?, idempotencyKey })`
- `cancelBooking({ bookingId, idempotencyKey, reason? })`

### Booking authorization and concurrency guarantees

- View/query methods require `workspace.booking.view`
- Hold and mutation methods require `workspace.booking.manage`
- Booking mutation methods require BroadcastChannel-backed coordination support (`UNSUPPORTED_BROWSER` on unsupported surfaces)
- Web Locks is primary lock path; Dexie lease lock is fallback when Web Locks is unavailable but BroadcastChannel exists
- Lock enforcement guards booking critical sections (`LOCK_UNAVAILABLE` on contention)
- Overlap with existing confirmed bookings returns `CONFLICT`
- Overlap with active holds from other tabs returns `CONFLICT`
- Idempotency key reuse with same payload returns `DUPLICATE_REQUEST`
- Idempotency key reuse with different payload returns `CONFLICT`

### Booking policy guarantees

- Cancellation status policy:
  - free cancellation window (>=2h before start): `cancelled`
  - late cancellation window (<2h): `late_cancelled`
- Booking mutation methods append audit events (`BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`)

## RecruitingService (implemented)

Module: `src/modules/recruiting/recruiting-service.ts`

### Query methods

- `listOfferTemplates()`
- `listRecruitingOffers()`
- `getOnboardingDocument(offerId)`
- `listOnboardingChecklist(offerId)`

### Recruiting read-model shape guarantees

- `listOfferTemplates()` returns template rows including:
  - `id`, `name`, `positionId`, `positionTitle`
  - `compensationPreview`
  - `responsibilities[]`, `eligibilityRules[]`
- `listRecruitingOffers()` returns rows including:
  - `approvalStatus`, `approvalRoutingRole`, `rejectionReason`
  - `signatureTypedName`, `signatureSignedAt`
  - `onboardingStatus`
  - `compensationDisplay`
- Compensation display behavior:
  - uses decrypted value when decryption succeeds
  - falls back to masked compensation band when decryption fails
- `getOnboardingDocument()` returns masked SSN only (`ssnMasked`), never plaintext SSN

### Recruiting mutation methods

- `createOfferFromTemplate({ templateId, candidateName, candidateEmail })`
- `approveOffer({ offerId, reason? })`
- `rejectOffer({ offerId, reason })`
- `captureOfferSignature({ offerId, typedSignerName, drawnSignatureDataUrl? })`
- `upsertOnboardingDocument({ offerId, legalName, addressLine1, city, stateProvince, postalCode, ssn, emergencyContactName, emergencyContactPhone })`
- `updateChecklistItemStatus({ offerId, checklistItemId, status })`

### Recruiting authorization and workflow guarantees

- View methods require `workspace.recruiting.view`
- Offer/document/signature/checklist mutation methods require `workspace.recruiting.manage`
- Approval/reject methods require `workspace.recruiting.approve`
- Offer creation routes to `HRManager` by default
- Approval state constraints:
  - only `pending_hr_approval` offers can be approved/rejected
  - signature/document/checklist mutations require offer `approved`
- Checklist state machine uses: `not_started`, `in_progress`, `complete`

### Recruiting validation and sensitive-field guarantees

- Signature capture requires typed signer name; drawn signature is optional
- Onboarding SSN must match `###-##-####`
- SSN is displayed as masked value only (`***-**-####`)
- Sensitive fields encrypted at rest using shared field-crypto foundation:
  - offer compensation
  - onboarding SSN
- Workspace field-encryption key material is derived from authenticated credentials at login/re-auth and kept in-memory only.

## OrgAdminStructureService (implemented)

Module: `src/modules/org-admin/org-admin-structure-service.ts`

### Query methods

- `listOrgHierarchyNodes()`
- `listPositionDictionary()`
- `computePositionOccupancyStats()`

### Org-admin read-model shape guarantees

- `listOrgHierarchyNodes()` returns hierarchical rows with:
  - `nodeType`, `name`, `parentId`, `parentName`, `depth`
- `listPositionDictionary()` returns rows with:
  - `departmentName`, `gradeName`, `className`
  - `responsibilities[]`, `eligibilityRules[]`, `headcountLimit`
- `computePositionOccupancyStats()` returns per-position counters:
  - `occupiedCount`
  - `approvedNotOnboardedCount`
  - `pendingApprovalCount`
  - `openCount`
  - `computedAt`

### Org structure mutation methods

- `createHierarchyNode({ name, nodeType, parentId })`
- `createPositionDefinition({ title, departmentNodeId, gradeNodeId, classNodeId, responsibilities, eligibilityRules, headcountLimit })`

### Org structure authorization and data guarantees

- Query methods require `workspace.orgAdmin.view`
- Mutation methods require `workspace.orgAdmin.manage`
- Single-root organization model is enforced (`org-localops` seed); additional organization-root creation is rejected (`CONFLICT`)
- Hierarchy type constraints are enforced:
  - department parent must be organization
  - grade parent must be department
  - class parent must be grade
- Position dictionary entries enforce hierarchy linkage consistency (department/grade/class chain)
- Occupancy stats compute on demand from recruiting offer approval/onboarding states

## CollaborationService (implemented)

Module: `src/modules/collaboration/collaboration-service.ts`

### Query methods

- `listContextHistory({ contextKey, includeArchived? })`
- `listSharedNotes({ contextKey, includeArchived? })`
- `listCannedResponses(includeArchived?)`
- `searchCollaborationRecords({ keyword?, startDate?, endDate?, includeArchived?, contextKey? })`

### Collaboration mutation methods

- `postContextMessage({ contextKey, contextLabel?, messageBody, source? })`
- `setContextMessageArchived({ recordId, archived })`
- `createSharedNote({ contextKey, contextLabel?, noteBody })`
- `updateSharedNote({ noteId, noteBody })`
- `setSharedNoteArchived({ recordId, archived })`
- `createCannedResponse({ title, body, tags })`
- `setCannedResponseArchived({ recordId, archived })`

### Collaboration authorization and validation guarantees

- Collaboration methods require `workspace.collaboration.use`
- Session must be authenticated (`SESSION_LOCKED` otherwise)
- Date-range search enforces start <= end
- Context history and notes are keyed by normalized route context
- Archive transitions preserve record identity and toggle archived state

## ImportExportService (implemented)

Module: `src/core/import-export/import-export-service.ts`

### Discovery/query methods

- `listImportExportEntityOptions()`

### Preview/commit methods

- `previewImport({ file, format, entityType, mode })`
- `commitImport(preview)`

### Export methods

- `exportEntity({ entityType, format })`

### Import/export authorization and safety guarantees

- Import/export methods require `workspace.orgAdmin.manage`
- Import commit requires BroadcastChannel-backed coordination support (`UNSUPPORTED_BROWSER` on unsupported surfaces)
- Preview is validation-first and reports:
  - total rows
  - valid rows
  - invalid rows
  - row-level validation issues
- Commit safeguards:
  - blocked when preview has invalid rows
  - lock-manager guard for concurrent cross-tab commit protection
  - idempotency guard for duplicate replay protection
- Mode semantics:
  - `upsert`: bulk put without clearing target table
  - `replace`: clear target table then bulk put

### Artifact and format guarantees

- Entity bulk export/import supports CSV + JSON where configured
- Workspace backup export/import supports JSON
- Export returns Blob artifacts with contextual timestamped file names
- Processing is entirely in-browser; no network backend dependency

## Still-planned service domains (outside implemented slices)

- Additional hardening-oriented test depth across all domain permutations
