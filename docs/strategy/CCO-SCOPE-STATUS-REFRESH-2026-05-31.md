# CCO Scope Status — Refresh

**Skapad:** 2026-05-31 · **Uppdaterad:** 2026-06-02 (Claude, display/UAT-spår)

---

## Spår-översikt

| Spår | Status | Anmärkning |
|---|---|---|
| **Journalpilot** | **🟢 GO kontrollerad pilot 2026-06-04** | Personalstart, kundkort, journal CRUD, timeline, forms, audit — alla PASS |
| Personalstart `/cco-personal-start.html` | 🟢 PASS | preflight 9/9 + 3 pilotkunder PASS |
| Staff one-pager | 🟢 Klar | `CCO-STAFF-JOURNAL-PILOT-ONE-PAGER-2026-06-04.md` |
| Drive safe-match | 🟢 Klar | Cursors import-spår |
| Photo Review | 🟡 Kvar / needs review | ~885 assets pågående, write AV |
| Mail worklist | 🟡 Pågående aktivering | 493 ambiguous, inte daglig användning |
| **Chief of Finance** | 🟡 CCO-native, Fortnox blockerad | CF.2-CF.9 levererade lokalt; CF.9 API mountar inte på prod (se nedan) |
| Fortnox-integration | 🔴 BLOCKED_INTEGRATION | OAuth fungerar tekniskt, license saknas på Hair TP-kontot — pausad |
| **Aisia / DS-3** | ⏸ Pausad bakom feature flag | Kräver explicit "APPLY AISIA TO CCO" från owner |

---

## CF-track-detalj

CF.2 → CF.9 är **levererade i kod**: ccoReceiptStore, ccoExpenseStore, ccoExpenseRuleStore, ccoFinanceVendorStore, ccoExpenseVatRules, ccoRecurringExpenseStore, ccoFinanceReviewStore + Packager, ccoFinanceReportEngine + MonthlyCloseStore + ReportPackager. Smoke-test 109/109 PASS lokalt.

**Live-status på prod:**

| Komponent | Status |
|---|---|
| `/finance.html` (UI-shell) | 200 ✅ |
| `/finance-review.html` | 200 ✅ |
| `/finance-reports.html` | 200 ✅ |
| `/api/v1/cco-cf/*` (alla endpoints) | **404** ❌ |

**Orsak:** server.js IIFE-block kraschar på `require('./src/ops/ccoPhotoAnnotationStore')` (filen saknas i deploy). CF-routes ligger i samma IIFE — mountas därför aldrig. Se `CCO-END-TO-END-UAT-2026-05-31.md` §3a.

**Påverkan:** Ingen för journalpilot 2026-06-04. CF-spåret är isolerat från journalflödet.

**Fix-status:** Server.js orörd per frys/regression-regel. Fixas efter 4 juni (Cursor levererar saknad modul ELLER server.js refaktoreras till egna IIFE per CF-MVP).

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
**CF backend live:** 🟡 Behöver fix efter 4 juni
**Övriga spår:** Status enligt tabell ovan

_Ingen patientdata i denna rapport._
