# Cutover Readiness Report — 2026-06-25

_Auto-genererad: 2026-06-25T19:28:49.890Z · Tenant: `hair_tp` · data=repo · P0.10 · scripts/generate-cutover-readiness-report.js_
_Data-root: `/Users/fazlikrasniqi/Code/major-arcana/data`_
_Styrande regel: `.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done`_
_Compliance: 0 patientnamn, 0 personnummer, 0 emails, 0 telefonnummer — counts only._

## Overall readiness: 🔴 **RED**

- 🟢 Green: **3** / 10
- 🟡 Yellow: **5** / 10
- 🔴 Red: **2** / 10

## Sammanfattning

- Cliento-kunder (`hair_tp`): **7257**
- Meridiq-matched (`meridiqMeta`): **6268** (86.4 %)
- Leads utan vårdjournal (`noMeridiqJournal`): **989**
- Dubblettkandidater: **28**
- Drive-folder-IDs på master-kort: **0** (väntar på service-account)
- Journal-entries i CCO: **34** (signed: 24, locked: 24, withPDF: 22)
- Templates: 97 (consents: 45, formulär: 29)
- Foto-store: **22243** bilder (encounter-länkade: 1)
- Audit-events totalt: 218123 (senaste 5 actions: asset.status_changed:105524, import.review_enqueued:33149, asset.imported:28962, drive_history_imported:23338, asset.linked_to_patient:7016)

## Per kriterium (Definition of Done, 10 punkter)

### 🟡 #1 — Varje patient har master-kort (clientoId + meridiqId + driveFolderId + ccoId)

| Metric             | Värde |
| ------------------ | ----: |
| totalPatients      |  7257 |
| withMeridiq        |  6268 |
| withDrive          |     0 |
| masterScoreMeridiq |   86% |

> **Blocker:** Drive-folderId saknas på 7257/7257 patienter — väntar på service-account (P0.3).

### 🟡 #2 — Cliento ↔ Meridiq ↔ Drive matched (dubbletter i Review Queue eller lösta)

| Metric              | Värde |
| ------------------- | ----: |
| duplicateCandidates |    28 |
| uncertainViaName    |    15 |
| matchedViaEmail     |  5047 |
| matchedViaPhone     |  1199 |
| newFromMeridiq      |     7 |

> **Blocker:** 28 dubbletter + 15 osäkra (via=name) i Review Queue. Drive-koppling saknas.

### 🟡 #3 — Historiska journaler kopplade till rätt patient (eller i Review Queue)

| Metric                  | Värde |
| ----------------------- | ----: |
| meridiqClaimsJournal    |  6268 |
| patientsWithEntry       |    20 |
| gap                     |  6248 |
| historicalImportEntries |    34 |

> **Blocker:** Meridiq bulk-import saknas: 6248 patienter utan historik. Se docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md (P0.7).

### 🟡 #4 — Historiska bilder kopplade till rätt patient + encounter

| Metric            |                             Värde |
| ----------------- | --------------------------------: |
| totalPhotos       |                             22243 |
| linkedToEncounter |                                 1 |
| bySource          | {"drive_import":22240,"upload":3} |

> **Blocker:** Drive-bilder ej importerade — service-account-blocker (P0.3 → P0.6).

### 🟢 #5 — Formulär + samtycken kopplade till patient

| Metric           | Värde |
| ---------------- | ----: |
| consentTemplates |    45 |
| formTemplates    |    29 |
| totalTemplates   |    97 |

### 🟢 #6 — Ny CCO-journal fungerar end-to-end (skapa → signera → lås → PDF → audit)

| Metric    | Värde |
| --------- | ----: |
| total     |    34 |
| signed    |    24 |
| locked    |    24 |
| withPdf   |    22 |
| corrected |     0 |

### 🔴 #7 — Foto-flow fungerar (ta bild → koppla till encounter → bevara original)

| Metric      |           Värde |
| ----------- | --------------: |
| totalPhotos |               0 |
| byType      |              {} |
| bySource    |              {} |
| dataSource  | cco-photo-store |

> **Blocker:** ccoPhotoStore tom — UI finns men ingen live photo registrerad.

