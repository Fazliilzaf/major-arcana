# Aisia MVP — Handoff (pausad / isolerad)

_Genererad: 2026-05-30_  
_Status: FAS 0 + FAS 1 godkänd som isolerad MVP. **Pausad** — ingen FAS 2+._

---

## Beslut

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| **Godkända commits** | `8694455d` (MVP), `5d93a446` (integration fix), `fe7f4a96` (runbook) |
| **Modulstatus**      | Byggd och testad, **dold som default**                               |
| **Feature flag**     | `ENABLE_AISIA_SCALP_ANALYSIS=false` (default)                        |
| **Aktivering**       | Endast när owner säger **`APPLY AISIA TO CCO`**                      |
| **FAS 2/3/4**        | **BLOCKERAD** — exportfolder, kamera/USB/SDK, egen AI                |

---

## Feature flags

| Flag                          | Default | Effekt                                      |
| ----------------------------- | ------- | ------------------------------------------- |
| `ENABLE_AISIA_SCALP_ANALYSIS` | `false` | Styr API, UI-flik, timeline, asset-laddning |

**När `false` (nuvarande läge):**

- API `/api/v1/cco/scalp-analysis/*` → `404 aisia_scalp_analysis_disabled`
- Patientkort: ingen flik **Hår-/scalpanalys**
- Journal/profil: ingen Aisia-callout
- Preview HTML: laddar inte `cco-scalp-analysis.css/js`
- Tidslinje: inga scalp-events
- Modulkod finns kvar i repo — **ingen radering**

**När `true` (efter APPLY AISIA TO CCO):**

- Full FAS 1 MVP enligt runbook
- Sätt `ENABLE_AISIA_SCALP_ANALYSIS=true` i `.env` och starta om server

**Frontend-flagga (injiceras i preview HTML):**

```javascript
window.__ARCANA_ENABLE_AISIA_SCALP_ANALYSIS__ = true | false;
```

---

## Commits (Aisia-spåret)

| Commit     | Beskrivning                                                    |
| ---------- | -------------------------------------------------------------- |
| `8694455d` | `feat(aisia): Hair TP scalp analysis MVP with Swedish adapter` |
| `5d93a446` | `fix(aisia): verify MVP integration in CCO view`               |
| `fe7f4a96` | `docs(aisia): MVP pilot runbook for clinic staff`              |

**Isolering (paus-spärr):** feature flag `ENABLE_AISIA_SCALP_ANALYSIS=false` — config, server mount, preview inject, patient-master UI gated.

---

## Filer (modulen)

### Backend / core

| Fil                                | Roll                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `src/ops/ccoScalpAnalysisStore.js` | Session, metrics, images, comparisons, timeline, protocol |
| `src/ops/aisiaTerminology.js`      | EN→SV adapter (originaldata bevaras)                      |
| `src/routes/ccoScalpAnalysis.js`   | REST API + multer import                                  |
| `src/security/ccoRbac.js`          | `scalp.read` / `scalp.write` / `scalp.verify`             |
| `src/config.js`                    | `enableAisiaScalpAnalysis`                                |
| `server.js`                        | Router mount (gated), timeline (gated), preview inject    |

### Frontend

| Fil                                                    | Roll                                  |
| ------------------------------------------------------ | ------------------------------------- |
| `public/cco-scalp-analysis.js`                         | Flik-modul (`CcoScalpAnalysis.mount`) |
| `public/cco-scalp-analysis.css`                        | Flik-stilar                           |
| `public/major-arcana-preview/app/patient-master-ui.js` | Flik + callout (gated)                |
| `public/major-arcana-preview/index.html`               | Asset-länkar (strippas när flag off)  |

### Tester & verifiering

| Fil                                       | Roll                    |
| ----------------------------------------- | ----------------------- |
| `tests/ops/aisiaTerminology.test.js`      | SV-adapter              |
| `tests/ops/ccoScalpAnalysisStore.test.js` | Store + protocol        |
| `tests/routes/ccoScalpAnalysis.test.js`   | API integration         |
| `scripts/smoke-test-scalp-analysis.js`    | Smoke                   |
| `scripts/verify-aisia-cco-integration.js` | Full integration verify |

### Dokumentation

| Fil                                                              |
| ---------------------------------------------------------------- |
| `docs/strategy/AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`            |
| `docs/strategy/AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md` |
| `docs/strategy/AISIA-CAPTURE-PROTOCOL.md`                        |
| `docs/strategy/AISIA-FOLLOW-UP-WORKFLOW.md`                      |
| `docs/strategy/AISIA-SWEDISH-TERMINOLOGY.md`                     |
| `docs/strategy/AISIA-COMPLIANCE-SECURITY-CHECKLIST.md`           |
| `docs/strategy/AISIA-UI-PLACEMENT.md`                            |
| `docs/strategy/AISIA-MVP-BUILD-PLAN.md`                          |
| `docs/strategy/AISIA-CCO-INTEGRATION-PLAN.md`                    |
| `docs/strategy/AISIA-DS3-FEATURE-EXTRACTION-MATRIX.md`           |
| `docs/schema/cco-scalp-analysis.schema.md`                       |

