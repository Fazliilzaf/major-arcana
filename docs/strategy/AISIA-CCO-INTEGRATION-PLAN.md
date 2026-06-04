# Aisia / CCO Integration Plan

**Modul:** Hair TP Imaging & Scalp Analysis (Aisia DS-3 Camera Integration)  
**Datum:** 2026-05-30  
**Princip:** Aisia mäter och exporterar → CCO importerar, översätter, kopplar, verifierar

---

## Arkitektur

```
┌─────────────────┐     export (PDF/bilder)      ┌──────────────────────────┐
│  Aisia DS-3     │ ───────────────────────────► │  CCO Scalp Analysis MVP  │
│  (acquisition)  │     manuell / FAS 2 bridge   │  (import + struktur)     │
└─────────────────┘                              └───────────┬──────────────┘
                                                               │
                    ┌──────────────────────────────────────────┼──────────────────┐
                    ▼                    ▼                     ▼                  ▼
           ccoPatientAssetStore   ccoScalpAnalysisStore   journal-timeline   patientkort-flik
           (aisia_report, photos) (sessions/metrics)    (audit events)     (staff + patient vy)
                    │
                    ▼
           ccoSecureStorageProvider (ingen Drive-länk i slut-UI)
```

## Faser

| Fas       | Scope                                                                       | Status                       |
| --------- | --------------------------------------------------------------------------- | ---------------------------- |
| **FAS 0** | Audit, extraction matrix, data model, protokoll, terminology, compliance    | ✅ Dokument                  |
| **FAS 1** | Manuell import PDF + bilder, session/metrics, verifiering, patientkort-flik | ✅ Implementeras             |
| **FAS 2** | Export-folder bridge, auto-import                                           | ⛔ Kräver owner-confirmation |
| **FAS 3** | Direkt kamera/USB/SDK                                                       | ⛔ Kräver owner-confirmation |
| **FAS 4** | Egen AI beslutsstöd                                                         | ⛔ Kräver legal review       |

## FAS 1 — MVP dataflöde

1. Behandlare kör session i Aisia (oförändrat arbetsflöde).
2. Operatör exporterar PDF + bilder från Aisia till lokal fil.
3. CCO: `POST /api/v1/cco/scalp-analysis/sessions` — skapa session (`source=aisia_ds3`).
4. CCO: `POST .../import-report` — PDF → secure storage → `patient_asset` (`aisia_report`).
5. CCO: `POST .../import-images` — bilder → secure storage → `photo_before|during|after` + `scalp_analysis_images`.
6. CCO: `POST .../metrics` — manuella mätvärden (eller framtida PDF-extraction).
7. Behandlare: `POST .../verify` — status `verified`, audit `scalp_analysis_verified`.
8. Timeline + patientkort uppdateras automatiskt.

## Koppling till befintliga CCO-moduler

| Modul                        | Integration                                           |
| ---------------------------- | ----------------------------------------------------- |
| `ccoPatientAssetStore`       | Alla binärer (PDF, bilder)                            |
| `ccoSecureStorageProvider`   | Lagring utanför repo                                  |
| `ccoTreatmentEncounterStore` | `encounterId` på session/bilder                       |
| `ccoConsultationStore`       | Imaging-checklista i konsultation (read-only flaggor) |
| `ccoOperationStore`          | Pre-op readiness: baseline + donor/recipient required |
| `ccoFollowUpStore`           | Jämförelse mot baseline                               |
| Journal timeline             | Events: `scalp_analysis_*`                            |

## API-yta (FAS 1)

| Method | Path                                                     | Permission     |
| ------ | -------------------------------------------------------- | -------------- |
| GET    | `/cco/scalp-analysis/patient/:patientId`                 | `scalp.read`   |
| GET    | `/cco/scalp-analysis/sessions/:sessionId`                | `scalp.read`   |
| POST   | `/cco/scalp-analysis/sessions`                           | `scalp.write`  |
| POST   | `/cco/scalp-analysis/sessions/:id/import-report`         | `scalp.write`  |
| POST   | `/cco/scalp-analysis/sessions/:id/import-images`         | `scalp.write`  |
| POST   | `/cco/scalp-analysis/sessions/:id/metrics`               | `scalp.write`  |
| POST   | `/cco/scalp-analysis/sessions/:id/verify`                | `scalp.verify` |
| POST   | `/cco/scalp-analysis/comparisons`                        | `scalp.write`  |
| GET    | `/cco/scalp-analysis/patient/:patientId/patient-view`    | `scalp.read`   |
| GET    | `/cco/scalp-analysis/patient/:patientId/protocol-status` | `scalp.read`   |

## Säkerhet

- Inga patientbilder till extern AI.
- Original Aisia-PDF oförändrad i storage.
- Svensk vy = metadata-lager ovanpå original.
- All läs/skriv auditloggas.
- RBAC: `scalp.read`, `scalp.write`, `scalp.verify`.

## FAS 2 förberedelse (ej implementerad)

Undersök på klinik-workstation:

- Aisia export folder path (Windows/Android)
- PDF/bild filnamnskonvention
- Lokal SQLite/DB
- Network traffic vid export
- CSV eller JSON metrics export

---

_Relaterat: `AISIA-DS3-FEATURE-EXTRACTION-MATRIX.md`, `docs/schema/cco-scalp-analysis.schema.md`_
