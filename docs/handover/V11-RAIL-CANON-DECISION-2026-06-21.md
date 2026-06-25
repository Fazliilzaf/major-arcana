# V11 Rail Canon Decision · 2026-06-21

**Status:** Owner selected **C · Hybrid Canon**. First draft prepared for final sign-off before implementation.
**Scope:** Customer right rail / kundkort for web, iPad, and mobile.
**Reason:** Current specs contain two competing structural truths. Further CSS polish will keep producing regressions until one canon is selected.

---

## 1. Problem Statement

The V11 rail currently has three source references:

1. `docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md`
2. `docs/handover/MOCKUPS/AKTIVT-BESOK-LOCKED-2026-06-17.md`
3. `docs/handover/MOCKUPS/V11-MASTER-SPEC-2026-06-18.md`

The conflict is structural:

| Area                | V11 LOCKED 2026-06-05                 | V11 MASTER / facit direction             |
| ------------------- | ------------------------------------- | ---------------------------------------- |
| Health declaration  | Inside Zon 2 document segment         | Expanded inline as a visible top section |
| Document segment    | Locked as Zon 2, unchanged            | Partly hidden or redistributed           |
| Active visit        | Added later as conditional zone       | Required operational hero section        |
| Warnings            | Gate/doc signals inside existing flow | Top warning cards                        |
| Responsive behavior | Not fully defined from start          | Must be defined for mobile, iPad, web    |

No implementation should be considered final unless it follows the canon matrix in this document.

---

## 2. Decision Options

### Option A · Facit Is Canon

Choose this if the visual facit/mockup is the product promise.

**Implication:**

- Archive or supersede `KUNDKORT-V11-LOCKED-2026-06-05.md`.
- Rebuild rail structure to match facit.
- Health declaration can move inline.
- Document segment can be moved, reduced, or redesigned.
- Higher implementation cost, but clean visual truth.

**Expected work:** 10-14 working days for a clean flagged rebuild.

### Option B · LOCKED Spec Is Canon

Choose this if the 2026-06-05 locked document architecture must remain binding.

**Implication:**

- Zon 2 document segment stays unchanged.
- Facit mockup must be redrawn to match locked architecture.
- Active visit can still be added because it is a later locked add-on.
- Lowest architecture risk.

**Expected work:** 2-5 working days depending on remaining rail gaps.

### Option C · Hybrid Canon

Choose this if the product needs the operational value from facit, but must preserve document workflows.

**Implication:**

- Active visit becomes required.
- Document segment stays, unless explicitly replaced section-by-section.
- Health declaration is not duplicated by default.
- Any moved section must have a data owner, user workflow, and rollback rule.

**Expected work:** 5-10 working days for a controlled rebuild or 1 day for tactical Plan D.

**Owner direction 2026-06-21:** selected.

---

## 3. Recommended Decision

**Decision: Option C · Hybrid Canon, with two tracks:**

1. **Tactical close:** keep the current production rail stable and stop the ORD-25 polish loop.
2. **Proper rebuild:** start a new `V11-RAIL` track behind a feature flag, with responsive design as part of the component contract.

Why:

- The active visit section is operational: staff will use the journal CTA during real visits.
- Health declaration and warnings already exist as data/workflow signals; moving them is product architecture, not polish.
- The current implementation is over-layered (`v9` + `v10-skin` + `v11-polish`). A clean namespace is safer than more overrides.
- Staff has not yet been promised the facit UI, so we can correct scope without breaking trust.

This is not an open hybrid where every section is negotiated during implementation. Each section below has a fixed form, data source, responsive contract, and implementation note. Missing data produces an explicit empty state, not a layout compromise.

---

## 4. Responsive Contract

The V11 rail must be designed for all three surfaces from the beginning.

**Breakpoints:**

- Mobile: `320-767px`
- iPad / tablet: `768-1023px`
- Web / desktop: `1024px+`

### Web

