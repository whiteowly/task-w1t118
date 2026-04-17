# LocalOps Workspace — Backend API Endpoint Inventory

Base URL: `http://127.0.0.1:3001/api/v1`

All endpoints return JSON. Error responses follow the shape:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message." } }
```

## Health

| Method | Path             | Auth | Handler            | Description           |
| ------ | ---------------- | ---- | ------------------ | --------------------- |
| GET    | `/api/v1/health` | No   | `routes/health.ts` | Server liveness check |

## Auth

| Method | Path                           | Auth   | Handler                                                      | Description                                         |
| ------ | ------------------------------ | ------ | ------------------------------------------------------------ | --------------------------------------------------- |
| POST   | `/api/v1/auth/bootstrap-admin` | No     | `routes/auth.ts` → `services/auth-service.ts#bootstrapAdmin` | Create the initial administrator account (one-time) |
| POST   | `/api/v1/auth/login`           | No     | `routes/auth.ts` → `services/auth-service.ts#login`          | Authenticate and receive a bearer token             |
| POST   | `/api/v1/auth/logout`          | Bearer | `routes/auth.ts` → `services/auth-service.ts#logout`         | Invalidate the current session token                |

## Merchants

All merchant endpoints require `Authorization: Bearer <token>`.

| Method | Path                                    | Auth   | Capability                         | Handler                                                                        | Description                 |
| ------ | --------------------------------------- | ------ | ---------------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| GET    | `/api/v1/merchants`                     | Bearer | `workspace.merchant.view`          | `routes/merchants.ts` → `services/merchant-service.ts#listMerchants`           | List all merchants          |
| POST   | `/api/v1/merchants`                     | Bearer | `workspace.merchant.editDraft`     | `routes/merchants.ts` → `services/merchant-service.ts#createMerchantDraft`     | Create a new merchant draft |
| PATCH  | `/api/v1/merchants/:merchantId`         | Bearer | `workspace.merchant.editDraft`     | `routes/merchants.ts` → `services/merchant-service.ts#updateMerchantDraft`     | Update a merchant draft     |
| POST   | `/api/v1/merchants/:merchantId/submit`  | Bearer | `workspace.merchant.editDraft`     | `routes/merchants.ts` → `services/merchant-service.ts#submitMerchantForReview` | Submit merchant for review  |
| POST   | `/api/v1/merchants/:merchantId/approve` | Bearer | `workspace.merchant.reviewPublish` | `routes/merchants.ts` → `services/merchant-service.ts#approveMerchant`         | Approve merchant            |
| POST   | `/api/v1/merchants/:merchantId/reject`  | Bearer | `workspace.merchant.reviewPublish` | `routes/merchants.ts` → `services/merchant-service.ts#rejectMerchant`          | Reject merchant             |
| POST   | `/api/v1/merchants/:merchantId/publish` | Bearer | `workspace.merchant.reviewPublish` | `routes/merchants.ts` → `services/merchant-service.ts#publishMerchant`         | Publish merchant            |

## Bookings

All booking endpoints require `Authorization: Bearer <token>`.

| Method | Path                                     | Auth   | Capability                 | Handler                                                                      | Description                                 |
| ------ | ---------------------------------------- | ------ | -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| GET    | `/api/v1/bookings/availability`          | Bearer | `workspace.booking.view`   | `routes/bookings.ts` → `services/booking-service.ts#listBookingAvailability` | Availability grid (`?date=YYYY-MM-DD`)      |
| GET    | `/api/v1/bookings`                       | Bearer | `workspace.booking.view`   | `routes/bookings.ts` → `services/booking-service.ts#listBookings`            | List bookings for date (`?date=YYYY-MM-DD`) |
| POST   | `/api/v1/bookings`                       | Bearer | `workspace.booking.manage` | `routes/bookings.ts` → `services/booking-service.ts#createBooking`           | Create a booking                            |
| POST   | `/api/v1/bookings/:bookingId/reschedule` | Bearer | `workspace.booking.manage` | `routes/bookings.ts` → `services/booking-service.ts#rescheduleBooking`       | Reschedule a booking                        |
| POST   | `/api/v1/bookings/:bookingId/cancel`     | Bearer | `workspace.booking.manage` | `routes/bookings.ts` → `services/booking-service.ts#cancelBooking`           | Cancel a booking                            |

## Endpoint count

| Category  | Count  |
| --------- | ------ |
| Health    | 1      |
| Auth      | 3      |
| Merchants | 7      |
| Bookings  | 5      |
| **Total** | **16** |

## Test coverage

All 16 endpoints have direct HTTP test coverage in `tests/api/`. Tests use supertest against a real Express app with a real in-memory SQLite database. Zero mocking.

| Test file                     | Endpoints covered | Test count |
| ----------------------------- | ----------------- | ---------- |
| `tests/api/health.test.ts`    | 1                 | 1          |
| `tests/api/auth.test.ts`      | 3                 | 10         |
| `tests/api/merchants.test.ts` | 7                 | 11         |
| `tests/api/bookings.test.ts`  | 5                 | 9          |
| **Total**                     | **16/16 (100%)**  | **31**     |