### Data (gitignored — ingen patientdata i repo)

| Fil                            |
| ------------------------------ |
| `data/cco-scalp-analysis.json` |

---

## API-endpoints (endast när flag=true)

| Metod | Path                                                            | RBAC           |
| ----- | --------------------------------------------------------------- | -------------- |
| GET   | `/api/v1/cco/scalp-analysis/patient/:patientId`                 | `scalp.read`   |
| GET   | `/api/v1/cco/scalp-analysis/patient/:patientId/protocol-status` | `scalp.read`   |
| GET   | `/api/v1/cco/scalp-analysis/patient/:patientId/patient-view`    | `scalp.read`   |
| GET   | `/api/v1/cco/scalp-analysis/sessions/:sessionId`                | `scalp.read`   |
| GET   | `/api/v1/cco/scalp-analysis/meta/enums`                         | `scalp.read`   |
| POST  | `/api/v1/cco/scalp-analysis/sessions`                           | `scalp.write`  |
| POST  | `/api/v1/cco/scalp-analysis/sessions/:id/import-report`         | `scalp.write`  |
| POST  | `/api/v1/cco/scalp-analysis/sessions/:id/import-images`         | `scalp.write`  |
| POST  | `/api/v1/cco/scalp-analysis/sessions/:id/metrics`               | `scalp.write`  |
| POST  | `/api/v1/cco/scalp-analysis/sessions/:id/verify`                | `scalp.verify` |
| POST  | `/api/v1/cco/scalp-analysis/comparisons`                        | `scalp.write`  |

---

## UI

| Element                        | Plats                         | Synlig när flag=false |
| ------------------------------ | ----------------------------- | --------------------- |
| Flik **Hår-/scalpanalys**      | Patientkort desktop/mobil     | **Nej**               |
| Aisia callout i journal/profil | `renderScalpImagingCallout()` | **Nej**               |
| `CcoScalpAnalysis.mount()`     | Scalpanalys-panel             | **Nej**               |
| Patientvy disclaimer           | Scalpanalys-flik              | **Nej**               |

**Stör inte:** Journal, kalender, kommunikation, övriga patientkort-flikar — Aisia-UI renderas inte alls när flaggan är off.

---

## Vad som är klart (FAS 0 + FAS 1)

- Import- och analyslager i CCO (manuell PDF + bildimport)
- Koppling till patientkort via assets + secure storage
- Swedish adapter (`aisiaTerminology.js`)
- Timeline-events (`scalp_analysis_*`)
- RBAC + audit
- Capture protocol completeness checks
- Baseline / follow-up / pre-op protocol-status
- Metric comparison (delta, ingen auto-rekommendation)
- Patientvy med disclaimer (SV)
- Integration verification + unit tests (7/7 PASS)
- Pilot runbook för klinik

---

## Vad som är spärrat

| Item                                     | Gate                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| FAS 2 — export folder / auto-import API  | Owner GO                                                  |
| FAS 3 — direkt kamera / USB / SDK        | Owner GO                                                  |
| FAS 4 — egen klinisk AI                  | Owner GO + legal                                          |
| Integration `aisiausa.umersoft.com:8864` | **Förbjuden**                                             |
| Extern AI på patientdata                 | **Förbjuden**                                             |
| UI/API synlighet i prod                  | `APPLY AISIA TO CCO` + `ENABLE_AISIA_SCALP_ANALYSIS=true` |
| Ersättning av Aisia DS-3 programmet      | **Aldrig** — CCO är importlager                           |

---

## Hur vi senare applicerar i CCO

1. Owner säger **`APPLY AISIA TO CCO`** i chat.
2. Sätt i prod `.env`:
   ```bash
   ENABLE_AISIA_SCALP_ANALYSIS=true
   ```
3. Starta om CCO-server.
4. Verifiera:
   ```bash
   node scripts/verify-aisia-cco-integration.js
   node --test tests/ops/aisiaTerminology.test.js \
                tests/ops/ccoScalpAnalysisStore.test.js \
                tests/routes/ccoScalpAnalysis.test.js
   ```
5. Pilot enligt `AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`.
6. **Inte** starta FAS 2 utan separat beslut.

---

## Tester (körs oberoende av flag — isolerade)

```bash
node --test tests/ops/aisiaTerminology.test.js \
             tests/ops/ccoScalpAnalysisStore.test.js \
             tests/routes/ccoScalpAnalysis.test.js
```

Integration verify (egen testserver, kräver inte prod flag):

```bash
node scripts/verify-aisia-cco-integration.js
```

---

## Compliance (oförändrat)

- Ingen extern AI på patientdata
- Ingen patientbild/journal i GitHub
- Aisia PDF/bilder i CCO secure storage only
- Behandlarverifiering krävs (`scalp.verify`)
- Ingen automatisk diagnos i patientvy

---

## Regel framåt

> **Kamera/Aisia-spåret är pausat** tills owner uttryckligen säger **`APPLY AISIA TO CCO`**.  
> Fortsätt **inte** i detta spår utan det uttryckliga beslutet.

**Full prod-import (Drive-migration) och övrigt CCO-bygge fortsätter separat — blandas inte med Aisia.**
