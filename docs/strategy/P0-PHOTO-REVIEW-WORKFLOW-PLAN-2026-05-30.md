# P0 Photo Review Workflow — Plan

_Genererad: 2026-05-30_

## Scope

|                   |                                                                        |
| ----------------- | ---------------------------------------------------------------------- |
| **Mål**           | Granska och besluta om 861 migrerade bilder i `NEEDS_REVIEW`           |
| **Patienter**     | 150 (av 170 high-confidence importerade)                               |
| **Kategori idag** | 861 × `photo_during` (klassificerade vid import)                       |
| **Out of scope**  | Kamera/Aisia-spåret, medium/low Drive-mapping import, full prod-import |

**Guardrails (oförändrade):**

- Ingen mass-approval utan explicit owner-beslut
- Ingen bild blir `VISIBLE_ON_PATIENT_CARD` utan high confidence **eller** manuell review
- Inga Drive-länkar som slutlösning
- Audit på varje beslut

---

## Nuvarande läge

### Prod-data (efter high-confidence cutover + Fas B)

| Metric                 | Värde              |
| ---------------------- | ------------------ |
| Totalt assets          | 1216               |
| VISIBLE (journal/form) | 324                |
| NEEDS_REVIEW           | 886                |
| Photos i review        | **861**            |
| Photos VISIBLE         | **0**              |
| DUPLICATE kvar         | **0** (Fas B klar) |
| LINK_ONLY / FAILED     | 0 / 0              |

### Befintlig infrastruktur att återanvända

| Komponent      | Fil                                   | Roll                                                                  |
| -------------- | ------------------------------------- | --------------------------------------------------------------------- |
| Asset store    | `src/ops/ccoPatientAssetStore.js`     | Status `NEEDS_REVIEW` → `VERIFIED_IN_CCO` → `VISIBLE_ON_PATIENT_CARD` |
| Review queue   | `src/ops/ccoAssetReviewQueueStore.js` | Per-asset kö med reason/decision-vocab                                |
| Classifier     | `src/ops/ccoAssetImportPipeline.js`   | `classify()` → category + confidence + reason                         |
| Secure storage | `src/ops/ccoSecureStorageProvider.js` | Thumbnail/content via `storageKey`                                    |
| Audit          | `src/security/ccoAuditLog.js`         | `asset.review_resolved`, `asset.status_changed`                       |

Review queue reason-vocab (befintlig): `ambiguous_patient | no_patient_match | duplicate_candidate | low_confidence | unknown_format`

Decision-vocab (befintlig): `approve | reject | reassign | mark_duplicate`

---

## Målbild — Photo Review Queue

### UX-flöde (per patient)

```
Patientlista (150 st, sorterad på antal bilder i review)
  └─ Patientkort: "6 bilder väntar granskning"
       └─ Grid med thumbnails (lazy-load från CCO storage)
            ├─ Metadata: filnamn, datum, mimeType, fileSize, checksum (trunc)
            ├─ Föreslagen category: photo_before | photo_during | photo_after
            ├─ Confidence + reason (från classify + import-metadata)
            └─ Actions: [Approve] [Reject] [Reassign category] [Mark duplicate]
```

### API (föreslagen)

| Endpoint                                          | Metod | Beskrivning                                                 |
| ------------------------------------------------- | ----- | ----------------------------------------------------------- |
| `/api/cco/photo-review/summary`                   | GET   | Aggregering: patienter, antal per status, äldsta import     |
| `/api/cco/photo-review/patients`                  | GET   | Paginerad lista med `{ patientId, pendingCount, oldestAt }` |
| `/api/cco/photo-review/patients/:patientId`       | GET   | Alla NEEDS_REVIEW photos för patient + classify-förslag     |
| `/api/cco/photo-review/assets/:assetId/thumbnail` | GET   | Stream thumbnail/content från CCO storage (auth)            |
| `/api/cco/photo-review/assets/:assetId/decide`    | POST  | `{ decision, category?, reason }` — en asset i taget        |
| `/api/cco/photo-review/assets/:assetId/reassign`  | POST  | Byt category utan approve                                   |

**Ingen bulk-endpoint** i Fas 1 — varje beslut audit-loggas individuellt.

### Beslut → status

| Action                                         | Resultat                                                       | Audit                                            |
| ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| **Approve** (high confidence eller manuell OK) | `NEEDS_REVIEW` → `VERIFIED_IN_CCO` → `VISIBLE_ON_PATIENT_CARD` | `asset.review_resolved` + `asset.status_changed` |
| **Reject**                                     | `NEEDS_REVIEW` → `REJECTED`                                    | `asset.review_resolved`                          |
| **Reassign category**                          | Uppdatera `category`, stanna i `NEEDS_REVIEW`                  | `asset.category_reassigned`                      |
| **Mark duplicate**                             | `NEEDS_REVIEW` → `REJECTED` (om checksum redan aktiv)          | `asset.review_resolved`                          |

### Category-förslag (befintlig classify)

Regler från `ccoAssetImportPipeline.js`:

- Filnamn/folder-heuristik → `photo_before | photo_during | photo_after`
- Confidence: `high` (≥0.8), `medium` (0.5–0.8), `low` (<0.5)
- Alla importerade foton ligger i `NEEDS_REVIEW` oavsett confidence (migration policy)

UI ska visa:

```json
{
  "suggestedCategory": "photo_during",
  "confidence": "medium",
  "reason": "folder_or_filename_heuristic",
  "requiresManualReview": true
}
```

---

## Implementation — faser

### Fas 1: Read-only review UI (ingen statusändring)

- [ ] API: summary + patients + patient detail
- [ ] Thumbnail proxy från CCO storage
- [ ] Gruppering per patient (150 patienter, snitt 5.7 bilder/patient)
- [ ] Visa classify-förslag + confidence
- [ ] Ingen write — validera UX med owner

### Fas 2: Single-asset decisions

- [ ] `decide`-endpoint med audit
- [ ] Enkel approve/reject/reassign per bild
- [ ] Bekräftelsedialog — ingen mass-select
- [ ] Efter approve: verifiera att bild syns på patientkort via `listAssetsForPatient`

### Fas 3: Review queue integration

- [ ] Synka befintliga NEEDS_REVIEW photos till `cco-asset-review-queue.json` med reason `low_confidence`
- [ ] `resolveItem()` kopplar till asset store transition
- [ ] Dashboard: progress `{ reviewed: N, pending: 861-N }`

### Fas 4 (kräver owner-GO): Batch helpers

- [ ] "Approve all high-confidence for this patient" — **BLOCKERAD** tills explicit photo mass-approval GO
- [ ] Export CSV för extern granskning

---

## Data modell — review item (utökning)

Befintlig queue-item + photo-specifika fält:

```json
{
  "id": "uuid",
  "assetId": "uuid",
  "reason": "low_confidence",
  "suggestedPatientId": "cliento_…",
  "confidence": "medium",
  "photoReview": {
    "suggestedCategory": "photo_during",
    "classificationReason": "folder_or_filename_heuristic",
    "thumbnailKey": null,
    "storageKey": "2026/05/…/….jpg",
    "originalFileName": "IMG_0001.JPG",
    "documentDate": "2026-05-07T09:53:54.000Z"
  },
  "decision": null,
  "reviewedBy": null,
  "reviewedAt": null
}
```

---

## Sortering & prioritet (bilder)

| Prioritet | Kriterium                                                 |
| --------- | --------------------------------------------------------- |
| 1         | Patienter med journal/form redan VISIBLE (underlag finns) |
| 2         | Fler bilder i review (max 8/patient)                      |
| 3         | Nyare `documentDate`                                      |
| 4         | Medium confidence före low                                |

---

## Medium/Low mapping — review-prioritering (ej import)

**849 review-needed mappings** — endast prioritering, ingen import.

| Bucket                  | Antal | Kriterium                                               |
| ----------------------- | ----: | ------------------------------------------------------- |
| **likely_approve**      |     2 | medium + dateCorrelated + patientId valid + score ≥0.65 |
| **needs_manual_check**  |   593 | medium + folder_name_overlap, ej dateCorrelated         |
| **low_confidence_hold** |   254 | low confidence eller score <0.55                        |

| Confidence |                      Antal |
| ---------- | -------------------------: |
| medium     |                        595 |
| low        |                        254 |
| high       | 0 (alla redan importerade) |

### Prioriteringsfaktorer (rankning inom bucket)

1. **patientId validation** — måste finnas i CCO master (`cco-customers.json`)
2. **dateCorrelated** — dag-mapp matchar patientdatum
3. **fileCount** — fler filer = högre värde att granska manuellt
4. **name collision** — `folder_name_overlap` → needs_manual_check
5. **score** — 0.75 > 0.667 > 0.5 > 0.25

### Rekommenderad ordning för manuell mapping-review

1. `likely_approve` (2 st) — snabbast att verifiera manuellt
2. `needs_manual_check` med `fileCount ≥ 5` och valid patientId
3. `needs_manual_check` med `fileCount 1–4`
4. `low_confidence_hold` — sist, kräver separat owner-beslut innan import

**Medium/low import är fortfarande BLOCKERAD.** Denna prioritering är endast för att förbereda manuell granskning.

---

## Acceptanskriterier (Photo Review Workflow)

- [ ] 861 bilder grupperade per patient i UI
- [ ] Thumbnails laddas från CCO storage (ingen Drive)
- [ ] Category-förslag visas med confidence + reason
- [ ] Manuell approve/reject/reassign per bild
- [ ] Audit loggad per beslut
- [ ] 0 bilder VISIBLE utan beslut
- [ ] Ingen mass-approval i Fas 1–3
- [ ] Progress-tracker: `{ pending, approved, rejected }`

---

## Relaterade rapporter

- `docs/strategy/P0M5-METADATA-REMEDIATION-VERIFICATION-2026-05-30.md` — Fas B klar, 0 DUPLICATE
- High-confidence cutover: batch 1–5, 170/170 patienter
- Full prod-import: **INTE godkänd**
