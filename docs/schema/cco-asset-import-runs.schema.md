# `cco-asset-import-runs` — kanoniskt schema (v1.0.0)

> **Owner-spec:** `.cursor/rules/cco-no-drive-links-import-only.mdc`
> **Modul:** `src/ops/ccoAssetImportRunStore.js`
> **Persistens:** `data/cco-asset-import-runs.json` (gitignored)
>
> Run-historik för import-batchar från Drive / Meridiq / old_cco till
> CCO secure storage. Varje körning får ett unikt run-id som senare
> `ccoPatientAssetStore` refererar via `importRunId` (foreign key).

---

## 1. Fields

| # | Field | Type | Required | Beskrivning |
|--:|---|---|:-:|---|
| 1 | `id` | string (UUID v4) | Y | Run-id (primary key) |
| 2 | `sourceSystem` | enum | Y | Källsystem (se §2) |
| 3 | `mode` | enum | Y | Run-mode (se §2) |
| 4 | `startedAt` | string (ISO datetime) | Y (auto) | När run skapades |
| 5 | `finishedAt` | string (ISO datetime) \| null | N | Sätts vid `finishRun()` |
| 6 | `totalDiscovered` | number | Y (auto) | Antal records hittade av discover-steget |
| 7 | `totalImported` | number | Y (auto) | Antal records som blev `IMPORTED_TO_CCO` eller högre |
| 8 | `totalVerified` | number | Y (auto) | Antal records som blev `VERIFIED_IN_CCO` eller högre |
| 9 | `totalNeedsReview` | number | Y (auto) | Antal records som hamnat i review-queue |
| 10 | `totalFailed` | number | Y (auto) | Antal records som blev `FAILED_IMPORT` |
| 11 | `totalLinkOnlyBlockers` | number | Y (auto) | **P0-blocker-räknare** — antal records utan binär |
| 12 | `createdBy` | string | Y | user-id eller `'system'` |

---

## 2. Enums

### `mode`

| Värde | Betydelse |
|---|---|
| `full` | Full re-discovery + import av allt i källan |
| `incremental` | Bara nytillkomna sedan föregående run |
| `review_resolve` | Återkör enbart records som tidigare hamnat i review-queue |

### `sourceSystem`

| Värde | Betydelse |
|---|---|
| `drive` | Google Drive (service-account) |
| `meridiq` | Meridiq-export (CSV/SQL-dump) |
| `old_cco` | Tidigare CCO-instans (`old_cco_index.json`) |

---

## 3. Counter-semantik

Counters är **monotont icke-minskande** under run:ets livstid. De
uppdateras via `incrementCounter(runId, name, delta)`. När run stängs
med `finishRun(runId)` blir countersen frysta — vidare
`incrementCounter`-anrop kastar `409 Conflict`.

| Counter | Semantik |
|---|---|
| `totalDiscovered` | +1 per record som passerar discover-steget |
| `totalImported` | +1 per record som lyckades nå minst `IMPORTED_TO_CCO` |
| `totalVerified` | +1 per record som passerar checksum-verify (`VERIFIED_IN_CCO`) |
| `totalNeedsReview` | +1 per record som lagts i review-queue |
| `totalFailed` | +1 per record som blivit `FAILED_IMPORT` |
| `totalLinkOnlyBlockers` | +1 per record som blivit `LINK_ONLY_BLOCKER` (saknad binär) |

> **Invariant:** `totalImported >= totalVerified`. Ett record kan vara
> importerat men inte verifierat (verify-fel mellan stegen). Ett record
> kan inte vara verifierat utan att vara importerat.

---

## 4. Audit-events

| Event | Trigger | Detail-payload |
|---|---|---|
| `asset.import_run_started` | `startRun()` | `sourceSystem`, `mode`, `createdBy` |
| `asset.import_run_finished` | `finishRun()` | alla 6 counters + `sourceSystem`, `mode` |

Båda emittas via `ccoAuditLog`. **Ingen PII** i payloads — bara
counts, IDs och enum-värden.

---

## 5. Exempel

Se `examples/cco-asset-import-runs.example.json`.
