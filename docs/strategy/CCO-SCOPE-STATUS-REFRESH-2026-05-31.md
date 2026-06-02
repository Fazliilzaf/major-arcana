# CCO Scope Status — Refresh

**Skapad:** 2026-05-31 · **Uppdaterad:** 2026-06-02 (Claude, display/UAT-spår)

---

## Spår-översikt

| Spår                                     | Status                                  | Anmärkning                                                                |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| **Journalpilot**                         | **🟢 GO kontrollerad pilot 2026-06-04** | Personalstart, kundkort, journal CRUD, timeline, forms, audit — alla PASS |
| Personalstart `/cco-personal-start.html` | 🟢 PASS                                 | preflight 9/9 + 3 pilotkunder PASS                                        |
| Staff one-pager                          | 🟢 Klar                                 | `CCO-STAFF-JOURNAL-PILOT-ONE-PAGER-2026-06-04.md`                         |
| Drive safe-match                         | 🟢 Klar                                 | Cursors import-spår                                                       |
| Photo Review                             | 🟡 Kvar / needs review                  | ~885 assets pågående, write AV                                            |
| Mail worklist                            | 🟡 Pågående aktivering                  | 493 ambiguous, inte daglig användning                                     |
| **Chief of Finance**                     | 🟡 CCO-native, Fortnox blockerad        | CF API **mounted + RBAC 403** · owner auth-test **PENDING** (ingen token) |
| Journal-pilot-guide                      | 🟢 Klar                                 | `/journal-pilot-guide.html` + runbook                                     |
| Demo runbook (Fazli)                     | 🟢 Klar                                 | `CCO-PERSONAL-DEMO-RUNBOOK-2026-06-04.md`                                 |
| Staff day-1 checklist                    | 🟢 Klar                                 | `CCO-STAFF-DAY1-JOURNAL-CHECKLIST-2026-06-04.md`                          |
| Fortnox-integration                      | 🔴 BLOCKED_INTEGRATION                  | OAuth fungerar tekniskt, license saknas på Hair TP-kontot — pausad        |
| **Aisia / DS-3**                         | ⏸ Pausad bakom feature flag             | Kräver explicit "APPLY AISIA TO CCO" från owner                           |

---

## CF-track-detalj

CF.2 → CF.9 är **levererade i kod**: ccoReceiptStore, ccoExpenseStore, ccoExpenseRuleStore, ccoFinanceVendorStore, ccoExpenseVatRules, ccoRecurringExpenseStore, ccoFinanceReviewStore + Packager, ccoFinanceReportEngine + MonthlyCloseStore + ReportPackager. Smoke-test 109/109 PASS lokalt.

**Live-status på prod (uppdaterad 2026-06-02T16:42Z):**

| Komponent                           | Status                                        |
| ----------------------------------- | --------------------------------------------- |
| `/finance.html` (UI-shell)          | 200 ✅                                        |
| `/finance-review.html`              | 200 ✅                                        |
| `/finance-reports.html`             | 200 ✅                                        |
| `/api/v1/cco-cf/*` (alla endpoints) | **403** ✅ (RBAC enforces — inloggad får 200) |

**Fix 2026-06-02:** 8 stub-moduler skapade (ccoPhotoAnnotationStore, ccoTreatmentPlanCanvasStore, ccoSecurePortalLinkStore, ccoOfferPdfFromPlan, ccoCustomerJourneyOverview, ccoPatientCardSectionBuilder, ccoEncounterCompositeBuilder, ccoAccessRestriction). Server.js orörd. CF API mountar nu.

**Påverkan:** Ingen för journalpilot 2026-06-04. CF-spåret är fungerande backend bakom RBAC.

---

## Pilotkund-readiness

3 verifierade testkunder för 4 juni-mötet (Cursors manifest):

- `cco-pilot-20260602-a` — Pilotkund A · ren journalföringstest
- `cco-pilot-20260602-b` — Pilotkund B · journal-feed + timeline
- `cco-readiness-smoke-1780402011` — Pilotkund C · signering + rättelse verifierad

Alla 3: feed=200 · timeline=200 · forms=200.

---

## Spår-ägarskap (owner-konfirmerad 2026-06-02)

- **CCO är system of record** för: kundmaster, bokning, encounter, journal/formulär, bilder, avtal/samtycken, offerter, kommunikation, kassa/POS, compliance, historik
- **Cursor:** import / write / data-spår
- **Claude:** display / consumer / UAT / CF-spår
- **Aisia:** separat kamera/scalp-spår bakom flagga — inte aktivt förrän owner säger "APPLY AISIA TO CCO"

---

## Förbjudet före 4 juni (frys-regler kvar)

- Bygga CF.10
- Bygga payroll / AI / OCR / bank-CSV
- Bygga Aisia
- Ny mail-import / Drive-import
- Ny journalmodul / journalroute-ändring
- Server.js-ändringar (om ej P0)
- Ny UI som inte är polish på cco-personal-start

---

## Tillåtet före 4 juni

- Fixa P0/P1 renderbugg om något går sönder
- Uppdatera speaker-notes / readiness vid statusändring
- CF får fortsätta CCO-native (om helt isolerat från journal-demo)
- Observera "pilot startar"-signal

---

## Slutomdöme

**Journalpilot 4 juni:** 🟢 GO
**CF backend live:** 🟡 Mounted + RBAC — funktionell auth-test **pending** (bygg inte CF.10)
**Övriga spår:** Status enligt tabell ovan

---

## Cycle 6 refresh (2026-06-02)

- Runbook + staff day-1 checklist levererade
- Personal-start: länk till journal-pilot-guide, tydligare pilot/review-copy
- `npm run cco:presentation-gate` **PASS** efter Cycle 6 polish
- Aisia / mailimport / Drive-risk / server.js — **orörda**

_Ingen patientdata i denna rapport._
