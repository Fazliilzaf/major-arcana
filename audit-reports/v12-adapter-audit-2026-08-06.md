# V12 Content-Canon Adapter Audit Report

**Repository:** `/Users/fazlikrasniqi/Code/major-arcana`  
**Branch:** `feat/v11-v12-optimal-sweep`  
**Date:** 2026-08-06  
**Scope:** `public/major-arcana-preview/app/cco-v12-canon.js` (renderer) vs `public/major-arcana-preview/app/cco-v11-rail-adapters.js` (data adapters)

---

## 1. Executive Summary

The V12 content-canon renderer (`CcoV12Canon.render`) is wired to a **small subset** of the V11 rail adapters. Several sections read **raw context fields directly** instead of using the normalized adapters, and two important document categories—**offers/treatment plans** and **auto-documents**—are never rendered in the canon because the corresponding adapters are not called. The `ctx.commercialCase` object is passed into the render context by `patient-master-ui.js` but is **not consumed** by the canon, which reproduces a known offer-block blind spot.

The companion V12 workspace renderer (`CcoV12Workspace`) uses the adapters more completely and already passes `commercialCase`; this report focuses on the content-canon path, but notes where the workspace contract can be reused.

---

## 2. Canon Section → Adapter Mapping

| Canon section         | Function                                             | Adapter(s) actually called                                                                                                                        | Raw ctx fields also consumed                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| s1 Nuläge             | `s1(card, journey)`                                  | `buildJourneyFromState` (for status)                                                                                                              | `ctx.bcard`/`ctx.card`: `displayName`, `fullName`, `name`, `age`, `primaryPhone`, `phone`, `primaryEmail`, `email`, `city`, `tags`, `patientId`, `id`, `personalNumber`, `ssn`, `personnummer` |
| stats row             | `stats(card, econ, bundle)`                          | `buildEconomyFromCard` (for value)                                                                                                                | `ctx.bcard`/`ctx.card`: `visitsThisYear`, `totalValue`, `outstandingBalance`; `ctx.dossierBundle.upcomingBookings`, `historyBookings`                                                          |
| s2 Aktivt besök       | `s2(av)`                                             | `buildActiveVisitFromBundle`                                                                                                                      | None (fully adapter-driven)                                                                                                                                                                    |
| s3 Kritiska varningar | `s3(warnings)`                                       | `buildCriticalWarnings`                                                                                                                           | None (but renderer shape is `items` OR the array itself)                                                                                                                                       |
| s4 Hälsa              | `s4(health)`                                         | `buildHealthPreview`                                                                                                                              | None (fully adapter-driven)                                                                                                                                                                    |
| s5 Kundresa           | `s5(journey, av, smart, photos, health, stepAssets)` | `buildJourneyFromState`, `buildActiveVisitFromBundle`, `buildSmartNextStep`, `buildPhotosFromDriveFiles`, `buildHealthPreview`, `buildStepAssets` | `ctx.visitSegments` (photos block only)                                                                                                                                                        |
| s6 Journal            | `s6(entries)`                                        | **None**                                                                                                                                          | `ctx.journalEntries` directly                                                                                                                                                                  |
| s7 Bilder             | `s7(photos, visitSegments, patientId)`               | `buildPhotosFromDriveFiles`                                                                                                                       | `ctx.visitSegments` directly; patientId resolved from card                                                                                                                                     |
| s8 Bokningar          | `s8(bundle, patientId)`                              | **None**                                                                                                                                          | `ctx.dossierBundle.upcomingBookings`, `historyBookings` directly                                                                                                                               |
| s9 Dokument           | `s9(files, patientId)`                               | `buildFilesFromDriveFiles` only                                                                                                                   | patientId resolved from card                                                                                                                                                                   |
| s10 Kommunikation     | `s10(comm, card)`                                    | `buildCommunicationFromState`                                                                                                                     | `ctx.card.primaryEmail`/`email` for reply link                                                                                                                                                 |
| s11 Ekonomi           | `s11(econ, invoices, patientId)`                     | `buildEconomyFromCard`, `buildEconomyInvoices`                                                                                                    | patientId resolved from card                                                                                                                                                                   |
| s12 Insikter          | `s12(nextStep, insights, patientId)`                 | `buildSmartNextStep`, `buildInsightsFromSignals`                                                                                                  | patientId resolved from card                                                                                                                                                                   |
| Rail                  | `rail(events, nextStep, bundle, card)`               | `buildRecentEvents`, `buildSmartNextStep`                                                                                                         | `ctx.dossierBundle.upcomingBookings` directly; card fields                                                                                                                                     |
| Sticky                | `sticky(nextStep, card, av)`                         | `buildSmartNextStep`, `buildActiveVisitFromBundle`                                                                                                | card fields for name/patientId                                                                                                                                                                 |