### 🟢 #8 — Sign/lock/rättelse/PDF/audit verifierat med smoke-test

| Metric    | Värde |
| --------- | ----: |
| signed    |    24 |
| withPdf   |    22 |
| corrected |     0 |

### 🟡 #9 — Journal QA-dashboard visar 100% coverage på relevanta segment

| Metric            |                           Värde |
| ----------------- | ------------------------------: |
| dashboardDeployed |                            true |
| endpoint          | /api/v1/cco/journal-qa/snapshot |
| page              |                /journal-qa.html |
| dependsOn         |                ["#1","#3","#4"] |

> **Blocker:** Drive-coverage 0% — dashboard visar yellow/red tills service-account + Meridiq-import är klar.

### 🔴 #10 — Cutover Readiness Report GREEN på alla blockers

| Metric        | Värde |
| ------------- | ----: |
| greenCriteria |     3 |
| totalCriteria |     9 |

> **Blocker:** 6 av 9 underliggande kriterier inte GREEN.

## Slutsats

**Overall readiness: 🔴 RED**

### Blockers som måste lösas:

- 🟡 **#1:** Drive-folderId saknas på 7257/7257 patienter — väntar på service-account (P0.3).
- 🟡 **#2:** 28 dubbletter + 15 osäkra (via=name) i Review Queue. Drive-koppling saknas.
- 🟡 **#3:** Meridiq bulk-import saknas: 6248 patienter utan historik. Se docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md (P0.7).
- 🟡 **#4:** Drive-bilder ej importerade — service-account-blocker (P0.3 → P0.6).
- 🔴 **#7:** ccoPhotoStore tom — UI finns men ingen live photo registrerad.
- 🟡 **#9:** Drive-coverage 0% — dashboard visar yellow/red tills service-account + Meridiq-import är klar.
- 🔴 **#10:** 6 av 9 underliggande kriterier inte GREEN.

### Cliento-cutover-villkor

- [x] Alla kunder finns i CCO (Fas 1 klar)
- [ ] Bokningskritiska data överförda
- [ ] Dubbletter hanterade (28 kandidater)
- [ ] CCO-bokning fungerar (Fas 3)
- [ ] Personalen hittar kundkort + historik
- [ ] Inga nya bokningar behöver skapas i Cliento

### Meridiq-cutover-villkor

- [x] Journalmallar finns i CCO
- [ ] Historiska journaler/formulär/PDF/samtycken kopplade (gap: 6248)
- [x] Ny journalföring sker i CCO (entries: 34)
- [x] Signering/låsning/rättelse fungerar
- [x] PDF-arkivering fungerar (PDFs: 22)
- [x] Audit/loggning fungerar (218123 events)
- [ ] QA visar att inga patientjournaler saknas

### Estimerad tid till GREEN

- Drive service-account-konfig: **0,5 dag** (owner) + **0,5 dag** crawl
- Meridiq API-access + bulk-import: **5–6 dagar** (P0.7 redo att köra)
- Drive bild-bulk-import: **4 dagar** (efter service-account)
- Foto-flow live-data: **rolling** (genereras vid första behandling i CCO)

**Total estimering: ~7–14 dagar parallellt arbete.**

## Källor

- `data/cco-customers.json` — Cliento + Meridiq + Drive-flaggor
- `data/cco-journal.json` — journal-entries
- `data/cco-templates.json` — formulär + samtycken
- `data/cco-audit.jsonl` — audit-events
- `data/cco-photo-store.json` — bilder (om finns)
- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md` — blocker-katalog
- `docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md` — P0.7 gap

## Compliance-check

- [x] Inga patientnamn — regex-scan verifierad innan write
- [x] Inga personnummer — regex `[0-9]{6}[-[:space:]]?[0-9]{4}` (PCRE) → 0 träffar
- [x] Inga emails — regex `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` (PCRE) → 0 träffar
- [x] Inga telefonnummer — regex `\+46[0-9]{8,}` (PCRE) → 0 träffar
- [x] Endast counts/percentages/struktur-IDs

_Senast genererad: 2026-06-25T19:28:49.890Z · auto-rapport · Status: RED_