- Target width: right rail approximately 392-424px.
- Rail can be persistent beside customer list.
- Dense information is allowed, but no nested card stacks that cause visual noise.
- No horizontal page scroll.

### iPad / Tablet

- Rail can become a side sheet or dominant panel.
- Touch targets minimum 44px.
- Tabs/chips must be horizontally scrollable or wrap intentionally.
- Detail view must not depend on hover.

### Mobile

- Customer list and customer detail are separate states.
- Full row tap opens customer detail; checkbox area remains selection-only.
- Detail panel width must be `100vw` safe with side margins.
- No horizontal document/page scroll.
- Sticky/bottom navigation must not hide primary CTAs.
- Long email/phone/content must wrap without vertical letter stacking.

---

## 5. Build Rules

If we rebuild properly:

- New files:
  - `public/major-arcana-preview/app/cco-v11-rail.js`
  - `public/major-arcana-preview/cco-v11-rail.css`
- Namespace:
  - `.v11-rail__*`
- Feature flag:
  - `?v11rail=on`
- Legacy rail remains available until cutover.
- No dependency on old `.kkref`, `.cr-v10`, `.v10-dossier-referens`, or v9/v10 override classes inside the new rail.
- The only permitted legacy contact point is the mount/switch that chooses legacy rail or `?v11rail=on`.
- Each section gets:
  - renderer
  - data adapter
  - empty state
  - mobile/tablet/web layout rule
  - screenshot acceptance check
- No implementation `TBD` is allowed inside a section. If product data is absent, render the agreed empty state.

---

## 6. Canon Section Matrix

This table controls implementation. `facit` means visual form follows the facit/mockup direction. `LOCKED` means the existing locked workflow remains structurally binding. `merge` means the section gets a new V11 presentation while preserving the locked workflow.

| Section              | Canon form                                                                      | Data source                                                  | Responsive contract | Implementation note                                                                 |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| A Profile            | facit: amber kicker, profile identity, 4 operational pills, edit profile action | Pipedrive person/org, tags, dossier bundle                   | 320/768/1024        | Rebuild as `.v11-rail__profile`; if tags are missing, show no fake pills.           |
| B Smart information  | facit: separate vellum smart-info card                                          | `gateSignals.primary`, customer summary adapter              | 320/768/1024        | One clear primary signal plus concise supporting metadata.                          |
| C Stats              | facit: 3 stat cells for `BESOK`, `VARDE TOT`, `SKULD`                           | visits/year, LTV/revenue, open invoices/debt                 | 320/768/1024        | Vellum cells; mobile stacks or becomes compact 3-column only if text fits.          |
| V Active visit       | facit: new hero with timeline and journal CTA                                   | today's booking, active encounter, protocol state            | 320/768/1024        | Priority section; CTA starts/resumes correct journal flow.                          |
| D Critical warnings  | facit: red vellum top-banner cards                                              | `gateSignals.critical`, treatment readiness blockers         | 320/768/1024        | Top warnings are presentation; underlying gate logic remains unchanged.             |
| E Health declaration | merge: top expandable preview plus full HÄLSA workflow inside Zon 2             | HD store, signed declaration status, contraindication flags  | 320/768/1024        | Do not duplicate full workflow; top preview summarizes and deep-links to HÄLSA tab. |
| F Customer journey   | merge: V11 visual stepper, preserve 9-step canonical logic                      | customer journey state, treatment plan, stage history        | 320/768/1024        | Must keep canonical 9-step meaning; visual rebuild only.                            |
| G Smart next step    | merge: focused recommendation card with one primary CTA                         | next-best-action engine, gate signals, booking/journal state | 320/768/1024        | CTA owner must be explicit: booking, journal, document, or economy.                 |
| H Bookings           | LOCKED workflow with V11 shell                                                  | bookings, cancellations, upcoming/past visits                | 320/768/1024        | Operational list remains reachable; mobile uses compact rows.                       |
| I History            | LOCKED workflow with V11 shell                                                  | activity timeline, completed visits, status events           | 320/768/1024        | Preserve auditability; no decorative timeline if data is thin.                      |
| J Journals           | LOCKED workflow with V11 shell                                                  | journal store, encounter notes, protocol records             | 320/768/1024        | Must support start/resume/view journal states.                                      |
| K Offers             | LOCKED workflow with V11 shell                                                  | offers, quotes, accepted/rejected state                      | 320/768/1024        | Keep commercial workflow, not only summary badges.                                  |
| L Auto-documents     | LOCKED workflow with V11 shell                                                  | document generator, templates, signing status                | 320/768/1024        | Preserve signing/document-status operations.                                        |
| M Photos             | LOCKED workflow with V11 shell                                                  | photo library, treatment zones, review status                | 320/768/1024        | Mobile gallery must avoid horizontal overflow and hidden actions.                   |
| N Files              | LOCKED workflow with V11 shell                                                  | uploaded files, attachments, document metadata               | 320/768/1024        | Keep file access and status; no data loss behind collapsed UI.                      |
| O Notes              | LOCKED workflow with V11 shell                                                  | staff notes, internal comments, timestamps                   | 320/768/1024        | Notes remain editable where current permissions allow.                              |
| P Communication      | LOCKED workflow with V11 shell                                                  | SMS/email/call log, consent flags, templates                 | 320/768/1024        | Preserve contact actions and consent visibility.                                    |
| Q Economy            | LOCKED workflow with V11 shell, role-gated where needed                         | invoices, payments, debt, refunds/credits                    | 320/768/1024        | Debt signal also feeds C Stats and D warnings.                                      |
| R Insights           | LATER unless data-backed                                                        | analytics adapter, risk/retention signals                    | 320/768/1024        | No decorative insight cards; only ship when real signal exists.                     |
| S Sticky footer      | facit/merge: mobile-safe persistent action area                                 | current section state, primary CTA, save/close state         | 320/768/1024        | Must never cover CTAs or document actions; desktop can be rail-local.               |

