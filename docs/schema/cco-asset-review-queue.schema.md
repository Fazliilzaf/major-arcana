# `cco-asset-review-queue` — kanoniskt schema (v1.0.0)

> **Owner-spec:** `.cursor/rules/cco-no-drive-links-import-only.mdc`
> **Modul:** `src/ops/ccoAssetReviewQueueStore.js`
> **Persistens:** `data/cco-asset-review-queue.json` (gitignored)
>
> Per-asset review-queue. När import-pipeline inte kan auto-koppla en
> fil till en patient (eller hittar dubblettkandidat / låg confidence /
> okänt format) hamnar den här. **INGEN auto-merge** — staff måste fatta
> beslut.

---

## 1. Fields

| # | Field | Type | Required | Beskrivning |
|--:|---|---|:-:|---|
| 1 | `id` | string (UUID v4) | Y | Review-item-id (primary key) |
| 2 | `assetId` | string | Y | FK till `cco-patient-assets.id` |
| 3 | `reason` | enum | Y | Varför review krävs (se §2) |
| 4 | `suggestedPatientId` | string \| null | N | Pipeline-förslag på patient |
| 5 | `confidence` | enum \| null | N | `high`, `medium`, `low` |
| 6 | `reviewedBy` | string \| null | N (Y vid resolve) | Staff-id vid resolve |
| 7 | `reviewedAt` | string (ISO datetime) \| null | N (Y vid resolve) | När resolve hände |
| 8 | `decision` | enum \| null | N (Y vid resolve) | Beslut (se §2) |

> `createdAt` och `updatedAt` finns även i lagrad form men räknas som
> interna fält, inte del av det publika schemat.

---

## 2. Enums

### `reason`

| Värde | Betydelse |
|---|---|
| `ambiguous_patient` | Flera patient-kandidater hittade (drive-folder-match m.m.) |
| `no_patient_match` | Ingen patient-koppling hittad alls |
| `duplicate_candidate` | Checksum-likhet med befintligt asset — verifiera |
| `low_confidence` | Patient-link med confidence `low` |
| `unknown_format` | Mime/extension-typ klassificeraren inte kände igen |

### `decision`

| Värde | Betydelse | Konsekvens |
|---|---|---|
| `approve` | Bekräfta pipeline-förslag | Asset behåller `suggestedPatientId`, status -> `VERIFIED_IN_CCO` |
| `reject` | Förkasta asset | Asset status -> `REJECTED` (soft-delete) |
| `reassign` | Manuell omklassning till annan patient | Kräver `suggestedPatientId` i body; asset uppdateras |
| `mark_duplicate` | Det är en känd dubblett | Asset status -> `DUPLICATE` |

---

## 3. Beslutsregler

| Decision | Förutsättningar | Effekt på asset |
|---|---|---|
| `approve` | Asset **MÅSTE ha `patientId`** satt (antingen ursprunglig eller `suggestedPatientId` i review-item). | `transitionStatus(asset, VERIFIED_IN_CCO)` |
| `reassign` | Body måste innehålla giltigt `suggestedPatientId`. | `linkAssetToPatient(asset, newId)` + `transitionStatus(asset, VERIFIED_IN_CCO)` |
| `reject` | Inga ytterligare krav. | `transitionStatus(asset, REJECTED)` |
| `mark_duplicate` | Inga ytterligare krav. | `transitionStatus(asset, DUPLICATE)` |

> `resolveItem()` validerar `decision` mot enum-vocab och kräver
> `reviewedBy`. Re-resolve av redan löst item kastar `409 Conflict`.

---

## 4. Audit-events

| Event | Trigger | Detail-payload |
|---|---|---|
| `asset.review_enqueued` | `enqueue()` | `assetId`, `reason`, `confidence` |
| `asset.review_resolved` | `resolveItem()` | `assetId`, `reason`, `decision` |

Båda emittas via `ccoAuditLog`. **Ingen PII** i payloads.

---

## 5. Exempel

Se `examples/cco-asset-review-queue.example.json`.
