# CCO Automation OS — Cursor teknisk analys (2026-06-03)

> **Registry v2 (9-steg):** [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md). §4–§7 nedan med `missing_form` / `ready_for_visit` = **superseded** — använd 9 regler där.

**Källa:** Cursor (repo-genomgång, gates, P1.2 `525a643a`).  
**Gemensam (master):** [`CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md`](./CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md)  
**Strategi (ChatGPT):** [`CCO-AUTOMATION-OS-CHATGPT-BRIEF-2026-06-03.md`](./CCO-AUTOMATION-OS-CHATGPT-BRIEF-2026-06-03.md)  
**UX:** [`CCO-SMART-FUNCTIONS-CURSOR-UX-NOTES-2026-06-03.md`](./CCO-SMART-FUNCTIONS-CURSOR-UX-NOTES-2026-06-03.md) · [gemensam UX-plan](./CCO-SMART-FUNCTIONS-PRODUCT-PLAN-2026-06-03.md)  
**Maskinläsbar:** `data/reports/cco-automation-os-inventory.json`

**Status:** Analys only — ingen kod i denna fas.

---

## 1. Vilka automationer finns redan? (verifierat i kod)

| Automation                | Modul                                       | Status      | Human approval                  |
| ------------------------- | ------------------------------------------- | ----------- | ------------------------------- |
| Segment + counts          | `ccoKunderEnrichment.computeSegmentStats`   | **DONE**    | Nej                             |
| Text `nextStep`           | `computeNextStep()`                         | **PARTIAL** | Nej — ingen What/Why/Next       |
| Mina / staff owner        | `ccoKunderStaffOwner`, `staffOwnership` API | **DONE**    | Nej (P1.2)                      |
| Action capability         | `cco-kunder-actions.js`                     | **PARTIAL** | Per action                      |
| Treatment booking gate    | `ccoTreatmentBookingGate`                   | **DONE**    | Ja (indirekt)                   |
| Agreement + cooling off   | `ccoTreatmentAgreementStore`                | **PARTIAL** | Ja — saknar `legal_review`      |
| Journey 12 steg           | `ccoCustomerJourneyStore`                   | **PARTIAL** | Ja vid advance — **ej derived** |
| Timeline                  | `ccoUnifiedTimelineBuilder`                 | **PARTIAL** | Nej                             |
| Photo review              | `ccoPhotoReview` routes, operator UI        | **PARTIAL** | Ja — write canary               |
| Import review             | `ccoImportReviewReadService`                | **PARTIAL** | Ja — write canary               |
| Mail truth/worklist       | `ccoMailboxTruthWorklistReadModel`          | **PARTIAL** | Ja vid send                     |
| CF expense rules          | `ccoExpenseRuleStore`                       | **PARTIAL** | Ja                              |
| Recurring / monthly close | CF stores                                   | **PARTIAL** | Ja                              |
| Identity needs_review     | patient master                              | **DONE**    | Ja (merge)                      |
| Meridiq consent runtime   | `meridiqConsentCatalogRuntime.js`           | **PARTIAL** | Ja — ej i Kunder UI             |
| Worklist snapshot API     | `GET .../worklist-snapshot`                 | **MISSING** | — (404 om ej seedad)            |

**Kunder readiness (Cursor):** desktop ~97%, mobil ~98% (P1.2).  
**Automation OS readiness (Cursor):** ~35% (engine + unified worklists + comms pipeline saknas).

---

## 2. Vilka saknas? (per domän)

| Domän              | Saknas                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| **Kunder**         | Derived journey, strukturerad NBA, unified worklist UI, comms suggest→approve |
| **Kalender**       | Ops flags per patient (form/avtal/encounter), registry sync                   |
| **Journal**        | Auto safety checklist i dossier kopplat till signals                          |
| **Formulär**       | `cco-forms` missing i shell; reminder automation                              |
| **Avtal/samtycke** | `legal_review`, digital sign write, consent send från Kunder                  |
| **Kommunikation**  | Rule → propose → approve → send                                               |
| **Photo Review**   | Suggest phase/bodyArea (no autoapprove), Kunder priority                      |
| **Import Review**  | Next-action från Kunder segment                                               |
| **Finance**        | Fortnox live (flag off); registry i CF UI                                     |
| **Ops**            | Single hub för alla köer                                                      |

---

## 3. Föreslagen Automation Rules Engine (Cursor design)

### Moduler (nya, planerade)

- `src/ops/ccoAutomationRegistry.js` — catalog, version, risk, approval flag
- `src/ops/ccoAutomationRunner.js` — `evaluatePatient(readout)` → `AutomationSignal[]`

### Flöde

```
Stores (read-only) → Triggers → Conditions → Dry-run evaluate
  → Signals till Kunder/Ops
  → Actions "propose" only
  → Human approval queue → befintliga write-routes
  → Audit
```

### API (förslag, steg 1 read-only)

| Method | Path                                         | Syfte               |
| ------ | -------------------------------------------- | ------------------- |
| GET    | `/api/v1/cco/automation/catalog`             | Registry metadata   |
| GET    | `/api/v1/cco/automation/evaluate?patientId=` | Dry-run per patient |
| GET    | `/api/v1/cco/automation/worklists?queue=`    | Aggregerade köer    |
| POST   | `/api/v1/cco/automation/approve`             | **GO senare**       |

**Integration Kunder:** `customers-shell` + optional `includeAutomation=1` → `automationSignals[]` per card.

### Engine-funktioner

