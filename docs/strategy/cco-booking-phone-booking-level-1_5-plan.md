---
owner: CCO
status: active
---

# CCO Booking Phone Booking Level 1.5 Plan

## Status

- Date: 2026-05-16
- Scope: saved implementation plan for CCO Booking phone booking support
- Intent: preserve the agreed product direction before code work begins

## Related documents

- Prod and rollout checklist: [cco-booking-prod-readiness-checklist.md](./cco-booking-prod-readiness-checklist.md)

## Executive summary

CCO Booking should support operators during live phone calls without pretending that CCO already performs direct booking in Cliento.

The recommended first delivery is **Level 1.5**:

- show available times inside CCO
- let the operator choose a time during the call
- save that choice inside the booking case
- explicitly mark the booking as confirmed externally in Cliento
- preserve an audit trail for who selected and who confirmed

This gives immediate operator value with lower operational risk than direct API booking.

## Why this path is recommended

This approach separates two different capabilities:

1. **See available times**
2. **Create the final booking**

That distinction is important because the business value arrives early at step 1, while the implementation risk rises sharply at step 2.

Level 1.5 is recommended because it:

- helps the operator in the call right away
- improves booking discipline and consistency
- avoids fake automation
- creates the booking state model needed later for direct API booking
- reduces the risk of double-booking and silent sync failures

## Product goal

CCO Booking should become a fast, trustworthy phone-booking workspace where the operator can:

- open the customer
- click `Boka via telefon`
- review available time options
- choose a time
- save the selection in the booking case
- confirm that the booking was actually entered manually in Cliento

The system must clearly distinguish between:

- a time chosen in CCO
- a booking actually confirmed externally

## Operator workflow

### Step 1: open the customer

The operator opens the relevant booking case in CCO.

### Step 2: click `Boka via telefon`

This opens a dedicated booking work mode in the center workspace.

### Step 3: choose booking context

The operator sees or confirms:

- service / treatment
- clinician / resource
- date interval
- clinic / location when relevant

Known case data should be prefilled whenever possible.

### Step 4: view available times

CCO shows available slots in a booking-focused UI.

For alpha, a slot list is preferred over a heavy calendar grid because it is:

- faster to implement
- easier during live calls
- less visually dense

### Step 5: choose a slot

The operator selects a slot.

CCO stores:

- selected service
- selected clinician / resource
- selected slot
- who selected it
- when it was selected

At this stage the booking is **not** considered fully booked.

### Step 6: confirm externally

After the operator enters the booking manually in Cliento, they explicitly mark it in CCO using a control such as:

- `Bekräftad i Cliento`
- `Lagd manuellt`

CCO then stores:

- confirmed by
- confirmed at
- confirmation note if needed

### Step 7: continue the journey

After confirmation, CCO should surface the next action:

- customer confirmation
- next handoff
- consultation / operation / aftercare continuation depending on the journey

## Core product rules

### Rule 1: selected time is not booked time

The UI must never blur this distinction.

### Rule 2: external confirmation is explicit

Manual confirmation must be a deliberate action, not an implicit assumption.

### Rule 3: changing the selected time must be easy

The operator must be able to reselect before confirmation.

### Rule 4: audit is mandatory

We always need to know:

- who selected the time
- who confirmed it
- when each step happened

### Rule 5: the flow must stay phone-friendly

This should feel like operator support, not calendar administration.

## Recommended state model

### Booking states

- `needs_time_selection`
- `time_selected`
- `pending_external_confirmation`
- `externally_confirmed`
- `reschedule_needed`
- `cancelled`

### Minimum useful payload

```json
{
  "bookingMode": "phone",
  "serviceId": "consultation",
  "serviceLabel": "Konsultation",
  "resourceId": "egzona",
  "resourceLabel": "Egzona",
  "selectedSlot": {
    "start": "2026-05-20T10:30:00+02:00",
    "end": "2026-05-20T11:00:00+02:00"
  },
  "selectionStatus": "time_selected",
  "externallyConfirmed": false,
  "selectedBy": "fk",
  "selectedAt": "2026-05-16T14:22:00+02:00",
  "confirmedBy": "",
  "confirmedAt": "",
  "confirmationNote": ""
}
```

## Recommended UI structure

When a booking case enters phone-booking mode, the center workspace should show:

### Header

- title: `Boka via telefon`
- compact status indicator:
  - `Inte bokad ännu`
  - `Vald i CCO`
  - `Bekräftad i Cliento`

### Booking context

- service
- clinician / resource
- date interval
- clinic when needed

### Available slots

- slot list first
- optional calendar view later

### Selected slot card

- chosen date and time
- clinician
- service
- state: `Ej bekräftad externt`

### Actions

- primary: `Bekräftad i Cliento`
- secondary:
  - `Välj annan tid`
  - `Ångra val`

### Audit row

Example:

- `Vald av FK 2026-05-16 14:22`
- `Bekräftad manuellt 2026-05-16 14:26`

## What alpha must include

Level 1.5 should be considered alpha-ready when we have:

- a clear `Boka via telefon` entry point
- a booking phone mode in the main workspace
- available slots from demo/mock or real source
- slot selection
- visible `Vald i CCO` state
- explicit external confirmation
- audit information
- next-step guidance after confirmation

## What alpha should not include yet

The first pass should not try to solve:

- direct booking creation in Cliento via API
- full double-booking protection in CCO
- advanced resource administration
- full calendar management UI
- heavy backend integration before workflow semantics are proven

## Recommended implementation order

### Pass A: state and booking workspace shell

Deliver:

- `Boka via telefon` entry
- booking phone mode state
- workspace shell
- selected slot status area

Done when:

- an operator can open booking mode and understand where the flow happens

### Pass B: available slots and selection

Deliver:

- slot list
- optional service / resource filters
- slot selection
- selected slot card

Done when:

- an operator can actually choose a time in the workflow

### Pass C: external confirmation and audit

Deliver:

- `Bekräftad i Cliento`
- manual confirmation logging
- audit rendering
- state transition to externally confirmed

Done when:

- the operator can complete the phone-booking support flow honestly

### Pass D: queue, next action, and handoff integration

Deliver:

- booking-aware queue labels
- next action updates
- customer intel updates
- journey handoff after confirmation

Done when:

- the rest of CCO understands the new booking state

## Recommended repo starting points

First implementation should likely begin in:

- `public/major-arcana-preview/app.js`
- `public/major-arcana-preview/styles.css`

Likely tests to extend:

- `tests/ops/majorArcanaBookingWorkflowTruth.test.js`
- `tests/ops/majorArcanaFocusTruthPrimary.test.js`
- `tests/ops/majorArcanaRuntimeQueueRender.test.js`

Possible later extraction:

- booking-specific store logic under `src/ops`

## Product recommendation

The recommended product strategy is:

1. **Level 1**
   - show calendar / available times
2. **Level 1.5**
   - choose a time
   - save it in CCO
   - confirm externally
   - audit the action
3. **Level 2**
   - only later, add direct booking via Cliento/API after access and safeguards are secured

This is not a half-solution. It is the safest first real solution.

## Key risk list

- operators may mistake `selected time` for `fully booked`
- audit may be too weak if confirmation is not explicit
- the workspace may become too heavy for a live phone call
- the team may jump to API booking before workflow semantics are stable

## Final recommendation

The next real build should be a coherent first alpha pass that combines:

- Pass A
- Pass B
- Pass C

That would produce the first real phone-booking workflow inside CCO Booking without overcommitting to risky direct integration too early.
