# Implementation Plan and Scaffold Contracts

This file is the controlling implementation plan for the LocalOps SPA build in this repo.

Scaffold status note:

- Architecture contracts in this document are now reflected by the repository skeleton.
- Domain workflows in this document are now implemented through the collaboration/import-export development slice.

## 1) Runtime architecture

- Browser-only Svelte SPA with client-side routing.
- No network backend; domain logic executes in-browser.
- IndexedDB (Dexie) is source of truth for application data.
- LocalStorage is reserved for future lightweight non-sensitive preferences; workflow-critical and encryption-key state are not persisted there.
- Service Worker + startup recovery bridge orchestrate background cleanup/reconciliation requests.
- Lock manager coordinates across tabs using BroadcastChannel + Web Locks primary path.

## 2) Delivery constraints

- Runtime contract: `./run_app.sh` (required by clarified brief).
- Broad test contract: `./run_tests.sh`.
- No `.env` files in repo.
- No default credentials; first-run bootstrap creates initial Administrator.
- Critical writes must be transaction-safe and audit-logged.

## 3) Shared cross-cutting contracts

### Authentication and session

- Entry points: first-run bootstrap, login, lock-screen re-auth, logout.
- Session auto-lock after 15 minutes inactivity.
- Locked state blocks all mutation calls until successful re-auth.

### Authorization

- Central role-capability matrix enforced at route, UI action, and service mutation layers.
- Object-level authorization is required before every record mutation.

### Storage and transactions

- Dexie repositories are the single write path.
- Critical mutations (review/publish, booking create/reschedule/cancel, offer approval/signature, import commit) execute in single transaction units.

### Encryption/masking

- Sensitive fields stored encrypted at rest using locally derived key material.
- SSN masked outside explicit edit contexts.
- Sensitive raw values are excluded from logs and search indexes.

### Audit

- Critical actions append immutable audit events with actor + timestamp + previous/new state summaries.
- Mutation completion requires audit append success where action is marked critical.

### Concurrency and idempotency

- Lock manager required for booking/hold-sensitive operations.
- Client-generated idempotency keys retained for 24h for duplicate-blocking operations.
- Lock and idempotency checks are part of transactional mutation path.

### Import/export

- CSV/JSON imports run parse -> validate -> preview -> commit.
- Commit phase is transactional and permission-checked.
- Exports are generated as download Blobs with context/date naming.

### Logging and validation

- Structured logger with categories and redaction guards.
- Shared validation contract returns normalized error objects with field-level detail.

### Recovery

- Startup reconciliation always runs before interactive mutation flows.
- Expired booking locks (5m), order holds (10m), and idempotency keys (24h) are reconciled/pruned.

## 4) Module contracts

### `src/app/` (shell, routing, workspace framing)

- Responsibilities: app boot, route registration, workspace layout, lock-screen overlay, permission-aware nav.
- Inputs/outputs: auth/session store, permission service, route definitions.
- Failure behavior: unauthorized route => access denied screen; unknown route => not-found route.
- Verification expectations: route guard E2E + not-found route tests.

### `src/core/auth/`

- Responsibilities: first-run bootstrap admin creation, credential verification, session lifecycle, inactivity timer.
- Inputs/outputs: username/password input, encrypted user records, session store state.
- Failure behavior: invalid credentials, bootstrap replay attempts, locked session mutation attempts.
- Verification expectations: bootstrap, login failure, auto-lock/re-auth unit + E2E.

### `src/core/permissions/`

- Responsibilities: capability matrix, object-level auth checks, guard adapters.
- Inputs/outputs: user role set + resource context -> allow/deny decision.
- Failure behavior: deny with normalized PermissionDenied error.
- Verification expectations: matrix unit tests and object authorization integration tests.

### `src/core/db/`

- Responsibilities: schema/index definitions, migrations, atomic transaction helpers.
- Inputs/outputs: repository reads/writes to IndexedDB collections.
- Failure behavior: IndexedDB unavailable/degraded => startup error state and write path hard-fail with normalized storage errors.
- Verification expectations: migration tests + degraded IndexedDB startup tests.

### `src/core/security/`

- Responsibilities: KDF handling, encryption/decryption, sensitive value masking.
- Inputs/outputs: plaintext sensitive fields <-> encrypted payload columns.
- Failure behavior: decryption failure => record inaccessible state with operator-safe error.
- Verification expectations: encryption roundtrip tests, masking tests, redaction tests.

### `src/core/audit/`

- Responsibilities: append-only audit writer and query filters.
- Inputs/outputs: mutation context -> immutable audit record.
- Failure behavior: critical mutation aborts if audit append cannot complete.
- Verification expectations: append-only immutability integration tests.

