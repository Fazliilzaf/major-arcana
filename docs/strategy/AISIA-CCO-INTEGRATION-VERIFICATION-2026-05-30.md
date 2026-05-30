# Aisia CCO Integration Verification — 2026-05-30

**Scope:** FAS 1 MVP (commit `8694455d` + sprint-fixar i denna verifiering)  
**Mål:** Bekräfta att manuell Aisia-import fungerar i CCO patientkort utan FAS 2/3/4  
**Verifieringskommando:** `node ./scripts/verify-aisia-cco-integration.js`  
**Relaterade tester:** `tests/ops/aisiaTerminology.test.js`, `tests/ops/ccoScalpAnalysisStore.test.js`, `tests/routes/ccoScalpAnalysis.test.js`, `scripts/smoke-test-scalp-analysis.js`

---

## Executive summary

| Område                    | Status                       | Kommentar                                              |
| ------------------------- | ---------------------------- | ------------------------------------------------------ |
| 1. Patientkort / flikar   | **PASS** (statisk + kod)     | Desktop + mobil flik; mount via `CcoScalpAnalysis`     |
| 2. Manuell import         | **PASS**                     | PDF + bild → secure storage, korrekta kategorier       |
| 3. Patientkoppling        | **PASS**                     | `patientId` + valfri `encounterId` bevaras på assets   |
| 4. Tidslinje              | **PASS**                     | Alla 5 event-typer skapade                             |
| 5. Journal / konsultation | **PASS** (delvis UI)         | Pre-op callout + disclaimer; ingen auto-diagnos        |
| 6. Pre-op readiness       | **PASS**                     | Status/gate via `protocol-status` + callout            |
| 7. Follow-up / jämförelse | **PASS** (API) / **P1** (UI) | Metric-delta fungerar; bildjämförelse saknas           |
| 8. Swedish adapter        | **PASS**                     | Svenska etiketter + patientvy-disclaimer               |
| 9. RBAC + audit           | **PASS**                     | 403 på otillåtna roller; audit utan binärdata          |
| 10. Compliance            | **PASS**                     | Ingen extern AI, ingen Drive-länk, inga filer i GitHub |

**Rekommendation:** **Villkorad GO för MVP i klinikflöde** — manuell import + verifiering av behandlare kan användas i pilot med Hair TP personal som redan kör Aisia DS-3 lokalt. Full capture-protokoll (alla zoner), visuell mobil-E2E på prod och bildjämförelse i UI är **P1** innan bred cutover.

**FAS 2/3/4:** Ej startade. Ingen kod mot `aisiausa.umersoft.com:8864`.

---

## Sprint-fixar (FAS 1, inom mandat)

Under verifieringen åtgärdades:

1. **`verifySession` duplicerad som `addMetric`** i `public/cco-scalp-analysis.js` — verify-knappen fungerade inte.
2. **Jämförelse-API:** UI skickade `followUpSessionId`; backend kräver `comparisonSessionId`.
3. **Baseline i UI:** sökte `sessionType === 'baseline'`; store använder `consultation` (verifierad) som baseline — jämförelseknapp syntes aldrig.
4. **Mobilflik + pre-op callout** (påbörjat före sprint): `Scalpanalys` på mobil, `renderScalpImagingCallout()` + `loadScalpProtocolStatus()` i `patient-master-ui.js`.
5. **Patientvy-sektion** i scalp-UI: hämtar `/patient-view` och visar förenklad svenska sammanfattning.

---

## 1. Patientkort

### Verifierat

- **Desktop:** flik `Hår-/scalpanalys` (`data-patient-tab="scalpanalys"`) i `patient-master-ui.js`.
- **Mobil (≤1023px):** flik `Scalpanalys` — samma `data-patient-tab`, kompakt etikett.
- **Mount:** vid aktiv flik anropas `CcoScalpAnalysis.mount()` mot panel `[data-patient-tab-panel="scalpanalys"]`.
- **Övriga flikar:** Journal, Filer, Tidslinje, Avtal (desktop) oförändrade i tab-struktur.
- **Assets:** `index.html` laddar `/cco-scalp-analysis.css` och `/cco-scalp-analysis.js`.

### Mobilstatus

| Kontroll                    | Resultat                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- |
| Mobilflik finns i kod       | PASS                                                                            |
| Desktopflik finns i kod     | PASS                                                                            |
| Playwright/prod visuell E2E | **Ej körd** (P1 — rekommenderas via `verify:adaptive-layout-prod` efter deploy) |

---

## 2. Manuell import

### Testade endpoints

| Metod | Endpoint                                                | Resultat            |
| ----- | ------------------------------------------------------- | ------------------- |
| POST  | `/api/v1/cco/scalp-analysis/sessions`                   | 201                 |
| POST  | `/api/v1/cco/scalp-analysis/sessions/:id/import-report` | 200 (multipart PDF) |
| POST  | `/api/v1/cco/scalp-analysis/sessions/:id/import-images` | 200 (multipart PNG) |

