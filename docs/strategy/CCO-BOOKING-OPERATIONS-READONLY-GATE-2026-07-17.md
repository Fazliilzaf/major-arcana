# CCO Booking Operations — read-only contract gate

Status: **NO_GO for booking writes**

Date: 2026-07-17

Scope: create, move and cancel from `/admin#cco`, using the existing canonical booking and patient/encounter model.

The machine-readable source for this review is
[`cco-booking-operations-readonly-contract.json`](./cco-booking-operations-readonly-contract.json).

## Inventory result

| Area                                        | Status                   | Existing source                                                          |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Canonical Calendar and Customers read model | Exists                   | `GET /api/v1/cco-bookings/calendar-bundle`, `ccoKunderBookingEnrichment` |
| CCO booking engine                          | Exists, not release-safe | `src/ops/ccoBookingEngineStore.js`                                       |
| CCO booking cases and event history         | Exists                   | `src/ops/ccoBookingStore.js`                                             |
| CCO create                                  | Partial                  | reserve + confirm endpoints                                              |
| CCO move                                    | Partial and non-atomic   | engine rebook + calendar rebook endpoints                                |
| CCO cancel                                  | Partial                  | engine cancel endpoint                                                   |
| Cliento read adapter                        | Exists                   | `src/infra/clientoApi.js`                                                |
| Cliento write adapter                       | **Missing**              | no create, move or cancel method                                         |
| Active `/admin#cco` write UI                | Disabled                 | `CCO_CALENDAR_READ_ONLY = true`, write bridge short-circuited            |

No demo route or alternate customer/calendar model is a valid dependency for this work.

## Existing APIs

Read-only APIs that are safe to reuse:

- `GET /api/v1/cco-bookings/calendar-bundle`
- `GET /api/v1/cco-bookings/slots`
- `GET /api/v1/cco-bookings/ref-data`
- `GET /api/v1/cco-booking-engine/availability`
- `GET /api/v1/cco-booking-engine/catalog`
- `GET /api/v1/cco-booking-engine/case-summary`

Existing mutation APIs, all blocked from activation in this phase:

- Create: `POST /api/v1/cco-booking-engine/reservations`, then `POST /api/v1/cco-booking-engine/confirm`
- Move: `POST /api/v1/cco-booking-engine/rebook` or `POST /api/v1/cco-bookings/calendar/rebook`
- Cancel: `POST /api/v1/cco-booking-engine/cancel`

The Cliento adapter currently calls only GET endpoints. `ARCANA_CLIENTO_INTEGRATION_ENABLED`
therefore enables reference data and availability, not real Cliento mutations.

## Contract matrix

| Action | Authorization today                                                                             | Audit today                                                                    | Idempotency today                                           | Failure and recovery today                                                                                                  | Gate        |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Create | Authenticated session + conversation/email context. No explicit staff guard on reserve/confirm. | Engine record and mutable case events. No append-only CCO audit event.         | No required key; retry can repeat events and notifications. | Several stores and downstream syncs run sequentially. No explicit rollback endpoint.                                        | **BLOCKED** |
| Move   | Calendar route checks OWNER/STAFF; generic engine route does not.                               | Previous booking linkage and case event exist. No append-only CCO audit event. | No required key or expected version.                        | `cancel -> save -> reserve -> save -> confirm -> save`; later failure can leave the old booking cancelled. No compensation. | **BLOCKED** |
| Cancel | Authenticated session + context. No explicit staff guard.                                       | `cancelledBy` and case event exist. No append-only CCO audit event.            | Retry returns 404 instead of replaying the original result. | Booking commits before patient/notification work. Email failure is downgraded to skipped. No exact restore endpoint.        | **BLOCKED** |

The file writes themselves use atomic temp-file rename. That protects one JSON file from a torn
write, but it does not create a transaction across the engine store, case store, patient360,
journal, encounter or notifications.

## Canonical identity gate

The engine currently locates an operation by `tenantId + conversationId + customerEmail`.
Before any GO, every mutation must instead carry and verify:

- canonical `patientId`
- target `bookingId`, or an immutable new-booking intent id
- `encounterId`, or an explicit pre-visit `null` policy
- canonical `serviceId`, `resourceId` and `startsAt`
- tenant ownership for all referenced records

Email may remain display/contact data, but it must not be the authority for a booking mutation.

## Required gate per action

All actions require:

1. fail-closed `bookings.write` authorization and explicit staff role;
2. canonical identity and tenant checks;
3. required `x-idempotency-key` plus request fingerprint and replay semantics;
4. append-only audit records for requested, committed, failed and compensated outcomes;
5. complete preflight before the first write;
6. a tested recovery/compensation path;
7. notification and mail side effects separated from the booking commit.

Move additionally requires an atomic transaction or compensation that restores the previous
booking. Cancel additionally requires an expected booking version and an exact restore procedure.

## Recommended first user flow

Build **Create booking preflight** first, read-only, in the existing Calendar drawer:

1. Operator opens a canonical patient/visit without leaving `/admin#cco`.
2. The drawer displays canonical patient, proposed treatment, resource, Stockholm time and
   encounter policy.
3. It displays provider truth: `cliento = write unavailable` or `cco_engine = gated`.
4. It lists every passed and failed authorization, identity, availability, audit, idempotency and
   recovery gate.
5. It exposes no confirm, drag, cancel or save action.

After a separate GO and hardening, **create** should be the first mutation: reserve then confirm a
new booking. It is safer than move or cancel because no existing booking must be destroyed before
the new operation succeeds. Move should be last because the current sequence cancels first.

## Explicitly out of scope

- no Cliento or CCO booking write
- no booking, move or cancel button
- no mail, notification, Drive or encounter mutation
- no deploy
- no demo route, fixture or parallel booking/customer model
