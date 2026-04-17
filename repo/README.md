# LocalOps Workspace (Merchant + Booking + Recruiting + Org Admin + Collaboration + Import/Export)

Project type: **fullstack**

Fullstack operational workspace for LocalOps. The repo contains a **Svelte SPA frontend** served by Vite and a **Node.js/Express REST API backend** with SQLite persistence. The backend exposes versioned endpoints under `/api/v1/` for auth, merchants, and bookings. The frontend proxies API requests to the backend during development.

### Architecture

| Layer       | Technology            | Persistence                                        |
| ----------- | --------------------- | -------------------------------------------------- |
| Frontend    | Svelte 5 SPA + Vite   | IndexedDB (Dexie) for non-migrated domains         |
| Backend API | Express + TypeScript  | SQLite via better-sqlite3 (`data/localops.sqlite`) |
| Auth        | Bearer token sessions | Server-side session table                          |

The frontend calls `/api/v1/*` endpoints for **auth flows** (bootstrap admin, login, logout) via `src/shared/api/auth-api.ts`. API client adapters for merchant and booking flows are available at `src/shared/api/merchant-api.ts` and `src/shared/api/booking-api.ts`. All other domains (recruiting, org-admin, collaboration, import/export) and the merchant/booking workspace UI continue to use browser-local IndexedDB pending full migration.

## Container-only runtime and test policy

- Use Docker Compose for startup and test execution.
- Do not run local runtime installs (`npm install`, `pip install`, `apt-get`) on the host.
- No manual database setup is required — SQLite is file-based and auto-created.
- No `.env` files are required.

## Quickstart (required)

```bash
docker-compose up
```

This starts both the **API server** (port 3001) and the **frontend dev server** (port 4173).

- Frontend: `http://127.0.0.1:4173`
- Backend API: `http://127.0.0.1:3001/api/v1/health`

> If ports are unavailable, change the host port mappings in `docker-compose.yml` and restart.

### Verify backend is active

```bash
# Health check
curl http://127.0.0.1:3001/api/v1/health
# → {"status":"ok","timestamp":"..."}

# Bootstrap admin
curl -X POST http://127.0.0.1:3001/api/v1/auth/bootstrap-admin \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password-123","confirmPassword":"password-123"}'
# → {"message":"Administrator created."}

# Login
curl -X POST http://127.0.0.1:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password-123"}'
# → {"token":"...","user":{"id":"...","username":"admin","roles":["Administrator"]}}

# List merchants (with token)
curl http://127.0.0.1:3001/api/v1/merchants \
  -H 'Authorization: Bearer <token>'
# → []
```

## Verification method

After `docker-compose up` reports the dev server is running, verify end-to-end behavior through this UI flow:

1. Open `http://127.0.0.1:4173`.
2. Confirm you are redirected to `/bootstrap-admin` and can see **Create initial administrator**.
3. Create the administrator account using the credential matrix below.
4. Confirm redirect to `/login` and sign in as admin.
5. Navigate to **Org Admin** and create the role accounts from the matrix below.
6. Log in as each role account and confirm route access:
   - `merchant.editor` -> `/merchant`
   - `content.reviewer` -> `/merchant`
   - `booking.agent` -> `/booking`
   - `hr.manager` -> `/recruiting`
   - `recruiter.user` -> `/recruiting`
7. Confirm authorization guard behavior by logging in as `booking.agent` and attempting `/org-admin`; the app must route to `/denied`.

## Demo credentials and roles

Authentication is required.

Use the following deterministic demo credentials aligned to the automated test fixtures:

| Role                     | Username           | Password       | Provisioning source                 |
| ------------------------ | ------------------ | -------------- | ----------------------------------- |
| Administrator            | `admin`            | `password-123` | Bootstrap page (`/bootstrap-admin`) |
| MerchantEditor           | `merchant.editor`  | `password-234` | Create in Org Admin                 |
| ContentReviewerPublisher | `content.reviewer` | `password-234` | Create in Org Admin                 |
| BookingAgent             | `booking.agent`    | `password-234` | Create in Org Admin                 |
| HRManager                | `hr.manager`       | `password-345` | Create in Org Admin                 |
| Recruiter                | `recruiter.user`   | `password-234` | Create in Org Admin                 |

