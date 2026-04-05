# LocalOps Workspace (Merchant + Booking + Recruiting + Org Admin + Collaboration + Import/Export)

Offline-first browser SPA for LocalOps operational workspaces. The repo now contains real **Merchant Console**, **Booking Desk**, **Recruiting Workspace**, **Org Admin hierarchy/position management**, **Collaboration panel persistence/search**, and **Import/Export backup + bulk operations** on top of shared auth/session/permissions/admin foundations.

No network backend is used; persistence is browser-local IndexedDB via Dexie.

## Runtime and test entrypoints

- Primary runtime command: `./run_app.sh`
- Broad test command: `./run_tests.sh`

Both wrappers install dependencies as needed. No `.env` files are used.

LocalStorage note:

- Workflow-critical state and encryption key material are not persisted in localStorage.
- Any future localStorage usage is reserved for lightweight non-sensitive UI preferences only.

## Quickstart

```bash
./run_app.sh
```

Default URL: `http://127.0.0.1:4173`

> **Port fallback:** If port 4173 is already in use, Vite will automatically select the next available port. Check the terminal output for the actual URL.

## What is implemented

### Auth/security and workspace shell

- First-run bootstrap admin (`/bootstrap-admin`)
- Login/logout + inactivity session lock and re-auth
- Role/capability-based route gating
- Org Admin local user management (create user, assign roles, enable/disable with last-admin safeguards)
- Shared validation/error normalization and structured logging with redaction
- **Authorization model:** The application uses a shared single-workspace model. Access control is role/capability-based rather than per-record ownership-based — all users within the workspace share visibility of records scoped to their role permissions.

### Merchant Console

- Real `/merchant` workspace UI (not placeholder)
- Structured records:
  - merchants
  - stores
  - menus
  - combos
- Merchant list/table with inline merchant-name editing
- Drawer-based detail editing for merchant/store/menu/combo
- Workflow modal prompts for transitions
- Explicit states: loading, empty, submitting, success, and error states across merchant flows
- Workflow lifecycle:
  - `draft -> in_review -> approved/rejected -> published`
- Role enforcement:
  - Merchant Editor can create/edit draft content and submit for review
  - Content Reviewer/Publisher can approve/reject/publish
  - direct publish by Merchant Editor is blocked by UI capability visibility and service-layer checks
- Versioning and compare:
  - merchant version rows persisted in Dexie
  - stale merchant draft version conflict detection on update
  - side-by-side version compare panel for merchant snapshot shape
  - nested merchant content mutations (store/menu/combo create/update) bump merchant content version and move published content back to draft
- Media handling:
  - file-picker based image selection only
  - JPEG/PNG validation
  - max size 5 MB validation
  - merchant/store image asset persistence in Dexie
- Tag/amenity selection on merchant and store surfaces
- Service-layer audit events for critical merchant workflow/content mutations

### Booking Desk

- Real `/booking` workspace UI (not placeholder)
- Availability schedule matrix by date/resource/time slot
- Guided booking flow (step-based): slot -> hold/details -> review/confirm
- Booking lifecycle operations:
  - create booking
  - reschedule booking
  - cancel booking
- Cancellation policy:
  - free cancel up to 2 hours before start (`cancelled`)
  - otherwise `late_cancelled`
- Concurrency and duplicate protection:
  - BroadcastChannel + Web Locks coordination path for prompt-critical multi-tab safety
  - booking lease locks (5-minute TTL)
  - slot holds via `orderHolds` (10-minute TTL)
  - idempotency key enforcement (24-hour TTL)
  - conflict prevention against confirmed bookings and active holds
  - hard-block booking/import mutations with `UNSUPPORTED_BROWSER` when required coordination support is unavailable
- Startup recovery sweep for expired locks/holds/idempotency records
- Service-layer permission enforcement:
  - view requires `workspace.booking.view`
  - mutations require `workspace.booking.manage` (Booking Agent/Admin)
- Shared normalized errors + structured logging + audit events for booking mutations
- Explicit UI states for loading/empty/submitting/success/error/duplicate/conflict conditions

### Recruiting Workspace

- Real `/recruiting` workspace UI (not placeholder)
- Offer creation from persisted templates
  - seeded templates: `Floor Operations Lead Offer`, `HR Generalist Offer`
