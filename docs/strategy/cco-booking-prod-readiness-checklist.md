# CCO Booking Prod Readiness Checklist

## Status

- Date: 2026-05-16
- Scope: production readiness and live verification checklist for CCO Booking on Hair TP
- Builds on: [cco-booking-phone-booking-level-1_5-plan.md](./cco-booking-phone-booking-level-1_5-plan.md)

## Purpose

This document is the operational companion to the Level 1.5 product plan.

It answers a different question:

- not "what should we build?"
- but "what must be true before CCO Booking works safely and predictably in live use?"

CCO Booking is not a separate app. It is the booking workspace inside the same CCO console:

- queue
- focus / conversation workspace
- customer intelligence
- Svarstudio

That means prod readiness depends on both:

- the booking flow itself
- the surrounding CCO runtime being healthy

## Production target

Primary product URL:

- [https://arcana.hairtpclinic.se/major-arcana-preview/](https://arcana.hairtpclinic.se/major-arcana-preview/)

Booking is considered live-ready when an operator can:

1. open CCO
2. select a booking-relevant thread with a real customer email
3. enter the booking workspace
4. see booking context and readout
5. fetch Cliento reference data and slots
6. choose 1-3 candidate times
7. create an offer draft for Svarstudio
8. move the case to waiting state
9. later mark the booking as confirmed externally
10. continue to closure or next handoff without ambiguity

## System map

### Product and UI

- Preview / live shell: `public/major-arcana-preview/`
- Main booking surface: `data-booking-surface` in `index.html` and `app.js`

### Backend and orchestration

- Booking API: `src/routes/ccoBookings.js`
- Booking persistence: `src/ops/ccoBookingStore.js`
- Workspace bootstrap: `src/routes/ccoWorkspace.js`
- Runtime async bootstrap: `public/major-arcana-preview/runtime-async-orchestration.js`
- Server mounting: `server.js`

### Config and dependencies

- Config: `src/config.js`
- Brand runtime config: `src/brand/runtimeConfig.js`
- Intelligence classifier context: `cco-server/src/intelligence/*`

## Preflight assumptions

Before testing live, assume all of the following:

- the correct branch has been deployed
- the booking API is mounted under `/api/v1`
- session auth works for the target tenant
- the mailbox / graph layer is healthy enough for CCO to load real threads
- Cliento credentials are present and valid
- the booking store path points to persistent storage, not ephemeral disk

If any one of these is false, the booking surface may render partially but still fail in practice.

## Required environment configuration

### Booking store persistence

- `ARCANA_CCO_BOOKING_STORE_PATH`

Checklist:

- points to a persistent Render disk path
- writable by the running process
- survives restart / redeploy
- not shared accidentally across unrelated tenants unless intentionally designed that way

Failure symptom:

- booking cases appear to work temporarily, then disappear after restart

### Cliento identity and access

- `CLIENTO_PARTNER_ID`
- `CLIENTO_BOOKING_URL`
- `CLIENTO_API_KEY`
- `CLIENTO_API_BASE_URL`
- `CLIENTO_ACCOUNT_IDS`

Checklist:

- partner id resolves correctly for Hair TP
- booking URL matches the same partner identity
- API key is valid in the current environment
- API base URL is the intended environment
- account ids are present for the brand

Failure symptom:

- `/cco-bookings/slots` or `/ref-data` returns `503`
- no resources or services load
- booking surface falls back to manual slot handling only

### Session and tenant

- tenant resolves to `hair-tp-clinic`
- operators can log in normally
- owner / privileged preview access is not masking broken session behavior for ordinary users

Failure symptom:

- localhost works but production operators cannot access booking actions reliably

## Functional prod checklist

### A. CCO shell health

- CCO loads without fatal console errors
- the queue renders correctly
- a real customer thread can be selected
- customer intelligence and focus workspace render for that thread

### B. Booking bootstrap

- selecting a booking-relevant thread creates or reads a booking case
- `bookingReadout.enabled` becomes true for the active thread
- booking status starts in a sensible state such as `needs_triage`
- the booking panel is not blank once a valid conversation and customer exist

### C. Cliento reference data

- services load
- resources / clinicians load
- date range controls are usable
- slot fetching succeeds for at least one realistic context

### D. Candidate selection

- operator can pick 1-3 candidate slots
- selected slots persist in the case
- status moves into the expected next state
- no more than 3 candidates can be saved

### E. Offer draft and Svarstudio

- `offer-draft` produces Swedish operator-facing output
- raw ISO timestamps do not leak into the operator draft
- draft text can be inserted into Svarstudio
- draft language does not mention Cliento to the customer

### F. Waiting and follow-up

- case can move to `waiting_customer`
- operator can log relevant events such as handoff / follow-up opened
- waiting state is readable in the booking UI and queue logic

### G. External confirmation

- operator can mark `confirmed_external`
- the UI clearly distinguishes:
  - selected in CCO
  - confirmed externally
- audit fields show who confirmed and when
- confirmed state does not pretend CCO performed direct booking itself

### H. Closure and history

- case can move to `closed`
- event history remains readable
- recent activity survives reload

## Hair TP live test script

Use this as a literal operator-style test run.

### Step 1: open the product

- open [https://arcana.hairtpclinic.se/major-arcana-preview/](https://arcana.hairtpclinic.se/major-arcana-preview/)
- log in with a normal Hair TP operator-capable account

### Step 2: find a booking-relevant thread

- choose a thread with:
  - a real customer email
  - clear booking intent, or
  - a known booking case

### Step 3: verify booking bootstrap

- confirm the booking workspace appears
- confirm the case is not blank
- confirm the readout shows a meaningful next step

### Step 4: verify Cliento context

- load services and clinicians
- request slots for a realistic date interval
- confirm at least one real slot returns

### Step 5: choose candidate times

- save 1-3 slots
- confirm the case updates
- confirm the operator can still adjust the selection if needed

### Step 6: create and inspect the offer draft

- generate the draft
- inspect language quality
- ensure no raw ISO time formatting leaks
- ensure the customer-facing text is usable

### Step 7: move to waiting state

- mark the case as waiting for customer
- confirm queue/readout state reflects that

### Step 8: simulate external completion

- mark the booking as confirmed externally
- confirm audit fields appear correctly
- confirm post-confirmation next step is clear

### Step 9: reload sanity check

- refresh the page
- reopen the same thread
- confirm booking state, chosen slots, audit, and status still exist

## Failure modes to watch closely

### 1. "Booking panel is empty"

Usually means one of:

- no active conversation
- no customer email / customer identity
- bootstrap did not resolve a booking case
- readout is disabled for the current thread

### 2. "Slots do not load"

Usually means one of:

- missing `CLIENTO_PARTNER_ID`
- invalid Cliento API credentials
- wrong base URL
- resource/service mismatch

### 3. "Looks fine in preview, breaks for operators"

Usually means one of:

- owner localhost bypass masked auth problems
- session token path differs in production
- booking relies on state that preview seeded more generously than live

### 4. "Booking disappeared after restart"

Usually means:

- booking store path is not persistent

### 5. "Confirmed external is misleading"

Usually means:

- UI language implies auto-booking
- audit is too weak
- operator cannot tell what happened inside CCO vs outside CCO

## Acceptance gate for production confidence

We should consider Hair TP production confidence materially stronger when all of these are true:

- a real operator account can run the end-to-end flow
- slots and reference data come from real Cliento config
- state persists across refresh and restart
- offer draft quality is acceptable in Swedish
- external confirmation is auditable and unambiguous
- the booking workspace remains understandable without internal developer context

## Nice-to-have after prod readiness

These are not required for initial live confidence:

- richer slot ranking
- better reason text for slot recommendations
- deeper post-confirmation handoff guidance
- direct Cliento booking via API
- stronger booking analytics and admin summaries

## Recommended operating stance

For now, CCO Booking should be treated as:

- a live operator support surface
- a persisted booking case manager
- a disciplined bridge to manual booking in Cliento

It should not yet be described internally as:

- a full autonomous booking engine
- a source of final booking truth independent of Cliento

That distinction protects both operator trust and rollout safety.