**Adapters exported but never called by the canon:**

- `buildProfileFromBcard`
- `buildSmartInfoFromSignals`
- `buildStatsFromExtras`
- `buildBookingsFromExtras`
- `buildHistoryFromExtras`
- `buildJournalsFromEntries`
- `buildOfferRowFromCommercialCase`
- `buildOffersFromPayload`
- `buildAutoDocsFromPayload`
- `buildNotesFromState`
- `buildStickyActions`

These are used by `CcoV12Workspace` but not by `CcoV12Canon`.

---

## 3. Adapter Output Contracts

### A. Profile / identity

```js
buildProfileFromBcard(bcard) -> {
  name: string,
  initials: string,
  phone: string,
  email: string,
  addrLine: string,
  pills: Array<{ label: string, tone: string }>
}
```

### B. Smart info

```js
buildSmartInfoFromSignals(card) -> null | {
  primary: string,
  why: string,
  next: string,
  approvalRequired: boolean,
  confidence: string,
  moreCount: number
}
```

### C. Stats

```js
buildStatsFromExtras(bcard) -> {
  besok: { value: string, sub: string },
  vardeTot: { value: string, sub: string },
  skuld: { value: string, sub: string, unknown: boolean, hasDebt: boolean }
}
```

### D. Critical warnings

```js
buildCriticalWarnings(card, journalEntries, dossierBundle) -> Array<{
  ruleId: string,
  what: string,
  why: string,
  tone: string,
  legal: boolean
}>
```

### E. Health preview

```js
buildHealthPreview(bcard) -> {
  status: 'signed' | 'missing' | 'unknown',
  signedAt: string,
  viewUrl: string,
  documentTitle: string,
  source: string,
  allergies: string[],
  contraindications: Array<{ text: string, level: 'red' | 'amber' }>,
  medications: { items: string[], known: boolean },
  answers: Array<{ key, label, value, detail, risk }>
}
```

### F. Customer journey

```js
buildJourneyFromState(card, journalEntries, dossierBundle) -> null | {
  steps: Array<{
    id: string|number,
    label: string,
    note: string,
    state: 'done' | 'active' | 'neutral' | 'todo',
    jump: string,
    medForm: string,
    viewUrl: string,
    documentTitle: string
  }>,
  cur: number|null,
  total: number,
  pct: number,
  nextLabel: string
}
```

**Hard dependency:** `global.CcoKundkortKkx.buildCanonicalJourneyLive`. If missing, returns `null`.

### G. Smart next step

```js
buildSmartNextStep(card) -> null | {
  ruleId: string,
  what: string,
  why: string,
  tone: string,
  ctaLabel: string,
  patientId: string
}
```

**Hard dependency:** `global.CcoKunderSmartNextStep.sortSignals`.

### H. Bookings

```js
buildBookingsFromExtras(card, bcard, dossierBundle, occasionTimeline) -> {
  items: Array<normalizedBooking>,
  count: number,
  patientId: string
}
```

Normalized booking item shape:

```js
{
  iso, whenLong, whenShort, title, sub, state, stateLabel,
  staff, initials, patientId, bookingId, encounterId, source,
  sourceRecords, shadowReadmodel, historicalReason, linkAllowed,
  auditAvailable, notes: Array<{label, text}>
}
```

