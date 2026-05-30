# P0 Photo Review Fas 2 — Staging Manual Review Pilot

_Genererad: 2026-05-30T22:41:09.055Z_

## Godkännanden

- Fas 2 sandbox pilot ✓
- **GO:** staging/manual review pilot (inte full prod)

## Guardrails

| Regel                                      | Status |
| ------------------------------------------ | ------ |
| ENABLE_PHOTO_REVIEW_WRITE staging/dev only | ✓      |
| Prod primary hosts blocked                 | ✓      |
| 5 pilot-patienter                          | ✓      |
| Max 20 beslut                              | ✓      |
| Single-image only                          | ✓      |
| Mass-approval                              | STOPP  |
| Medium/low-import                          | STOPP  |
| Full prod-import                           | STOPP  |

## Staging aktivering (Render)

Service: `https://arcana-staging.onrender.com` (srv-d6gd8i94tr6s73dbb2ug)

```bash
ENABLE_PHOTO_REVIEW_WRITE=true
PHOTO_REVIEW_PILOT_MAX_DECISIONS=20
PHOTO_REVIEW_PILOT_MAX_PATIENTS=5
# PHOTO_REVIEW_PILOT_PATIENT_IDS optional — default manifest
PUBLIC_BASE_URL=https://arcana-staging.onrender.com
```

Deploy senaste main till staging. Öppna `/photo-review.html` som STAFF.

## Config verify

| Check                         | Resultat             |
| ----------------------------- | -------------------- |
| Write på staging host         | ✓                    |
| Write blockerad på prod (.se) | ✓                    |
| API summary writeEnabled      | ✓                    |
| API phase                     | fas2_single_decision |

## Pilot resultat (staging-isolated copy)

| Metric                           | Antal |
| -------------------------------- | ----: |
| Bilder granskade                 |     8 |
| Approved                         |     3 |
| Rejected                         |     2 |
| Reassigned                       |     4 |
| VISIBLE efter review             |     3 |
| NEEDS_REVIEW kvar (pilot cohort) |    30 |
| NEEDS_REVIEW kvar (alla foton)   |   856 |

## Audit status

| Check          | Status |
| -------------- | ------ |
| Beslut loggade | 8      |
| Alla kompletta | ✓      |
| Drive-länkar   | 0      |

### Sample

- **reassign** photo_during→photo_before · NEEDS_REVIEW→NEEDS_REVIEW · "Staging: omkategori före-bild"
- **approve** photo_during→photo_during · NEEDS_REVIEW→VISIBLE_ON_PATIENT_CARD · "Staging: operatör godkänner bild"
- **reject** photo_during→photo_during · NEEDS_REVIEW→REJECTED · "Staging: operatör avvisar bild"
- **reassign** photo_during→photo_during · NEEDS_REVIEW→NEEDS_REVIEW · "Staging: omkategori under behandling"
- **approve** photo_during→photo_during · NEEDS_REVIEW→VISIBLE_ON_PATIENT_CARD · "Staging: godkänn efter omkategori"
- **approve** photo_after→photo_after · NEEDS_REVIEW→VISIBLE_ON_PATIENT_CARD · "Staging: byt till efter + godkänn (reassign+approve)"
- **reject** photo_during→photo_during · NEEDS_REVIEW→REJECTED · "Staging: avvisa otydlig bild"
- **reassign** photo_during→photo_before · NEEDS_REVIEW→NEEDS_REVIEW · "Staging: omkategori väntar review"

## Storage status (godkända)

| asset       | OK  | storageKey | checksum | fileSize | mimeType |
| ----------- | --- | ---------- | -------- | -------- | -------- |
| `8f88bcaa…` | ✓   | ✓          | ✓        | ✓        | ✓        |
| `af092ea9…` | ✓   | ✓          | ✓        | ✓        | ✓        |
| `748000fc…` | ✓   | ✓          | ✓        | ✓        | ✓        |

## listAssetsForPatient

| patient (suffix) | totalt | visible | NEEDS_REVIEW |
| ---------------- | -----: | ------: | -----------: |
| `31c5ce215e61`   |      8 |       0 |            8 |
| `4afa8310c803`   |      8 |       0 |            6 |
| `ca6ab17fb3bc`   |      8 |       0 |            7 |
| `b5a4fc308473`   |      8 |       0 |            7 |
| `3162863fdd53`   |      8 |       3 |            2 |

## UI issues

- **browser-staging-pending** (info): Deploy latest main to arcana-staging.onrender.com + set ENABLE_PHOTO_REVIEW_WRITE=true in Render UI
- **reviewer-localstorage** (low): Reviewer identity via localStorage → x-cco-user; consider staff session integration later
- **no-bulk** (ok): No bulk toolbar — verified in UI code

## Fel

Inga fel.

## Operatörsflöde redo för bredare manuell review?

**Ja** — efter deploy + browser-check på arcana-staging.onrender.com. Expandera gradvis (fler patienter), behåll single-decision och audit. **Ej** full prod write.

GO for wider manual review in staging (raise patient scope gradually; keep single-decision + audit). Not GO for full prod write.
