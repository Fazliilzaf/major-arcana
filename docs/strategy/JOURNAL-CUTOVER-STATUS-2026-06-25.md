# Journal Cutover — Aktuell statusrapport

_Genererad: 2026-06-25T19:28:49.042Z · Datum-tag: 2026-06-25_
_Jämförelsebas: `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md`_
_Compliance: counts only — ingen patientdata._

## Executive summary

| Spår                    | Maj audit    | Repo `data/` idag     | Prod asset-snapshot | Bedömning                                     |
| ----------------------- | ------------ | --------------------- | ------------------- | --------------------------------------------- |
| Cutover DoD (10)        | RED (3/10🟢) | RED (3/10🟢)          | assets-only         | Struktur byggd · data-gap kvar                |
| Journalföringspilot     | Ej GO        | API/smoke klart i kod | —                   | **GO** prod jun (se CCO-JOURNALING-READINESS) |
| Patientdokument BOOKOFF | Ej påbörjat  | **36/36 D·L·V**       | —                   | Facit-spår klart (ej cutover DoD)             |
| Drive master-ID         | 0/7257       | 0/7257                | —                   | **Owner-blocker:** service-account            |

## Miljöer

| Miljö               | Sökväg / källa                                                                                                             | Användning                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Repo `data/`        | `./data/`                                                                                                                  | Cutover-script, dev-baseline       |
| Prod asset-snapshot | `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data/cco-prod` | Assets + review (2026-05-31)       |
| Prod live API       | `arcana.hairtpclinic.com`                                                                                                  | Pilot/journal-feed (jun-rapporter) |

## Nyckeltal — maj → repo idag

| Metric                       | Maj 2026 | Repo idag | Δ                  |
| ---------------------------- | -------- | --------- | ------------------ |
| Cliento-kunder               | 7257     | 7257      | =                  |
| Meridiq-matched              | 6268     | 6268      | =                  |
| Drive folder-ID              | 0        | 0         | **Oförändrat**     |
| Journal-entries              | 16       | 34        | +18                |
| Signerade                    | 8        | 24        | +16                |
| Med PDF                      | 0        | 22        | +22                |
| Templates                    | 82       | 97        | +15                |
| Audit-events                 | 115      | 218123    | import-/asset-logg |
| Foto-assets (patient_assets) | 0        | 22243     | se nedan           |
| Dubblettkandidater           | 28       | 28        | =                  |

## Prod asset-snapshot (read-only)

_Snapshot: 2026-05-31 · root: `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data/cco-prod`_

| Metric                       | Värde |
| ---------------------------- | ----: |
| Assets totalt                |  1216 |
| LINK_ONLY_BLOCKER            |     0 |
| NEEDS_REVIEW                 |   885 |
| VISIBLE_ON_PATIENT_CARD      |   325 |
| Foto-assets (kategori)       |   865 |
| Foto NEEDS_REVIEW (operator) |   860 |
| Patienter m. pending foto    |   150 |

> Jun-rapporter nämner ~5152 historiska **journal-entries** på prod — det ligger i journal-store, inte nödvändigtvis i denna asset-snapshot (1216 assets @ 2026-05-31).

## DoD #1–10 (repo `data/`) — 🔴 **RED**

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

## Parallellt spår: BOOKOFF 36 dokumenttyper

| Kol                | Status                   | Facit                                                             |
| ------------------ | ------------------------ | ----------------------------------------------------------------- |
| U                  | 36/36                    | `docs/implementation/patient-documents-live/BOOKOFF-CHECKLIST.md` |
| T                  | 36/36 (32 facit + 4 n/a) | `npm run verify:patient-doc-t-pass`                               |
| D · L · V          | 36/36                    | full-page `/patient-doc/{registryId}`                             |
| Sektion D workshop | SIGNED_OFF               | 6/6 APPROVED                                                      |

## Spår A–D — cutover-leverans

**NOT_DELIVERED (0/4)** — Inget spår A–D cutover-klart. Underlag: skript + dry-run + operator-UI. Owner-blockers och manuell drift återstår.

| Spår              | Cutover | Status        | Blocker               | Nyckeltal                |
| ----------------- | ------- | ------------- | --------------------- | ------------------------ |
| A · Drive         | ❌      | NOT_DELIVERED | DRIVE_NOT_COMMITTED   | 0/7257 driveFolderId     |
| B · Meridiq       | ❌      | NOT_DELIVERED | ARCANA_MERIDIQ_COOKIE | 0 id · 0 import          |
| C · Photo Review  | ❌      | NOT_DELIVERED | CANARY_OFF            | 860 pending · 1 VISIBLE  |
| D · Import review | ❌      | NOT_DELIVERED | CANARY_OFF            | 1497 osäkra · 0 resolved |

> Detta är nuläge/underlag — inte leverans. Kö-siffror ≠ pågående cutover.

Public JSON: `public/cco-migration-tracks-status.json` · UI: `/cco-ops-workbench.html#migration-hub`

## Spår A–D — underlag (dry-run / operator-UI)

### A · Drive service-account + master folder-ID

- Service-account env: **KONFIGURERAD** (ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON)
- Dry-run coupling: **6268/7257** predicted (86.4%) — proxy via meridiqMeta tills SA + crawl
- Nästa: owner levererar SA → `scripts/migration/scanGoogleDriveApi.js` → `backfill-master-card-drive-coupling.js` (commit)

### B · Meridiq bulk journal-import

- Dry-run: **6268** eligible → **0** entries planned (mock×2/patient)
- Blocker: Meridiq read-only API-token (`--meridiq-api-token`) — se `MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md`
- Script: `node scripts/import-meridiq-historical-journals.js --dry-run`

### C · Photo Review (migrerade bilder)

- Pending foton: **860** · patienter: **150** · write: **AV**
- Canary: **0/25** beslut · kvar **25**
- Operator: `/photo-review.html` (alias `/cco-photo-review.html`) · max 25/batch
- Status: `node scripts/photo-review-batch-status.js`

### D · Import review queue

- Totalt: **1497** · status: `WAITING_MANUAL_REVIEW`
  - halso@: **1366** pending
  - GetAccept: **131** pending
- Write: **AV** · manuell batch max **25**/beslut
- Operator: `/cco-import-review.html` · ingen auto-merge · ingen ny kund
- Status: `npm run import-review:batch-status`

## Rekommenderad ordning

1. **A** — Drive SA (owner) → folder crawl → master-kort #1
2. **B** — Meridiq API → bulk journal #3
3. **C** — Photo Review canaries → #4
4. **D** — Import review (1497) i batchar → #2
5. Kör om: `node scripts/generate-cutover-readiness-report.js` + denna rapport

## Källor

- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md`
- `docs/strategy/CCO-JOURNALING-READINESS-2026-06-02.md`
- `docs/strategy/CCO-DAILY-READINESS-2026-06-04.md`
- `docs/implementation/patient-documents-live/BOOKOFF-CHECKLIST.md`
- `scripts/generate-cutover-readiness-report.js`
- `scripts/generate-journal-cutover-status-report.js`