### I. History

```js
buildHistoryFromExtras(card, bcard, dossierBundle, occasionTimeline) -> {
  items: Array<normalizedBooking>,
  count: number
}
```

### J. Journals

```js
buildJournalsFromEntries(journalEntries) -> {
  items: Array<{
    title: string,
    snippet: string,
    meta: string,
    state: 'signed' | 'draft',
    badge: string
  }>,
  count: number
}
```

### K. Offers

```js
buildOffersFromPayload(card, dossierBundle, commercialCase) -> {
  items: Array<{
    title: string,
    amount: string,
    status: string,
    statusLabel: string,
    journeyStep: string,
    registryId: string,
    viewUrl: string,
    previewable: boolean
  }>,
  count: number
}

buildOfferRowFromCommercialCase(commercialCase) -> null | {
  title: string,
  amount: string,
  status: string
}
```

### L. Auto-documents

```js
buildAutoDocsFromPayload(card, dossierBundle) -> {
  items: Array<{
    title: string,
    status: string,
    statusLabel: string,
    journeyStep: string,
    registryId: string,
    previewable: boolean
  }>,
  count: number
}
```

### M. Photos

```js
buildPhotosFromDriveFiles(driveFiles) -> {
  items: Array<{
    id: string,
    name: string,
    href: string,
    isImage: boolean,
    capturedAt: string,
    dateLabel: string,
    phase: 'before' | 'after' | 'during' | '',
    view: 'crown' | 'hairline' | 'other' | '',
    zone: string,
    imageStage: string,
    selectedFor: string[],
    offerReady: boolean
  }>,
  count: number,
  dated: number,
  compare: null | { before, after },
  gap: string,
  viewGap: string
}
```

### N. Files

```js
buildFilesFromDriveFiles(driveFiles) -> {
  items: Array<{
    id: string,
    name: string,
    href: string,
    badge: string,
    mimeType: string,
    status: string,
    dateLabel: string,
    sourceSystem: string,
    category: string
  }>,
  count: number
}
```

### O. Notes

```js
buildNotesFromState(card, dossierBundle) -> {
  items: Array<{ text: string, meta: string, tone: string }>,
  count: number
}
```

### P. Communication

```js
buildCommunicationFromState(card, occasionTimeline, dossierBundle) -> {
  items: Array<{
    type: string,
    dir: string,
    text: string,
    preview: string,
    meta: string
  }>,
  count: number,
  patientId: string
}
```

### Q. Economy

```js
buildEconomyFromCard(card) -> {
  items: Array<{ label: string, value: string }>,
  count: number
}

buildEconomyInvoices(paymentHistory) -> {
  rows: Array<{
    id: string,
    date: string,
    title: string,
    amount: string,
    status: string,
    statusLabel: string
  }>,
  count: number
}
```

### R. Insights

```js
buildInsightsFromSignals(card) -> {
  items: Array<{ title: string, text: string, tone: string }>,
  count: number
}
```

### S. Sticky actions

```js
buildStickyActions(card, bcard, dossierBundle, occasionTimeline) -> {
  patientId: string,
  bookCount: number,
  ready: boolean
}
```

### Recent events

```js
buildRecentEvents(bcard, dossierBundle, journalEntries) -> Array<{ what: string, when: string }>
```

### Step assets

```js
buildStepAssets(journey, driveFiles, journalEntries) -> {
  [stepId]: { docs?: number, photos?: number, journals?: number }
}
```

---

## 4. Data Gaps (fields the canon expects but adapters do not provide, or adapters provide but canon ignores)

