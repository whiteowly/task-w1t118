# LocalOps Workspace — Service Interface Matrix

This document catalogues every exported service-layer function that forms the
public interface contract of the LocalOps workspace modules. Because the
application has no backend HTTP API (all persistence is browser-local
IndexedDB), the "API surface" is the set of service functions consumed by UI
components and tested through integration/unit suites.

**Coverage target:** 90 % of interfaces must have direct test coverage
(unit or integration import + assertion).

## Interface matrix

| # | Module | Function | Tested | Test evidence |
|---|--------|----------|--------|---------------|
| 1 | merchant | `listMerchants` | yes | integration/merchant/merchant-workflow |
| 2 | merchant | `createMerchantDraft` | yes | integration/merchant/merchant-workflow |
| 3 | merchant | `updateMerchantDraft` | yes | integration/merchant/merchant-workflow |
| 4 | merchant | `submitMerchantForReview` | yes | integration/merchant/merchant-workflow |
| 5 | merchant | `approveMerchant` | yes | integration/merchant/merchant-workflow |
| 6 | merchant | `rejectMerchant` | yes | integration/merchant/merchant-workflow |
| 7 | merchant | `publishMerchant` | yes | integration/merchant/merchant-workflow |
| 8 | merchant | `listMerchantVersions` | yes | integration/merchant/merchant-sub-entities |
| 9 | merchant | `compareMerchantVersions` | yes | integration/merchant/merchant-sub-entities |
| 10 | merchant | `createMediaAsset` | no | requires FileReader.readAsDataURL (DOM-only) |
| 11 | merchant | `getMediaAssetDataUrl` | no | requires FileReader.readAsDataURL (DOM-only) |
| 12 | merchant | `listStores` | yes | integration/merchant/merchant-sub-entities |
| 13 | merchant | `createStore` | yes | integration/merchant/merchant-workflow |
| 14 | merchant | `updateStore` | yes | integration/merchant/merchant-workflow |
| 15 | merchant | `listMenus` | yes | integration/merchant/merchant-sub-entities |
| 16 | merchant | `createMenu` | yes | integration/merchant/merchant-sub-entities |
| 17 | merchant | `updateMenu` | yes | integration/merchant/merchant-sub-entities |
| 18 | merchant | `listCombos` | yes | integration/merchant/merchant-sub-entities |
| 19 | merchant | `createCombo` | yes | integration/merchant/merchant-sub-entities |
| 20 | merchant | `updateCombo` | yes | integration/merchant/merchant-sub-entities |
| 21 | merchant | `canEditDraftActions` | yes | unit/merchant/merchant-service-helpers |
| 22 | merchant | `canReviewPublishActions` | yes | unit/merchant/merchant-service-helpers |
| 23 | merchant | `isWorkflowTransitionAllowed` | yes | unit/merchant/merchant-service-helpers |
| 24 | booking | `listBookingAvailabilityForDate` | yes | integration/booking/booking-service |
| 25 | booking | `listBookingsForDate` | yes | integration/booking/booking-service |
| 26 | booking | `previewBookingConflict` | yes | integration/booking/booking-service |
| 27 | booking | `createOrRefreshBookingHold` | yes | integration/booking/booking-holds |
| 28 | booking | `releaseBookingHold` | yes | integration/booking/booking-holds |
| 29 | booking | `createBooking` | yes | integration/booking/booking-service |
| 30 | booking | `rescheduleBooking` | yes | integration/booking/booking-service |
| 31 | booking | `cancelBooking` | yes | integration/booking/booking-service |
| 32 | booking | `canManageBookingActions` | yes | unit/booking/booking-service-helpers |
| 33 | booking | `getBookingResources` | yes | unit/booking/booking-service-helpers |
| 34 | booking | `getBookingDurationOptions` | yes | unit/booking/booking-service-helpers |
| 35 | booking | `todayBookingDateKey` | yes | integration/booking/booking-service |
| 36 | recruiting | `canManageRecruitingActions` | yes | unit/recruiting/recruiting-service-helpers |
| 37 | recruiting | `canApproveRecruitingActions` | yes | unit/recruiting/recruiting-service-helpers |
| 38 | recruiting | `listOfferTemplates` | yes | integration/recruiting/recruiting-service |
| 39 | recruiting | `createOfferFromTemplate` | yes | integration/recruiting/recruiting-service |
| 40 | recruiting | `listRecruitingOffers` | yes | integration/recruiting/recruiting-service |
| 41 | recruiting | `approveOffer` | yes | integration/recruiting/recruiting-service |
| 42 | recruiting | `rejectOffer` | yes | integration/recruiting/recruiting-service |
| 43 | recruiting | `captureOfferSignature` | yes | integration/recruiting/recruiting-service |
| 44 | recruiting | `upsertOnboardingDocument` | yes | integration/recruiting/recruiting-service |
| 45 | recruiting | `getOnboardingDocument` | yes | integration/recruiting/recruiting-onboarding-retrieval |
| 46 | recruiting | `listOnboardingChecklist` | yes | integration/recruiting/recruiting-service |
| 47 | recruiting | `updateChecklistItemStatus` | yes | integration/recruiting/recruiting-service |
| 48 | orgAdmin | `canManageOrgAdminStructure` | yes | unit/org-admin/org-admin-helpers |
| 49 | orgAdmin | `ensureOrgAdminSeedData` | yes | unit/org-admin/org-admin-helpers |
| 50 | orgAdmin | `listOrgHierarchyNodes` | yes | integration/org-admin/org-admin-structure-service |
| 51 | orgAdmin | `createHierarchyNode` | yes | integration/org-admin/org-admin-structure-service |
| 52 | orgAdmin | `listPositionDictionary` | yes | integration/org-admin/org-admin-structure-service |
| 53 | orgAdmin | `createPositionDefinition` | yes | integration/org-admin/org-admin-structure-service |
| 54 | orgAdmin | `computePositionOccupancyStats` | yes | integration/org-admin/org-admin-structure-service |
| 55 | collaboration | `listContextHistory` | yes | integration/collaboration/collaboration-service |
| 56 | collaboration | `postContextMessage` | yes | integration/collaboration/collaboration-service |
| 57 | collaboration | `setContextMessageArchived` | yes | integration/collaboration/collaboration-service |
| 58 | collaboration | `listSharedNotes` | yes | integration/collaboration/collaboration-service |
| 59 | collaboration | `createSharedNote` | yes | integration/collaboration/collaboration-service |
| 60 | collaboration | `updateSharedNote` | yes | integration/collaboration/collaboration-extended |
| 61 | collaboration | `setSharedNoteArchived` | yes | integration/collaboration/collaboration-service |
| 62 | collaboration | `listCannedResponses` | yes | integration/collaboration/collaboration-service |
| 63 | collaboration | `createCannedResponse` | yes | integration/collaboration/collaboration-extended |
| 64 | collaboration | `setCannedResponseArchived` | yes | integration/collaboration/collaboration-extended |
| 65 | collaboration | `searchCollaborationRecords` | yes | integration/collaboration/collaboration-service |
| 66 | importExport | `listImportExportEntityOptions` | yes | unit/import-export/import-export-helpers |
| 67 | importExport | `previewImport` | yes | integration/import-export/import-export-service |
| 68 | importExport | `commitImport` | yes | integration/import-export/import-export-service |
| 69 | importExport | `exportEntity` | yes | integration/import-export/import-export-service |
| 70 | permissions | `hasCapability` | yes | unit/permissions/service |

## Coverage summary

| Metric | Value |
|--------|-------|
| Total interfaces | 70 |
| Tested | 68 |
| Not tested | 2 |
| Coverage | 97.14 % |
| Target | 90 % |

### Not tested (justification)

| Function | Reason |
|----------|--------|
| `createMediaAsset` | Requires `FileReader.readAsDataURL` which is unavailable in jsdom/fake-indexeddb test harness |
| `getMediaAssetDataUrl` | Depends on media assets created via `createMediaAsset`; same DOM limitation |

Both are exercised indirectly by E2E Playwright tests via the merchant image upload UI flow.