**Zon 2 rule:** document workflows remain intact until a section-specific replacement is approved. The new rail may improve presentation, but signing, document status, templates, HÄLSA, photos, files, journals, and economy must stay reachable on all surfaces.

---

## 7. Acceptance Tests

Before cutover:

- 3 viewports:
  - mobile 390x844
  - tablet 820x1180
  - desktop 1440x1000
- 3 patient states:
  - empty/minimal data
  - normal customer
  - full customer with active visit
- Required pass criteria:
  - no horizontal page scroll
  - no vertical letter stacking
  - no CTA hidden behind bottom nav
  - active visit CTA opens correct journal flow
  - document workflow remains reachable
  - screenshots saved for every viewport/state

---

## 8. Owner Decision

- [ ] **A · Facit is canon**
- [ ] **B · LOCKED spec is canon**
- [x] **C · Hybrid canon**

Owner note:

```text
Decision: C · Hybrid canon
Date: 2026-06-21
Signed by: Fazli / Owner direction captured in Codex thread
Non-negotiables:
- responsive from the first component
- clean `.v11-rail__*` namespace
- feature flag `?v11rail=on`
- per-section canon matrix controls implementation
- Zon 2 workflows remain reachable
```

---

## 9. Immediate Next Step After Signature

If **A**:

- Archive old locked doc.
- Create `V11-RAIL-INVENTORY-2026-06-21.md`.
- Start clean flagged rail rebuild.

If **B**:

- Update facit mockup to match locked Zon 2.
- Build only missing locked sections.

If **C**:

- Freeze current prod rail as tactical stable.
- Prioritize active visit and responsive rail contract.
- Start flagged `cco-v11-rail` rebuild only after inventory.
- Create `V11-RAIL-INVENTORY-2026-06-21.md` with KEEP/REWRITE/MOVE/LATER per adapter and data source.