| Gap                                                                  | Severity | Canon location                                                                    | Adapter                                                     | Details                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Offers & treatment plans never rendered**                          | P0       | `s9` (`cco-v12-canon.js:1434`)                                                    | `buildOffersFromPayload`, `buildOfferRowFromCommercialCase` | The canon never calls the offer adapters. `ctx.commercialCase` is passed in by `patient-master-ui.js:7020` but ignored. Result: "Inga offerter ännu" even when a real commercial case exists. The workspace already wires this correctly at `cco-v12-workspace.js:1582`.                                                                                          |
| **Auto-documents never rendered**                                    | P0       | `s9` (`cco-v12-canon.js:1434`)                                                    | `buildAutoDocsFromPayload`                                  | The canon never calls this adapter. Only drive files are shown in the Documents section.                                                                                                                                                                                                                                                                          |
| **S8 uses raw bundle instead of normalized booking adapters**        | P0       | `s8` (`cco-v12-canon.js:1336`)                                                    | `buildBookingsFromExtras`, `buildHistoryFromExtras`         | `s8` reads `bundle.upcomingBookings`/`historyBookings` directly and expects `dateLabel`, `monthLabel`, `dayLabel`, `timeLabel`, `durationLabel`, `practitioner`, etc. The adapters normalize to `whenLong`, `whenShort`, `stateLabel`, `staff`, `initials`. If the bundle contains raw backend objects, the section will render with missing or malformed fields. |
| **S6 uses raw journal entries instead of normalized adapter**        | P0       | `s6` (`cco-v12-canon.js:808`)                                                     | `buildJournalsFromEntries`                                  | `s6` reads `ctx.journalEntries` directly and expects raw fields (`title`, `journalType`, `author`, `practitioner`, `dateLabel`, `signedAt`, `status`, `encounterId`). The adapter produces a different shape (`snippet`, `meta`, `badge`). The workspace uses a workspace-specific adapter (`CcoV12WorkspaceAdapters.buildJournalModule`) for the same data.      |
| **S1 / stats use raw card instead of profile/stats adapters**        | P1       | `s1` (`cco-v12-canon.js:89`), `stats` (`cco-v12-canon.js:1867`)                   | `buildProfileFromBcard`, `buildStatsFromExtras`             | Profile pills, phone/email normalization, and stats debt logic are duplicated or skipped. If the adapter is the canonical contract, the canon should consume it.                                                                                                                                                                                                  |
| **Rail upcoming bookings use raw bundle**                            | P1       | `rail` (`cco-v12-canon.js:1765`)                                                  | `buildBookingsFromExtras`                                   | The rail card renders `bundle.upcomingBookings` with raw field names (`dayLabel`, `dateLabel`, `timeLabel`) rather than the adapter's normalized `whenLong`/`whenShort`.                                                                                                                                                                                          |
| **S7 visitSegments are raw context only**                            | P1       | `s7` (`cco-v12-canon.js:874`), `visitSegmentsBlock` (`cco-v12-canon.js:998`)      | None exists                                                 | The canon expects a rich `visitSegments` array with nested `images`, `videos`, `documents`, `journals`, `booking`, `encounter`, `reasons`, `confidence`, etc. There is no adapter that normalizes `driveFiles`/`journalEntries`/`dossierBundle` into this shape; the context must provide it pre-shaped.                                                          |
| **Step-asset heuristics are filename/label based**                   | P1       | `s5` (`cco-v12-canon.js:500`)                                                     | `buildStepAssets`                                           | `buildStepAssets` maps documents to journey steps by matching Swedish keywords in filenames (`hälsodek`, `offert`, `avtal`, `friskförs`, etc.). If filenames are GUIDs or English, the mapping silently fails.                                                                                                                                                    |
| **Journey is null when KKX module is missing**                       | P1       | `s5` (`cco-v12-canon.js:500`)                                                     | `buildJourneyFromState`                                     | Hard dependency on `global.CcoKundkortKkx.buildCanonicalJourneyLive`. If the module is not loaded, the whole customer journey section collapses to empty state.                                                                                                                                                                                                   |
| **Smart next step / insights are null when smart module is missing** | P1       | `s5`, `s12`, `rail`, `sticky`                                                     | `buildSmartNextStep`, `buildInsightsFromSignals`            | Hard dependency on `global.CcoKunderSmartNextStep.sortSignals`.                                                                                                                                                                                                                                                                                                   |
| **Critical warnings depend on KKX panel signals**                    | P1       | `s3` (`cco-v12-canon.js:294`)                                                     | `buildCriticalWarnings`                                     | Falls back to `card.automationSignals`, but the KKX `resolvePanelSignals` path is preferred and may not be available.                                                                                                                                                                                                                                             |
| **S11 Fortnox sync status placeholder has no data source**           | P2       | `s11` (`cco-v12-canon.js:1677`)                                                   | None                                                        | The renderer emits `<div data-v12-fortnox-status></div>`, but no adapter provides a sync status or error message to populate it.                                                                                                                                                                                                                                  |
| **Sticky bar uses raw card/av instead of adapter**                   | P2       | `sticky` (`cco-v12-canon.js:1818`)                                                | `buildStickyActions`                                        | The sticky bar could reuse the adapter's `ready`/`bookCount` logic but instead re-derives state from `card` and `av`.                                                                                                                                                                                                                                             |
| **S10 communication lacks direction pill**                           | P2       | `s10` (`cco-v12-canon.js:1572`)                                                   | `buildCommunicationFromState`                               | The adapter exposes `dir` (in/out), but the canon only uses `type`, `text`, `preview`, `meta`. The workspace uses `dir` to show direction.                                                                                                                                                                                                                        |
| **Dead-code sections**                                               | P2       | `fotoDok`, `histSection`, `uppfoljning` (`cco-v12-canon.js:1902`, `2013`, `2047`) | N/A                                                         | These functions are defined but never invoked in `render()`. They appear to be leftovers from the V13 spine prototype.                                                                                                                                                                                                                                            |
| **Patient ID resolution duplicated**                                 | P2       | Every section that needs `patientId`                                              | N/A                                                         | Each section repeats `card.id                                                                                                                                                                                                                                                                                                                                     |     | card.patientId |     | ctx.patient.id`. An adapter could centralize this, but the current adapters only return `patientId` for bookings/communication/sticky. |

