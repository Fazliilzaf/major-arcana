# CCO Scalp Analysis — Data Model

**Schema version:** 1.0.0  
**Store:** `src/ops/ccoScalpAnalysisStore.js`  
**Persistence:** `data/cco-scalp-analysis.json` (gitignored)

---

## scalp_analysis_sessions

| Field             | Type         | Required | Notes                                                               |
| ----------------- | ------------ | -------- | ------------------------------------------------------------------- |
| `id`              | UUID         | Y        | PK                                                                  |
| `tenantId`        | string       | Y        | Multi-tenant                                                        |
| `patientId`       | string       | Y        | CCO master patient                                                  |
| `encounterId`     | string       | null     | Koppling till behandlingstillfälle                                  |
| `source`          | enum         | Y        | `aisia_ds3` \| `manual_upload` \| `cco_camera`                      |
| `sessionType`     | enum         | Y        | `consultation` \| `pre_op` \| `post_op` \| `follow_up`              |
| `date`            | ISO date     | Y        | Sessiondatum                                                        |
| `operatorId`      | string       | null     | Vem körde Aisia/import                                              |
| `deviceId`        | string       | null     | DS-3 enhets-id om känt                                              |
| `softwareVersion` | string       | null     | Aisia app-version                                                   |
| `reportAssetId`   | string       | null     | FK → `patient_assets.id`                                            |
| `verifiedBy`      | string       | null     | userId                                                              |
| `verifiedAt`      | ISO datetime | null     |                                                                     |
| `clinicianNotes`  | string       | null     | Fri kommentar                                                       |
| `status`          | enum         | Y        | `draft` \| `imported` \| `verified` \| `needs_review` \| `rejected` |
| `createdAt`       | ISO datetime | Y        |                                                                     |
| `updatedAt`       | ISO datetime | Y        |                                                                     |

## scalp_analysis_images

| Field              | Type         | Required | Notes                                           |
| ------------------ | ------------ | -------- | ----------------------------------------------- |
| `id`               | UUID         | Y        | PK                                              |
| `sessionId`        | UUID         | Y        | FK                                              |
| `patientId`        | string       | Y        | Denormaliserad för index                        |
| `encounterId`      | string       | null     |                                                 |
| `zone`             | enum         | Y        | Se capture protocol                             |
| `angle`            | string       | null     | `front` \| `left` \| `right` \| `top` \| `back` |
| `magnification`    | enum         | null     | `10x` \| `50x` \| `100x` \| `200x`              |
| `spectrum`         | enum         | null     | `white` \| `cross_polarized` \| `uv`            |
| `assetId`          | string       | Y        | FK → `patient_assets.id`                        |
| `thumbnailAssetId` | string       | null     | Optional separate thumb                         |
| `captureTime`      | ISO datetime | null     |                                                 |
| `qualityScore`     | number       | null     | 0–100                                           |
| `notes`            | string       | null     |                                                 |
| `verified`         | boolean      | Y        | Default false                                   |
| `createdAt`        | ISO datetime | Y        |                                                 |

## scalp_analysis_metrics

| Field        | Type          | Required | Notes                               |
| ------------ | ------------- | -------- | ----------------------------------- |
| `id`         | UUID          | Y        | PK                                  |
| `sessionId`  | UUID          | Y        | FK                                  |
| `imageId`    | UUID          | null     | Optional link to specific image     |
| `metricType` | string        | Y        | Se metric registry i store          |
| `value`      | string/number | Y        | Raw value                           |
| `unit`       | string        | null     | t.ex. `count`, `mm`, `level`        |
| `confidence` | number        | null     | 0–1                                 |
| `source`     | enum          | Y        | `aisia_ds3` \| `manual` \| `cco_ai` |
| `verified`   | boolean       | Y        |                                     |
| `verifiedBy` | string        | null     |                                     |
| `verifiedAt` | ISO datetime  | null     |                                     |
| `displaySv`  | string        | null     | Cached Swedish label                |

## scalp_comparisons

| Field                 | Type         | Required | Notes                                          |
| --------------------- | ------------ | -------- | ---------------------------------------------- |
| `id`                  | UUID         | Y        | PK                                             |
| `patientId`           | string       | Y        |                                                |
| `baselineSessionId`   | UUID         | Y        | FK                                             |
| `comparisonSessionId` | UUID         | Y        | FK                                             |
| `zone`                | string       | null     | Specifik zon eller null = global               |
| `metricChanges`       | object       | null     | `{ metricType: { baseline, current, delta } }` |
| `imageComparison`     | object       | null     | `{ baselineImageId, currentImageId }`          |
| `clinicianConclusion` | string       | null     |                                                |
| `aiSummary`           | string       | null     | **FAS 4 only** — null i MVP                    |
| `verifiedBy`          | string       | null     |                                                |
| `verifiedAt`          | ISO datetime | null     |                                                |
| `createdAt`           | ISO datetime | Y        |                                                |

## Asset-koppling

| Innehåll                 | `patient_assets.category` | `sourceSystem`           |
| ------------------------ | ------------------------- | ------------------------ |
| Aisia PDF-rapport        | `aisia_report`            | `aisia_ds3` (via upload) |
| Global/consultation foto | `photo_before`            | `upload`                 |
| Intra-op foto            | `photo_during`            | `upload`                 |
| Follow-up foto           | `photo_after`             | `upload`                 |

## Timeline events

| Event type                 | Trigger                                 |
| -------------------------- | --------------------------------------- |
| `scalp_analysis_imported`  | Session skapad + report/images imported |
| `scalp_image_added`        | Image record created                    |
| `scalp_metrics_added`      | Metrics batch added                     |
| `scalp_analysis_verified`  | Session verified                        |
| `scalp_comparison_created` | Comparison record created               |

---

_source: owner spec 2026-05-30 + AISIA-DS3-FEATURE-EXTRACTION-MATRIX.md_