### Assets skapade (anonymiserad testdata)

| Kategori       | MIME              | Status                    | sourceSystem |
| -------------- | ----------------- | ------------------------- | ------------ |
| `aisia_report` | `application/pdf` | `VISIBLE_ON_PATIENT_CARD` | `aisia_ds3`  |
| `photo_before` | `image/png`       | `VISIBLE_ON_PATIENT_CARD` | `aisia_ds3`  |

_(Konsultation-session → `photo_before`; `follow_up` skulle ge `photo_after` enligt `photoCategoryForSessionType()`.)_

### storageKey / checksum

| Asset | storageKey (exempel)        | checksum verifierad | Originalbytes oförändrade |
| ----- | --------------------------- | ------------------- | ------------------------- |
| PDF   | `2026/05/<hash>/<uuid>.pdf` | SHA-256 match       | Ja (`%PDF-1.4…`)          |
| Bild  | `2026/05/<hash>/<uuid>.png` | SHA-256 match       | Ja (1×1 PNG)              |

Filer lagras i **temporär lokal secure storage** under verifieringsscriptet — **inte** i git-trackade paths. Repo-regel: `data/` är gitignored.

---

## 3. Patientkoppling

| Fält             | Resultat                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patientId`      | Satt på session, assets, timeline, comparison                                                                                                                  |
| `encounterId`    | Propageras till assets när angiven vid session-skapande                                                                                                        |
| Saknad encounter | Tillåten — session/assets patient-only, status `IMPORTED_TO_CCO` → `VISIBLE_ON_PATIENT_CARD` (ingen auto `NEEDS_REVIEW` för manuell import med hög confidence) |

---

## 4. Tidslinje

Alla fem krävda event-typer skapades i `cco-scalp-analysis.json` (store timeline):

| Event                      | Trigger                             |
| -------------------------- | ----------------------------------- |
| `scalp_analysis_imported`  | Session skapad + PDF kopplad        |
| `scalp_image_added`        | Bildimport                          |
| `scalp_metrics_added`      | POST metrics                        |
| `scalp_analysis_verified`  | POST verify (kräver `scalp.verify`) |
| `scalp_comparison_created` | POST comparisons                    |

_(Flera `scalp_analysis_imported` vid session + report är förväntat enligt nuvarande store-logik.)_

---

## 5. Journal / konsultation

| Krav                                       | Status                                                        |
| ------------------------------------------ | ------------------------------------------------------------- |
| Scalp-data som stöd i konsultation         | **PASS** — callout på profil/journal-shell med länk till flik |
| Ingen automatisk diagnos                   | **PASS** — disclaimer i callout + `PATIENT_VIEW_DISCLAIMER`   |
| Ingen automatisk behandlingsrekommendation | **PASS** — ingen sådan logik i routes/store                   |
| Behandlare verifierar                      | **PASS** — `POST …/verify` sätter `status: verified`          |

**P2:** Full journal-detail-vy (alla underflikar) har inte egen scalp-callout — endast profil + journal shell lite.

---

## 6. Pre-op readiness

Endpoint: `GET /api/v1/cco/scalp-analysis/patient/:patientId/protocol-status`

Returnerar bl.a.:

- `baselineExists` / `imagingChecklist.baselineComplete`
- `imagingChecklist.donorLeft` / `donorRight`
- `imagingChecklist.analysisVerified`
- `protocol.baselineImagingRequired`, `donorRecipientImagesRequired`, `analysisVerifiedRequired` (gate-flaggor)

UI: `renderScalpImagingCallout()` visar checklista + pre-op gate-rader — **status/gate, inte kliniskt AI-beslut**.

---

## 7. Follow-up

| Funktion                                        | Status                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Baseline vs uppföljning (metric delta)          | **PASS** — `POST /comparisons` beräknar t.ex. `total_hair_count.delta` |
| UI: visa befintliga comparisons                 | **PASS**                                                               |
| UI: skapa jämförelse (knapp)                    | **FIXAD** i sprint — kräver verifierad `consultation` + `follow_up`    |
| Bildjämförelse side-by-side                     | **P1** — `imageComparison: null`                                       |
| Automatisk behandlingsrekommendation från delta | **Ej implementerad** (korrekt)                                         |

**FAS 2:** Exportfolder/API — **ej påbörjad** (enligt owner-beslut).

---

## 8. Swedish adapter

| Kontroll                  | Resultat                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| `GET …/patient-view`      | Disclaimer på svenska                                                       |
| Metric `total_hair_count` | Visas som **Hårantal**                                                      |
| Session-typer             | t.ex. **Konsultation**, **Verifierad**                                      |
| Originalrapport           | Oförändrad PDF i storage; översättning är CCO-lager (`aisiaTerminology.js`) |

Källa: `docs/strategy/AISIA-SWEDISH-TERMINOLOGY.md`

---

## 9. RBAC + audit

### Permissions (`src/security/ccoRbac.js`)

| Permission     | Roller                             |
| -------------- | ---------------------------------- |
| `scalp.read`   | owner, operator, konsult, personal |
| `scalp.write`  | owner, operator, konsult           |
| `scalp.verify` | owner, operator, konsult           |

### RBAC-tester (403 förväntat)

| Roll       | Action                    | Resultat |
| ---------- | ------------------------- | -------- |
| `personal` | POST session (write)      | 403 PASS |
| `personal` | POST verify               | 403 PASS |
| `revisor`  | GET patient bundle (read) | 403 PASS |

### Audit (`scalp.json` → `audit[]`)

Actions loggade: `scalp.session.create`, `scalp.session.update`, `scalp.image.add`, `scalp.metrics.add`, `scalp.session.verify`, `scalp.comparison.create`

**Payload:** inga råa PDF/PNG-bytes i audit — endast IDs och metadata.

---

## 10. Compliance

| Regel                                    | Status                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingen extern AI på patientbilder/journal | **PASS** — inga AI-anrop i scalp-modulen                                                                                                                                                           |
| Ingen patientdata i GitHub               | **PASS** — import till temp/`data/` (gitignored)                                                                                                                                                   |
| Inga Drive-länkar som slutlösning        | **PASS** — `storageKey` i CCO secure storage                                                                                                                                                       |
| Originalrapport oförändrad               | **PASS** — byte-identisk PDF vid read-back                                                                                                                                                         |
| Svensk översättning = CCO-lager          | **PASS**                                                                                                                                                                                           |
| Behandlare verifierar                    | **PASS** — verify-endpoint                                                                                                                                                                         |
| Klinisk rekommendation                   | **Ej flaggad** — inget i nuvarande UI/API liknar auto-rekommendation; `recommended_graft_range` i terminologin är **NEEDS_LEGAL_REVIEW** om det börjar visas som beslut (idag manuell metric only) |
| FAS 2 API / kamera / egen AI             | **Ej byggt**                                                                                                                                                                                       |

---

## UI-delar som fungerar (FAS 1)

- Patientkort-flik **Hår-/scalpanalys** / **Scalpanalys**
- Skapa session, importera PDF, importera bilder
- Manuella mätvärden + tabell med svenska etiketter
- Verifiera session (behandlare)
- Protokoll-status (zoner, donor v/h)
- Patientvy (förenklad svenska)
- Jämförelse-lista + skapa metric-jämförelse
- Pre-op imaging callout med hopp till flik

---

## Kvarvarande buggar / backlog

| ID        | Prioritet | Beskrivning                                                                                                   |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| AISIA-V01 | **Fixad** | verifySession trasig (duplicerad funktion)                                                                    |
| AISIA-V02 | **Fixad** | comparisonSessionId fel fältnamn i UI                                                                         |
| AISIA-V03 | **Fixad** | baseline sessionType i UI                                                                                     |
| AISIA-V04 | **P1**    | Visuell mobil/desktop E2E på prod ej körd                                                                     |
| AISIA-V05 | **P1**    | Full capture-protokoll (10+ zoner) — MVP flaggar saknade zoner men tvingar inte import per zon                |
| AISIA-V06 | **P1**    | Bildjämförelse UI (`imageComparison`)                                                                         |
| AISIA-V07 | **P2**    | Scalp-callout saknas i vissa journal-underpaneler                                                             |
| AISIA-V08 | **P2**    | Öppna original-PDF inline i scalp-flik (asset download-länk finns via asset-store, ej dedikerad scalp-viewer) |

---

## Validering körd

```
node ./scripts/verify-aisia-cco-integration.js     → overallPass: true
node --test tests/ops/aisiaTerminology.test.js \
         tests/ops/ccoScalpAnalysisStore.test.js \
         tests/routes/ccoScalpAnalysis.test.js       → 7/7 PASS
```

---

## Rekommendation: MVP i klinikflöde

**GO (pilot)** om:

1. Personal fortsätter använda **Aisia DS-3 lokalt** (ingen FAS 2-export ännu).
2. Import sker **manuellt** via CCO-fliken efter varje Aisia-session.
3. **Behandlare verifierar** varje session innan den används i pre-op-beslut.
4. Owner accepterar **P1-gap**: visuell mobil-verify, full zon-checklista, bildjämförelse.

**NO-GO för:**

- Ersättning av Aisia-programmet
- Automatiserad export från Aisia-server (FAS 2)
- Direkt kamerakoppling (FAS 3)
- Egen klinisk AI (FAS 4)

---

_Verifierad: 2026-05-30 · Sprint: CCO Integration Verification · Bas-commit: 8694455d_