### `src/core/concurrency/`

- Responsibilities: lock acquisition/release, lock expiry semantics, idempotency key registry.
- Inputs/outputs: resource key + op metadata -> lock token/denial.
- Failure behavior: lock denied/conflict/stale lock cleanup; duplicate idempotency returns prior result.
- Verification expectations: multi-tab Playwright tests + idempotency integration tests.

### `src/core/recovery/`

- Responsibilities: startup reconciliation of TTL artifacts and stale mutation guards.
- Inputs/outputs: lock/hold/idempotency collections -> reconciled state + recovery report.
- Failure behavior: partial recovery logs error + blocks high-risk mutations until retry.
- Verification expectations: startup recovery integration tests including simulated crash remnants.

### `src/core/import-export/`

- Responsibilities: parse CSV/JSON, schema validation, preview diff/conflict report, commit, export Blob generation.
- Inputs/outputs: file + target entity + policy -> preview/commit result.
- Failure behavior: invalid format/validation errors/conflict policy rejection with explicit row-level messages.
- Verification expectations: parser/validator tests + conflict policy integration tests.

### `src/core/logging/`

- Responsibilities: typed log categories, correlation ids, redaction policies.
- Inputs/outputs: structured event payload -> sanitized persisted/runtime log event.
- Failure behavior: redaction failure drops sensitive fields and emits safe warning.
- Verification expectations: sensitive-field redaction unit tests.

### `src/core/validation/`

- Responsibilities: schema validation and normalized error shaping.
- Inputs/outputs: user/import payload -> valid typed payload or ValidationError with `fieldErrors`.
- Failure behavior: reject invalid payload before transaction entry.
- Verification expectations: validator unit tests + UI field-error rendering tests.

### `src/modules/merchant/`

- Responsibilities: merchant/store/menu/combo management, review workflow, version compare, media constraints.
- Inputs/outputs: domain forms + file picker payloads -> draft/review/publish state transitions.
- Failure behavior: stale version conflict, unauthorized publish, invalid media type/size, missing record.
- Verification expectations: integration workflow tests + component tests for upload/compare/conflict states.

### `src/modules/booking/`

- Responsibilities: availability calendar, guided booking, conflict detection, reschedule/cancel policy enforcement.
- Inputs/outputs: slot selection + booking payload + idempotency key -> booking mutation results.
- Failure behavior: lock denial, oversell conflict, duplicate request, late-cancel classification, missing booking record.
- Verification expectations: multi-tab E2E + policy boundary integration tests.

### `src/modules/recruiting/`

- Responsibilities: offer template usage, HR approval routing, signature capture, onboarding docs/checklist.
- Inputs/outputs: offer/doc/signature forms -> recruiting state transitions.
- Failure behavior: non-HR approval attempt, missing typed signature name, SSN validation error, missing candidate/offer records.
- Verification expectations: approval routing tests + signature/SSN component/integration tests.

### `src/modules/org-admin/`

- Responsibilities: org tree management, position dictionary, occupancy computation.
- Inputs/outputs: hierarchy and position mutations -> recalculated occupancy views.
- Failure behavior: invalid tree links, headcount rule violations, missing node/position records.
- Verification expectations: hierarchy validation integration tests + occupancy computation tests.

### `src/modules/collaboration/`

- Responsibilities: context-aware threads, canned responses, shared notes, archiving, keyword/date search.
- Inputs/outputs: workflow context + conversation actions -> thread/message/note state updates.
- Failure behavior: unauthorized context access, invalid date range, missing thread, duplicate-action guard on resend.
- Verification expectations: context isolation integration tests + search/filter tests.

## 5) Browser support and lock fallback disposition

- Full support baseline: browsers with IndexedDB + BroadcastChannel + Service Worker.
- Web Locks path is primary for cross-tab mutual exclusion.
- If Web Locks is unavailable, lock manager falls back to Dexie-backed lease locks (transactional compare-and-set + TTL + BroadcastChannel invalidation notices).
- If BroadcastChannel is unavailable, app is treated as unsupported for prompt-critical multi-tab coordination and blocks booking/import mutations with explicit unsupported-browser messaging.

## 6) Delivery slices (reviewable increments)

Completed slices in current repo state:

1. Scaffold + contracts: app shell, routing, Dexie schema, auth bootstrap, permission matrix, logger/validator.
2. Merchant vertical slice: CRUD + media validation + review/publish + version compare.
3. Booking vertical slice: availability + guided booking + conflict prevention + policy enforcement.
4. Recruiting vertical slice: template->approval->signature->onboarding.
5. Org Admin + collaboration slice.
6. Import/export, recovery hardening, multi-tab consistency, test/docs convergence.