| Funktion          | Beskrivning                                                         |
| ----------------- | ------------------------------------------------------------------- |
| Triggers          | `patient.load`, `booking.confirmed`, `asset.imported`, `cron.daily` |
| Conditions        | Predicates på `buildKunderReadout` + stores                         |
| Actions           | `suggest_ui`, `enqueue_worklist`, `propose_communication`           |
| RBAC              | `ccoRbac` (merge, gdpr, legal_review)                               |
| Feature flags     | `ENABLE_AUTOMATION_RUNNER`, per-rule canary                         |
| Dry-run           | Default **on** — inga side effects                                  |
| Canary / rollback | Samma mönster som photo/import review                               |

---

## 4. Automation catalog (Cursor — status mot repo)

| ID                                          | Status                        | Risk          | Approval |
| ------------------------------------------- | ----------------------------- | ------------- | -------- |
| `customer.missing_health_declaration`       | PARTIAL (proxy `missingForm`) | blocker       | ja       |
| `customer.missing_journal`                  | PARTIAL                       | blocker       | nej      |
| `customer.missing_treatment_plan`           | MISSING                       | blocker       | ja       |
| `customer.cooling_off_active` / `passed`    | PARTIAL                       | legal         | nej      |
| `customer.missing_agreement_consent_bundle` | PARTIAL                       | legal_blocker | ja       |
| `customer.missing_operation_day_insurance`  | MISSING                       | blocker       | ja       |
| `customer.missing_photo_consent`            | MISSING                       | legal         | ja       |
| `customer.ready_for_treatment`              | MISSING                       | ready         | nej      |
| `customer.needs_photo_review`               | PARTIAL                       | needs_review  | ja       |
| `customer.needs_identity_review`            | DONE                          | needs_review  | ja       |
| `booking.needs_encounter`                   | PARTIAL                       | blocker       | ja       |
| `booking.blocked_by_agreement_gate`         | DONE                          | legal_blocker | ja       |
| `mail.true_unanswered`                      | PARTIAL                       | needs_review  | ja       |
| `finance.receipt_needs_category`            | PARTIAL                       | needs_review  | ja       |
| `communication.suggest_form_reminder`       | MISSING                       | info          | ja       |

Full JSON: `data/reports/cco-automation-os-inventory.json`.

---

## 5. AI policy (Cursor — aligned med CCO-scope)

| Tillåtet                           | Förbjudet utan GO       |
| ---------------------------------- | ----------------------- |
| Metadata, flags, counts            | Journaltext → extern AI |
| Redacted summaries                 | Diagnos                 |
| Förslag + human approval           | Autoapprove foto/import |
| Regel-NextStep + AI wording senare | Auto-merge kunder       |
|                                    | Avtal utan legal review |

**Dry-run v1:** ingen LLM i runner.

---

## 6. Prioriterad byggplan (Cursor tolkning av ChatGPT)

### P0

1. Journey Orchestrator (derived, read-only)
2. Next Best Action (What/Why/Next + risk)
3. Missing Forms/Agreements worklists
4. Calendar/customer operational gates

### P1

Communication suggestions · staff worklists · photo/mail assist (no autoapprove)

### P2

AI copilot (redacted) · scheduling/no-show · Aisia (**pausad**)

---

## 7. Exakt första build-step (Cursor rekommendation)

**CCO Automation Registry + Dry-run Runner på Kunder** — enig med ChatGPT.

### Scope

1. `ccoAutomationRegistry.js` + `ccoAutomationRunner.js`
2. `evaluatePatient()` — **9** kundrese-regler v2 (deterministiska) — se readiness doc
3. `customers-shell` utökad med `automationSignals` (feature flag)
4. UI: dossier **“Smart nästa steg”** — What / Why / Next
5. Koppla **Next** till befintliga `cco-kunder-actions` routes där real/partial

### Regler v2 (supersedes v1 list)

- `customer.missing_health_declaration` (steg 3)
- `customer.missing_journal` (steg 4)
- `customer.missing_treatment_plan` (steg 5)
- `customer.cooling_off_active` / `cooling_off_passed` (steg 6)
- `customer.missing_agreement_consent_bundle` (steg 7)
- `customer.missing_operation_day_insurance` (steg 8 — **inte** T-48)
- `customer.missing_photo_consent` (steg 9)
- `customer.has_photo_review`
- `customer.ready_for_treatment`
- `customer.booking_missing_encounter` (ops)

### Constraints (Cursor gates)

- Ingen ny demo/support-sida
- Ingen extern AI på journal
- Ingen autoapproval / massapproval
- Ingen ny import
- **Inga writes** i steg 1
- Mount routes via `ccoStaff`-mönster, undvik `server.js`-monolit

### Verify (senare)

`scripts/verify-automation-registry.js` — FAIL om active rule saknar `reason` eller write utan `humanApprovalRequired`.

---

## 8. Sammanfattning (Cursor svar på brief)

| Fråga         | Svar                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Vad finns?    | Segment, nextStep text, gates, partial review queues, CF rules, P1.2 Kunder      |
| Vad saknas?   | Engine, derived journey, structured NBA, worklists, legal_review, comms pipeline |
| Architecture? | Registry + Runner + dry-run + approval + audit                                   |
| P0/P1/P2?     | Se §6                                                                            |
| Första build? | Registry + dry-run + dossier panel                                               |

---

## 9. Cursor-specifika noteringar (ej ChatGPT)

- **Prod P1.2:** `cco-kunder-staff-owner.js` kan vara 404 tills Render deploy av `525a643a`.
- **`data/reports/`** gitignored — JSON inventering lokalt only.
- **`CCO-filter-och-smarta-funktioner.md`** saknas i repo — kan finnas i Notion; segment i kod ersätter delvis.
- **Journey store** har explicit policy i filhuvud: ingen extern AI, inga auto-utskick, audit på advance.

---

_Endast Cursor teknisk analys. Uppdatera när kod eller gates ändras; ändra inte ChatGPT-brief utan ny input från ChatGPT._