---

## 5. Wiring Mismatches

| Mismatch                                  | Where                                          | Expected by canon                                                                                                                                                                                                                      | Produced by adapter                                                                          | Impact                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Warnings shape**                        | `s3` (`cco-v12-canon.js:295`)                  | `warnings.items` (wrapper) or `warnings` as array                                                                                                                                                                                      | Direct array                                                                                 | The code defensively checks both, so it works, but it is inconsistent with the rest of the canon which uses `.items` wrappers. |
| **Booking field names**                   | `s8` vs `buildBookingsFromExtras`              | `dateLabel`, `monthLabel`, `dayLabel`, `timeLabel`, `durationLabel`, `practitioner`, `staffName`, `providerName`, `resourceName`, `locationLabel`, `title`, `serviceLabel`, `statusLabel`, `notes`, `sourceRecords`, `shadowReadmodel` | `whenLong`, `whenShort`, `state`, `stateLabel`, `staff`, `initials`, `sub`, `title`, `notes` | Direct use of the adapter output in `s8` would render wrong labels or missing dates.                                           |
| **Journal field names**                   | `s6` vs `buildJournalsFromEntries`             | Raw: `title`, `journalType`, `author`, `practitioner`, `dateLabel`, `date`, `signedAt`, `status`, `encounterId`                                                                                                                        | Normalized: `title`, `snippet`, `meta`, `state`, `badge`                                     | Cannot pass adapter output directly to `s6`.                                                                                   |
| **Economy value field**                   | `stats` (`cco-v12-canon.js:1876`)              | `card.totalValue` or `econ.items[0].value`                                                                                                                                                                                             | `buildEconomyFromCard` returns `items` with `label`/`value`                                  | OK as long as the first item is the total value, but the contract is positional/implicit.                                      |
| **Photos `isImage` vs `fileType`**        | `s7` (`cco-v12-canon.js:907`)                  | `p.isImage === false` for video                                                                                                                                                                                                        | `buildPhotosFromDriveFiles` sets `isImage` from `fileType === 'image'` or image extension    | Consistent.                                                                                                                    |
| **Photo phase prefix**                    | `s7` (`cco-v12-canon.js:906`)                  | `phase` values: `before`, `after`, (empty)                                                                                                                                                                                             | Adapter produces `before`, `after`, `during`, (empty)                                        | The canon ignores `during` and treats it as `ÖVER`. May be intentional.                                                        |
| **Visit segment `imageStage` vs `phase`** | `visitSegmentsBlock` (`cco-v12-canon.js:1035`) | `image.imageStage` or `image.imageType` for zone                                                                                                                                                                                       | `buildPhotosFromDriveFiles` produces `imageStage`, `phase`, `zone`                           | OK if the raw segment objects already contain `imageStage`/`imageType`.                                                        |
| **Communication meta**                    | `s10` (`cco-v12-canon.js:1612`)                | `c.meta` string                                                                                                                                                                                                                        | Adapter produces `meta = dirLabel + (when)`                                                  | OK, but direction is not surfaced visually.                                                                                    |
| **Step asset lookup**                     | `s5` (`cco-v12-canon.js:572`)                  | `stepAssets[s.id]` or `stepAssets[i + 1]`                                                                                                                                                                                              | Adapter keys by `step.id` or `i + 1` fallback                                                | Adapter uses `step.id` when available; canon uses both. Generally consistent.                                                  |
| **Sticky state**                          | `sticky` (`cco-v12-canon.js:1822`)             | `av.state` from adapter                                                                                                                                                                                                                | `buildActiveVisitFromBundle` returns `state`                                                 | OK, but `bookCount`/`ready` from `buildStickyActions` are not used.                                                            |