- Approval routing defaults to `HRManager`
- Approval/reject actions with service-layer role enforcement
- E-signature capture:
  - typed signer name required
  - optional drawn signature on canvas
- Onboarding document collection:
  - required field validation
  - SSN validation format `###-##-####`
  - masked SSN display in UI (`***-**-####`)
- Onboarding checklist states:
  - `not_started`
  - `in_progress`
  - `complete`
- Sensitive field encryption wired through shared field-crypto foundation:
  - offer compensation encrypted at rest
  - onboarding SSN encrypted at rest
  - encryption key material is derived locally from authenticated credentials (login/re-auth) and kept in-memory only
  - offer list/details show decrypted compensation when available, otherwise masked compensation band

### Org Admin hierarchy + position dictionary

- Existing local user administration remains in place
- Organization hierarchy tree management with typed nodes:
  - organization -> department -> grade -> class
  - single seeded organization-root model (`org-localops`) is enforced; org-admin node creation is for department/grade/class under that root
- Position dictionary with:
  - responsibilities
  - eligibility rules
  - headcount limits
- On-demand occupancy statistics computed from live recruiting offer state
  - `occupiedCount` (`approved + onboarding complete`)
  - `approvedNotOnboardedCount` (`approved + onboarding not complete`)
  - `pendingApprovalCount` (`pending_hr_approval`)
  - `openCount` (`headcountLimit - occupiedCount`, floored at `0`)

### Collaboration panel

- Real in-app collaboration panel rendered in authenticated workspace shell
- Context history persistence keyed by current route context
- Canned responses:
  - default seeded response set
  - custom canned response creation
  - archive/restore support
- Shared notes:
  - create/update per context
  - archive/restore support
- Context message archive/restore
- Local collaboration search by:
  - keyword
  - date range (`startDate` / `endDate`)
  - current context vs all contexts
  - include/exclude archived records
- Collaboration data persisted in Dexie tables:
  - `collaborationMessages`
  - `collaborationNotes`
  - `collaborationCannedResponses`

### Import / Export backups and bulk operations

- Real in-browser import/export panel in Org Admin workspace
- Entity bulk export (CSV/JSON) for:
  - merchants
  - bookings
  - recruiting offers
  - org hierarchy nodes
  - org positions
  - collaboration messages
  - collaboration notes
- Workspace backup export (JSON)
- Import preview + commit flow with explicit modes:
  - `upsert`
  - `replace`
- Workspace backup import (JSON)
- Entirely browser-local parsing/validation/commit (no network backend)
- Downloadable Blob artifacts with contextual date naming:
  - `collaborationNotes-bulk-YYYYMMDD-HHMMSS.json/csv`
  - `workspace-backup-YYYYMMDD-HHMMSS.json`
- Concurrency + recovery-aligned import safeguards:
  - lease locks for import commit critical sections
  - idempotency guard to block duplicate commit replay

### Service worker recovery orchestration

- `public/sw.js` owns background recovery signaling responsibilities.
- On activation/background-sync/client-registration, worker requests window clients to run recovery sweeps.
- App bridge (`src/app/bootstrap.ts`) handles worker recovery requests by executing `runStartupRecovery` and posting completion summaries back to worker context.

## Recruiting + Org Admin static review checklist

Use this section for fast static traceability of the current implemented slice:

- Offer templates + routing
  - config seed: `src/modules/recruiting/recruiting-config.ts`
  - service flow: `listOfferTemplates`, `createOfferFromTemplate` in `src/modules/recruiting/recruiting-service.ts`
- HR approval and rejection enforcement
  - service flow: `approveOffer`, `rejectOffer`
  - capability checks: `workspace.recruiting.approve` via `src/core/permissions/capabilities.ts`
- Signature behavior (typed required, drawn optional)
  - UI + canvas: `src/modules/recruiting/RecruitingWorkspacePage.svelte`, `src/modules/recruiting/components/SignatureCanvas.svelte`
  - service guard: `captureOfferSignature`
- Onboarding documents + SSN handling
  - validation: `src/modules/recruiting/recruiting-validation.ts`
  - service: `upsertOnboardingDocument`, `getOnboardingDocument`
  - DB storage: encrypted SSN field + masked SSN field in `src/core/db/database.ts`
