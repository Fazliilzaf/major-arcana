# P0 Photo Review Fas 2 — Single-Decision Pilot

_Genererad: 2026-05-30T22:32:05.940Z_

## Godkännanden

- P0.M6 High-Confidence Final ✓
- Photo Review Fas 1 read-only ✓
- Photo Review live-check ✓
- **GO:** Fas 2 single-asset decisions (pilot)

## Guardrails (aktiva)

| Regel                       | Status         |
| --------------------------- | -------------- |
| Single-image decisions only | ✓              |
| Max 5 pilot-patienter       | ✓              |
| Max 20 beslut               | ✓              |
| Mass-approval               | STOPP          |
| Medium/low-import (849)     | STOPP          |
| Full prod-import            | STOPP          |
| Drive-länkar i UI/API       | ✓ 0            |
| Patientdata i GitHub        | ✓ sandbox only |
| Prod write hosts            | BLOCKERAD      |

## Pilot scope

| Regel                              | Värde                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Patienter                          | 5                                                                                                     |
| Max beslut                         | 20                                                                                                    |
| Bilder i kohort (≤20)              | 20                                                                                                    |
| Prod baseline NEEDS_REVIEW (foton) | 861                                                                                                   |
| Pilot baseline NEEDS_REVIEW        | 35                                                                                                    |
| Sandbox                            | `/Users/fazlikrasniqi/Code/major-arcana/data/sandbox-photo-review-fas2-pilot/cco-patient-assets.json` |
| Dry-run                            | nej                                                                                                   |

## Pilot resultat

| Metric                                   | Antal |
| ---------------------------------------- | ----: |
| Reviewed images                          |     4 |
| Approved                                 |     2 |
| Rejected                                 |     1 |
| Reassigned                               |     2 |
| VISIBLE after review                     |     2 |
| Remaining NEEDS_REVIEW (pilot cohort)    |    32 |
| Remaining NEEDS_REVIEW (all prod photos) |   858 |

## Audit status

| Check                                  | Status |
| -------------------------------------- | ------ |
| Beslut loggade (photo_review.decision) | 4      |
| Alla audit-rader kompletta             | ✓      |
| Saknade audit-fält                     | 0      |
| Drive-länkar i audit                   | 0      |

### Audit sample

- **reassign** `9bd87401…` reviewer=pilot-runner · NEEDS_REVIEW→NEEDS_REVIEW · photo_during→photo_before · "Pilot: omkategori till photo_before"
- **approve** `8f88bcaa…` reviewer=pilot-runner · NEEDS_REVIEW→VISIBLE_ON_PATIENT_CARD · photo_during→photo_during · "Pilot: manuellt godkänd före-bild"
- **reject** `ddef198e…` reviewer=pilot-runner · NEEDS_REVIEW→REJECTED · photo_during→photo_during · "Pilot: avvisad dubblett/kvalitet"
- **approve** `8be6a436…` reviewer=pilot-runner · NEEDS_REVIEW→VISIBLE_ON_PATIENT_CARD · photo_after→photo_after · "Pilot: omkategori + godkänn efter-bild (reassign+approve)"

## Storage status (godkända bilder)

| assetId     | OK  | storageKey | checksum | fileSize | mimeType | patientId | category |
| ----------- | --- | ---------- | -------- | -------- | -------- | --------- | -------- |
| `8f88bcaa…` | ✓   | ✓          | ✓        | ✓        | ✓        | ✓         | ✓        |
| `8be6a436…` | ✓   | ✓          | ✓        | ✓        | ✓        | ✓         | ✓        |

## listAssetsForPatient (pilot)

| patientId (suffix) | totalt | visible photos | NEEDS_REVIEW photos |
| ------------------ | -----: | -------------: | ------------------: |
| `31c5ce215e61`     |      8 |              0 |                   8 |
| `4afa8310c803`     |      8 |              0 |                   7 |
| `ca6ab17fb3bc`     |      8 |              0 |                   7 |
| `b5a4fc308473`     |      8 |              0 |                   7 |
| `3162863fdd53`     |      8 |              2 |                   3 |

## UI status

| Check                                | Status                |
| ------------------------------------ | --------------------- |
| Single-decision knappar (ingen bulk) | ✓ implementerad       |
| Reason obligatorisk                  | ✓                     |
| Pilot-patientfilter                  | ✓                     |
| Preview via CCO storage              | ✓                     |
| Browser-pilot i staging              | ⏳ manuell check kvar |

**Kända UI-punkter:** Reviewer-fält sparas i localStorage (`x-cco-user`). Bekräftelsedialog före approve/reject. Session-stats via `window.__ARCANA_PHOTO_REVIEW_SESSION_STATS__`.

## Fel

Inga fel i sandbox pilot-runner.

## Aktivering (dev/staging only)

```bash
ENABLE_PHOTO_REVIEW_WRITE=true
PHOTO_REVIEW_PILOT_MAX_DECISIONS=20
# Pilot-patienter: data/p0-photo-review-fas2-pilot-patients.json
```

Öppna `/photo-review.html` i staging. Prod hosts blockeras automatiskt.

## Rekommendation

GO wider manual review in staging (150 patients / 861 photos) after browser pilot confirms UI. Keep max 20 decisions cap until staging sign-off.

Efter staging browser-pilot: utöka till fler patienter utan att höja beslutstak förrän operatör bekräftar workflow. Medium/low-import och full prod-import förblir STOPP.