---

## 6. Recommendations (prioritized)

### P0 — Blocks V12 canon parity

1. **Wire offers and auto-documents into `s9`.** Add `buildOffersFromPayload(ctx.card, ctx.dossierBundle, ctx.commercialCase)` and `buildAutoDocsFromPayload(ctx.card, ctx.dossierBundle)` calls in `CcoV12Canon.render`, then merge the resulting items into the Documents section. Reuse the workspace's `renderDocumentsModule` grouping logic if possible, or create a canon equivalent of the offers/auto-docs/files three-block layout. This directly fixes the known commercial-case blind spot noted in `patient-master-ui.js:7018-7019`.
2. **Normalize `s8` through the booking adapters.** Replace direct reads of `bundle.upcomingBookings`/`historyBookings` with `buildBookingsFromExtras(...)` and `buildHistoryFromExtras(...)`. Either update `s8` to consume the normalized item shape (`whenLong`, `whenShort`, `stateLabel`, etc.) or add a second "canon booking" adapter that returns the raw-shape fields `s8` currently expects. Do not mix raw and normalized shapes in the same renderer.
3. **Normalize `s6` through an adapter.** Either consume `buildJournalsFromEntries` in `s6` (and update `s6` to the normalized shape) or create a `buildJournalPreviewForCanon` adapter that returns the exact raw fields `s6` consumes (`title`, `journalType`, `author`, `practitioner`, `dateLabel`, `signedAt`, `status`, `encounterId`). This removes the dependency on raw entry shape.

### P1 — Cosmetic / incomplete / risk of regressions

4. **Consume `buildProfileFromBcard` and `buildStatsFromExtras` in `s1` and `stats`.** This centralizes profile pill logic, debt formatting, and LTV value formatting and avoids drift between the workspace and the canon.
5. **Use `buildBookingsFromExtras` in the rail upcoming-bookings card.** Update the rail card to use the normalized booking shape or add a dedicated adapter for rail booking rows.
6. **Create an adapter for `visitSegments`.** The canon `s7` relies on a very specific nested shape (`images`, `videos`, `documents`, `journals`, `booking`, `encounter`, `reasons`, `confidence`). Either document the exact required input contract in `patient-master-ui.js` or add a `buildVisitSegmentsFromBundle(dossierBundle, driveFiles, journalEntries)` adapter so the renderer is not tied to a pre-shaped context field.
7. **Make step-asset mapping more robust.** Add an explicit `journeyStep` or `stepId` field to documents/photos/journals when available, and fall back to filename heuristics only when explicit metadata is missing.
8. **Document and optionally guard the KKX / SmartNextStep global dependencies.** Add feature-flag or availability checks and explicit empty-state copy when the logic modules are not loaded, rather than silently rendering "Kundresan har inte startat" / "Inga aktiva insikter".