- Onboarding checklist states + rollup
  - service: `listOnboardingChecklist`, `updateChecklistItemStatus`
  - states: `not_started`, `in_progress`, `complete`
- Org hierarchy + position dictionary + occupancy stats
  - UI surface: `src/modules/org-admin/OrgAdminWorkspacePage.svelte`
  - service: `src/modules/org-admin/org-admin-structure-service.ts`
  - DB tables: `orgHierarchyNodes`, `orgPositions`
  - occupancy computation: `computePositionOccupancyStats`

## Not implemented yet

- No additional development slices are intentionally deferred inside this repo scope.
- Remaining work is verification/hardening depth, not scaffold placeholders.

## Local development commands

- `npm run dev` — run Vite dev server
- `npm run lint` — run `svelte-check`
- `npm run format` — check formatting
- `npm run test:unit` — run Vitest unit/component/integration tests
- `npm run test:e2e` — run Playwright E2E tests
- `npm run build` — production build

## Main repository contents

- `src/app/` — shell/bootstrap/router/guards/header/session lock modal
- `src/core/` — db/auth/permissions/logging/validation/audit/concurrency/recovery
- `src/modules/merchant/` — Merchant Console UI + merchant service/validation/config
- `src/modules/booking/` — Booking Desk UI + booking service/validation/config
- `src/modules/recruiting/` — Recruiting workspace UI + recruiting service/validation/config
- `src/modules/org-admin/` — Org Admin user admin + hierarchy/position services
- `tests/` — unit/component/integration/e2e suites

## Merchant implementation anchors

- Merchant page: `src/modules/merchant/MerchantWorkspacePage.svelte`
- Merchant service: `src/modules/merchant/merchant-service.ts`
- Merchant validation/config: `src/modules/merchant/merchant-validation.ts`, `src/modules/merchant/merchant-config.ts`
- Merchant UI components: `src/modules/merchant/components/*`
- Merchant schema tables: `src/core/db/database.ts`

## Booking implementation anchors

- Booking page: `src/modules/booking/BookingWorkspacePage.svelte`
- Booking service: `src/modules/booking/booking-service.ts`
- Booking validation/config: `src/modules/booking/booking-validation.ts`, `src/modules/booking/booking-config.ts`
- Booking/recovery concurrency anchors:
  - `src/core/concurrency/lock-manager.ts`
  - `src/core/recovery/startup-recovery.ts`
  - `src/core/db/database.ts` (`bookings`, `bookingLocks`, `orderHolds`, `idempotencyKeys`)

## Recruiting implementation anchors

- Recruiting page: `src/modules/recruiting/RecruitingWorkspacePage.svelte`
- Recruiting service: `src/modules/recruiting/recruiting-service.ts`
- Recruiting validation/config:
  - `src/modules/recruiting/recruiting-validation.ts`
  - `src/modules/recruiting/recruiting-config.ts`
- Signature canvas component:
  - `src/modules/recruiting/components/SignatureCanvas.svelte`

## Org Admin hierarchy implementation anchors

- Org Admin page: `src/modules/org-admin/OrgAdminWorkspacePage.svelte`
- Org hierarchy/position service: `src/modules/org-admin/org-admin-structure-service.ts`
- Org hierarchy validation/config:
  - `src/modules/org-admin/org-admin-validation.ts`
  - `src/modules/org-admin/org-admin-config.ts`

## Collaboration implementation anchors

- Collaboration panel UI: `src/modules/collaboration/ConversationPanel.svelte`
- Collaboration service: `src/modules/collaboration/collaboration-service.ts`
- Collaboration validation/config:
  - `src/modules/collaboration/collaboration-validation.ts`
  - `src/modules/collaboration/collaboration-config.ts`

## Import/export implementation anchors

- Import/export service: `src/core/import-export/import-export-service.ts`
- Import/export validation: `src/core/import-export/import-export-validation.ts`
- Org Admin import/export UI panel:
  - `src/modules/org-admin/components/ImportExportPanel.svelte`

## Sensitive field encryption anchor

- Shared field crypto primitives: `src/core/security/field-crypto.ts`
- Workspace key provider: `src/core/security/workspace-field-key.ts`