Password variants used in specific integration suites also exist (for example `content.reviewer` with `password-345` in `tests/integration/merchant/merchant-workflow.test.ts`).

### Seeded demo credentials for tests

These credentials are used by automated test setup/fixtures (bootstrap + Org Admin user creation flows):

| Suite scope             | Username           | Password       | Evidence                                                                                                                                         |
| ----------------------- | ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| All e2e bootstrap flows | `admin`            | `password-123` | `tests/e2e/scaffold/bootstrap-login-smoke.spec.ts`, `tests/e2e/booking/booking-workflow.spec.ts`, `tests/e2e/merchant/merchant-workflow.spec.ts` |
| Merchant e2e            | `merchant.editor`  | `password-234` | `tests/e2e/merchant/merchant-workflow.spec.ts`                                                                                                   |
| Merchant e2e            | `content.reviewer` | `password-234` | `tests/e2e/merchant/merchant-workflow.spec.ts`                                                                                                   |
| Booking e2e             | `booking.agent`    | `password-234` | `tests/e2e/booking/booking-workflow.spec.ts`                                                                                                     |
| Auth-management e2e     | `booking.user`     | `password-234` | `tests/e2e/auth/admin-user-management.spec.ts`                                                                                                   |
| Recruiting e2e          | `recruiter.user`   | `password-234` | `tests/e2e/recruiting/recruiting-orgadmin-flow.spec.ts`                                                                                          |
| Recruiting e2e          | `hr.manager`       | `password-345` | `tests/e2e/recruiting/recruiting-orgadmin-flow.spec.ts`                                                                                          |

Integration suites also use deterministic fixtures with the same usernames in selected cases (for example `content.reviewer` with `password-345` in `tests/integration/merchant/merchant-workflow.test.ts`).

LocalStorage note:

- Workflow-critical state and encryption key material are not persisted in localStorage.
- Any future localStorage usage is reserved for lightweight non-sensitive UI preferences only.

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

## Test execution (container only)

- Full checks: `docker compose run --rm app sh -c "npm run lint && npm run format && npm run test:unit && npm run test:api && npm run test:e2e && npm run build"`
- Unit/component/integration only: `docker compose run --rm app npm run test:unit`
- API tests (real HTTP, no mocks): `docker compose run --rm app npm run test:api`
- E2E only: `docker compose run --rm app npm run test:e2e`

### Test suites

| Suite                      | Runner              | Files | Tests | Description                                                           |
| -------------------------- | ------------------- | ----- | ----- | --------------------------------------------------------------------- |
| Unit/integration/component | `npm run test:unit` | 42    | 161   | Service logic, validation, permissions, DB integration, UI components |
| API                        | `npm run test:api`  | 4     | 31    | Real HTTP requests against Express + SQLite (zero mocks)              |
| E2E                        | `npm run test:e2e`  | 7     | 9     | Full browser flows via Playwright                                     |

## Main repository contents

- `src/server/` — Express backend API (routes, services, middleware, SQLite DB)
- `src/server/routes/` — REST endpoint handlers (health, auth, merchants, bookings)
- `src/server/services/` — Server-side business logic
- `src/server/db/` — SQLite connection and schema initialization
- `src/shared/api/` — Frontend HTTP client for backend API calls
- `src/app/` — shell/bootstrap/router/guards/header/session lock modal
- `src/core/` — db/auth/permissions/logging/validation/audit/concurrency/recovery
- `src/modules/merchant/` — Merchant Console UI + merchant service/validation/config
- `src/modules/booking/` — Booking Desk UI + booking service/validation/config
- `src/modules/recruiting/` — Recruiting workspace UI + recruiting service/validation/config
- `src/modules/org-admin/` — Org Admin user admin + hierarchy/position services
- `tests/api/` — Backend API test suite (supertest, real HTTP, zero mocks)
- `tests/` — unit/component/integration/e2e suites
- `docs/backend-endpoints.md` — Complete backend endpoint inventory

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