### P2 — Nice-to-have / cleanup

9. **Populate `data-v12-fortnox-status` in `s11`.** Add an adapter that returns the last Fortnox sync status/time for the patient, or remove the placeholder if it is not intended for the canon path.
10. **Use `buildStickyActions` in the sticky bar.** Replace the inline `ready`/`bookCount` derivation with the adapter so the sticky bar benefits from the same `resolveReferensBookingExtras` logic as the workspace.
11. **Show communication direction in `s10`.** Use the `dir` field from `buildCommunicationFromState` to add an inbound/outbound badge, matching the workspace behavior.
12. **Remove or move dead code.** `fotoDok`, `histSection`, and `uppfoljning` are not used in `render()`. If they belong to V13 spine, move them to `cco-v12-spine.js`; otherwise delete them to reduce confusion.
13. **Centralize patientId resolution.** Add a small helper or adapter that returns the canonical patient ID from `ctx` once, and pass it to all sections instead of repeating the fallback chain.

---

## 7. Appendix: Adapter calls inside `CcoV12Canon.render`

Location: `public/major-arcana-preview/app/cco-v12-canon.js:2092-2111`

```js
var journey = call(
  'buildJourneyFromState',
  [card, ctx.journalEntries, bundle],
  null
);
var av = call('buildActiveVisitFromBundle', [bundle], null);
var warnings = call(
  'buildCriticalWarnings',
  [card, ctx.journalEntries, bundle],
  null
);
var health = call('buildHealthPreview', [card, bundle], null);
var photos = call('buildPhotosFromDriveFiles', [ctx.driveFiles], null);
var files = call('buildFilesFromDriveFiles', [ctx.driveFiles], null);
var comm = call(
  'buildCommunicationFromState',
  [card, ctx.occasionTimeline, bundle],
  null
);
var econ = call('buildEconomyFromCard', [card], null);
var invoices = call(
  'buildEconomyInvoices',
  [bundle && bundle.paymentHistory],
  null
);
var nextStep = call('buildSmartNextStep', [card], null);
var insights = call('buildInsightsFromSignals', [card], null);
var recentEvents = call(
  'buildRecentEvents',
  [card, bundle, ctx.journalEntries],
  []
);
var stepAssets =
  ctx.stepAssets ||
  call('buildStepAssets', [journey, ctx.driveFiles, ctx.journalEntries], {});
```

**Notable omissions from this call list:** `buildProfileFromBcard`, `buildSmartInfoFromSignals`, `buildStatsFromExtras`, `buildBookingsFromExtras`, `buildHistoryFromExtras`, `buildJournalsFromEntries`, `buildOfferRowFromCommercialCase`, `buildOffersFromPayload`, `buildAutoDocsFromPayload`, `buildNotesFromState`, `buildStickyActions`. These are the primary sources of the gaps listed above.

---

## 8. Context object (`ctx`) from `patient-master-ui.js`

Location: `public/major-arcana-preview/app/patient-master-ui.js:7006-7021`

```js
const ctx = {
  card,
  bcard,
  dossierBundle,
  journalEntries,
  occasionTimeline,
  driveFiles,
  visitSegments: asArray(runtime.detail?.visitSegments),
  patient,
  tab,
  lite,
  commercialCase: runtime.commercialCase || null, // currently ignored by CcoV12Canon
};
```

The `commercialCase` field is the most important unused input; it is the only source of synthesized offer rows when the dossier bundle does not already contain a populated `offers` list.
