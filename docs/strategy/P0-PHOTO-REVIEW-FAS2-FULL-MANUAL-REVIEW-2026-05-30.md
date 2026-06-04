# P0 Photo Review Fas 2 — Full Manual Review (High-Confidence Cohort)

_Genererad: 2026-05-30T22:49:57.477Z_

## Status

- **GO:** Full manuell Photo Review Fas 2 (150 patienter / 861 bilder)
- **Kö genomförd:** ⏳ Pågår
- **Mass-approval:** STOPP
- **AI autoapproval:** STOPP
- **Medium/low-import:** STOPP
- **Full prod-import:** STOPP (separat beslut)
- **Drive-länkar:** STOPP
- **Patientdata i GitHub:** STOPP

## Regler (Fas 2 full manual)

1. `ENABLE_PHOTO_REVIEW_WRITE=true` endast för Photo Review Fas 2
2. Hela high-confidence-kön — inte pilot-cap (5 patienter / 20 beslut)
3. Single-asset: approve · reject · reassign category
4. Varje beslut auditloggas (`photo_review.decision` + reason)
5. Reason krävs (min 3 tecken)

## STOPP-villkor

Avbryt omedelbart om:

- audit misslyckas
- storageKey/checksum saknas vid approve
- patientId saknas
- bild saknar preview/storage
- Drive-länk dyker upp
- bulk/massapproval triggas
- patientdata riskerar GitHub

## Rapportering (var 100:e beslut)

| Metric            | Beskrivning                                            |
| ----------------- | ------------------------------------------------------ |
| Granskade         | Totalt antal beslut (audit)                            |
| Approved          | Godkända → VISIBLE_ON_PATIENT_CARD                     |
| Rejected          | Avvisade                                               |
| Reassigned        | Omkategoriserade (NEEDS_REVIEW kvar om ej alsoApprove) |
| NEEDS_REVIEW kvar | Kvar i kö                                              |
| VISIBLE           | Foto synliga efter review                              |
| Audit status      | Antal `photo_review.decision`-rader                    |

Milestone i browser: `window.__ARCANA_PHOTO_REVIEW_MILESTONES__`

## Aktivering

```bash
ENABLE_PHOTO_REVIEW_WRITE=true
PHOTO_REVIEW_FULL_COHORT=true
# Staging/dev — prod primary hosts blockeras automatiskt
```

**Deploy (2026-05-30):**

- Branch: `compliance/pipedrive-pii-purge` (commits `78ec5a86` + `2a0bbf77`)
- Render service: `arcana` → **https://major-arcana-frankfurt.onrender.com**
- `arcana-staging.onrender.com` är **avvecklad** (`x-render-routing: no-server`)
- Env på Render: `ENABLE_PHOTO_REVIEW_WRITE=true`, `PHOTO_REVIEW_FULL_COHORT=true`, `PUBLIC_BASE_URL=https://major-arcana-frankfurt.onrender.com`

**Data-krav (staging):** Synka till `/var/data` på Render:

- `cco-patient-assets.json` (+ import-runs, review-queue, audit)
- `ARCANA_CCO_SECURE_STORAGE_ROOT` → bildbinärer (~2 GB)

**Lokal review (prod-data, write på):** `http://localhost:3110/photo-review.html` med:

```bash
ARCANA_STATE_ROOT="~/Library/Mobile Documents/.../Migration-data/cco-prod"
ARCANA_CCO_SECURE_STORAGE_ROOT="~/Library/Mobile Documents/.../cco-secure-storage"
ENABLE_PHOTO_REVIEW_WRITE=true PHOTO_REVIEW_FULL_COHORT=true PORT=3110
```

UI: `/photo-review.html`

## Progress

| Metric                | Värde |
| --------------------- | ----: |
| NEEDS_REVIEW kvar     |   861 |
| Patienter kvar        |   150 |
| Beslut totalt (audit) |     0 |
| Approved              |     0 |
| Rejected              |     0 |
| Reassigned            |     0 |
| VISIBLE photos (prod) |     0 |

## Storage / audit

| Check                             | Status |
| --------------------------------- | ------ |
| Pending utan storageKey           | 0      |
| Pending utan checksum             | 0      |
| Audit-rader photo_review.decision | 0      |

## UI

- Fokusvy: en bild i taget
- Snabb-godkänn: Före [1] / Under [2] / Efter [3]
- Avvisa [R] · Omkategori [C] · Navigera [N/P] eller pilar
- Progress-bar + milestone-log i `window.__ARCANA_PHOTO_REVIEW_MILESTONES__`
- Kör `node scripts/photo-review-fas2-progress-report.js --final` när kön är tom

## Rekommendation

**Startad** — aktivera write i staging/dev och börja granska via `/photo-review.html`.
