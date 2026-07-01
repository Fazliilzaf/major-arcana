# `cco-patient-assets` — kanoniskt schema (v1.0.0)

> **Owner-spec:** `.cursor/rules/cco-no-drive-links-import-only.mdc`
> **Modul:** `src/ops/ccoPatientAssetStore.js`
> **Persistens:** `data/cco-patient-assets.json` (gitignored — del av `data/`-regeln)
> **Slutmandat:** `link_only_files = 0` (icke-förhandlingsbart)
>
> Detta är kanonisk metadata-store för **alla** patient-asset-typer:
> journal-PDF, foton (before/during/after), samtycken, signerade avtal,
> hälsodeklarationer, Aisia-rapporter och historiska Meridiq/Drive-dokument.
>
> Drive-länkar är **källa + provenance**, aldrig slut-UI. Slut-UI hämtar
> uteslutande från CCO-secure-storage via `storageKey`.

---

## 1. Fields

|   # | Field                 | Type                      |      Required      | Beskrivning                                                                                                                    | Valid värden                                                                                                      |
| --: | --------------------- | ------------------------- | :----------------: | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
|   1 | `id`                  | string (UUID v4)          |         Y          | Stable asset-id (primary key)                                                                                                  | UUID                                                                                                              |
|   2 | `patientId`           | string                    | Y (vid `addAsset`) | Patient detta asset tillhör. Får vara `'unknown'` vid `LINK_ONLY_BLOCKER`/`NEEDS_REVIEW`. Krävs för `VISIBLE_ON_PATIENT_CARD`. | tenant-scoped patient-id                                                                                          |
|   3 | `encounterId`         | string \| null            |         N          | Encounter/journal-entry-id om kopplad                                                                                          | tenant-scoped encounter-id                                                                                        |
|   4 | `sourceSystem`        | enum                      | Y (vid `addAsset`) | Källsystem                                                                                                                     | `drive`, `meridiq`, `old_cco`, `cco_camera`, `upload`                                                             |
|   5 | `sourceRecordId`      | string \| null            |         N          | ID i källsystem (file-id, drive-id, m.m.)                                                                                      | fritt                                                                                                             |
|   6 | `originalDriveFileId` | string \| null            |         N          | **Provenance** — Drive file-id om kommit från Drive                                                                            | fritt                                                                                                             |
|   7 | `originalDrivePath`   | string \| null            |         N          | **Provenance** — Drive-folder-path                                                                                             | fritt                                                                                                             |
|   8 | `originalFileName`    | string \| null            |         N          | Originalfilnamn                                                                                                                | fritt                                                                                                             |
|   9 | `storageProvider`     | enum \| null              | Y (för verified+)  | Var binären ligger                                                                                                             | `s3`, `local`, `encrypted-fs`                                                                                     |
|  10 | `storageKey`          | string \| null            |  Y (för VISIBLE)   | Nyckel i secure storage                                                                                                        | fritt                                                                                                             |
|  11 | `thumbnailKey`        | string \| null            |         N          | Thumbnail-nyckel om genererad                                                                                                  | fritt                                                                                                             |
|  12 | `checksum`            | string \| null            |  Y (för VISIBLE)   | SHA-256 av binärinnehåll, prefix `sha256:`                                                                                     | `sha256:<hex>`                                                                                                    |
|  13 | `fileSize`            | number (bytes)            |  Y (för VISIBLE)   | Filstorlek i bytes (>0)                                                                                                        | int >= 0                                                                                                          |
|  14 | `mimeType`            | string \| null            |  Y (för VISIBLE)   | MIME-typ                                                                                                                       | t.ex. `application/pdf`, `image/jpeg`                                                                             |
|  15 | `category`            | enum \| null              | Y (vid `addAsset`) | Asset-kategori                                                                                                                 | `journal`, `photo_before`, `photo_during`, `photo_after`, `consent`, `agreement`, `form`, `aisia_report`, `other` |
|  16 | `documentDate`        | string (ISO date) \| null |         N          | Datum på dokument                                                                                                              | `YYYY-MM-DD`                                                                                                      |
|  17 | `importedAt`          | string (ISO datetime)     |      Y (auto)      | När asset hamnade i store                                                                                                      | ISO 8601                                                                                                          |
|  18 | `importedBy`          | string \| null            |         N          | user-id eller `'system'`                                                                                                       | fritt                                                                                                             |
|  19 | `importRunId`         | string \| null            |         N          | FK till `cco-asset-import-runs.id`                                                                                             | UUID                                                                                                              |
|  20 | `confidence`          | enum \| null              |         N          | Patient-link-confidence                                                                                                        | `high`, `medium`, `low`                                                                                           |
|  21 | `status`              | enum                      |      Y (auto)      | State-machine-status (se §2)                                                                                                   | se §2                                                                                                             |
|  22 | `auditRequired`       | boolean                   |         N          | Markeras om audit-review krävs                                                                                                 | true/false                                                                                                        |
|  23 | `isJournalRelevant`   | boolean                   |         N          | Räknas in i journal-coverage                                                                                                   | true/false                                                                                                        |
|  24 | `isPatientVisible`    | boolean                   |         N          | Om patienten själv kan se den i sin portal                                                                                     | true/false                                                                                                        |

> **PII-policy:** Inga patientnamn / personnummer / email / telefon i något fält
> eller i audit-payload. Bara IDs och enum-värden. `originalFileName` kan
> innehålla PII från källan — det är därför fältet ALDRIG loggas i audit.

---

## 2. Status state-machine

```
                          +----------------------+
                          |     DISCOVERED       | (initial)
                          +--+-----+-----+-----+-+
                             |     |     |     |
            +----------------+     |     |     +----------------+
            v                      v     v                      v
      +-----------+         +----------+ +--------------+ +------------------+
      | IMPORTING |         | DUPLICATE| | NEEDS_REVIEW | | LINK_ONLY_BLOCKER|
      +-----+-----+         +----+-----+ +------+-------+ +------+-----------+
            |                    |              |                |
            |                    v              |                |
            |              +----------+         |                |
            |              | REJECTED |<--------+                |
            |              +----------+                          |
            v                                                    v
   +------------------+        +---------------------+    (retry -> DISCOVERED
   | IMPORTED_TO_CCO  |        |  VERIFIED_IN_CCO    |     eller direkt
   +--------+---------+--------+                     |     IMPORTING)
            |                  +---------+-----------+
            |                            |
            v                            v
   +----------------+        +--------------------------+
   | FAILED_IMPORT  |        | VISIBLE_ON_PATIENT_CARD  |
   +--------+-------+        +-----------+--------------+
            |                            |
   (retry -> DISCOVERED /             +--+---+
    IMPORTING)                        v      v
                              +----------+  +--------------+
                              | REJECTED |  | NEEDS_REVIEW |
                              +----------+  +--------------+
```

### Allowed transitions

| From                      | To                        | Notering                                                         |
| ------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `DISCOVERED`              | `IMPORTING`               | Start av download                                                |
| `DISCOVERED`              | `NEEDS_REVIEW`            | Osäker classification eller patient-match vid discover           |
| `DISCOVERED`              | `DUPLICATE`               | Checksum-match med befintligt asset                              |
| `DISCOVERED`              | `FAILED_IMPORT`           | Discover-fel                                                     |
| `DISCOVERED`              | `LINK_ONLY_BLOCKER`       | Ingen binär tillgänglig från källa — **P0-blocker**              |
| `IMPORTING`               | `IMPORTED_TO_CCO`         | Binär kopierad + checksum lagrad                                 |
| `IMPORTING`               | `FAILED_IMPORT`           | Copy- eller checksum-fel                                         |
| `IMPORTED_TO_CCO`         | `VERIFIED_IN_CCO`         | Re-read + checksum-jämförelse OK                                 |
| `IMPORTED_TO_CCO`         | `FAILED_IMPORT`           | Verify-fel                                                       |
| `VERIFIED_IN_CCO`         | `VISIBLE_ON_PATIENT_CARD` | UI-render-verifiering OK + alla VISIBLE-guard-fält finns (se §3) |
| `VERIFIED_IN_CCO`         | `NEEDS_REVIEW`            | Senare upptäckt anomali                                          |
| `VISIBLE_ON_PATIENT_CARD` | `NEEDS_REVIEW`            | Återkalla synlighet vid anomali                                  |
| `VISIBLE_ON_PATIENT_CARD` | `REJECTED`                | Soft-delete från patient-card                                    |
| `NEEDS_REVIEW`            | `VERIFIED_IN_CCO`         | Staff approve via review-queue                                   |
| `NEEDS_REVIEW`            | `REJECTED`                | Staff reject                                                     |
| `NEEDS_REVIEW`            | `DUPLICATE`               | Staff markera dubblett (drive/photo review)                      |
| `DUPLICATE`               | `REJECTED`                | Soft-delete av dubblettposten                                    |
| `REJECTED`                | —                         | **Terminal** (soft-delete, raderas inte fysiskt)                 |
| `FAILED_IMPORT`           | `DISCOVERED`              | Retry                                                            |
| `FAILED_IMPORT`           | `IMPORTING`               | Retry direkt till import                                         |
| `LINK_ONLY_BLOCKER`       | `DISCOVERED`              | Unblock — binär nu tillgänglig                                   |
| `LINK_ONLY_BLOCKER`       | `IMPORTING`               | Unblock + retry direkt                                           |

> Övergångar utöver dessa är **förbjudna** och kastas av
> `transitionStatus()`.

---

## 3. `VISIBLE_ON_PATIENT_CARD` — guard-krav

För att lyfta en asset till `VISIBLE_ON_PATIENT_CARD` krävs **ALLA** följande:

1. `storageKey` (truthy)
2. `checksum` (truthy)
3. `fileSize > 0`
4. `mimeType` (truthy)
5. `patientId` (truthy) **ELLER** review-queue-decision `approve` med
   `suggestedPatientId` satt
6. `status === 'VERIFIED_IN_CCO'` (källstatus)

`markAsVisibleOnPatientCard(assetId, { actor })` kontrollerar dessa
guard-krav och kastar med en lista över saknade fält. Slutmandatet
`link_only_files = 0` förutsätter att inga `LINK_ONLY_BLOCKER`-rader
finns i store vid cutover.

---

## 4. `LINK_ONLY_BLOCKER` — P0-blocker-flagga

En asset i status `LINK_ONLY_BLOCKER` betyder att vi har Drive-länk +
metadata men ingen binär. Per cursor-regeln är detta **alltid en
P0-blocker** för cutover. `stats().linkOnlyBlockerCount` MÅSTE vara `0`
för att Drive-as-source-of-truth ska kunna stängas av.

Operatören löser blockern genom att:

1. Återköra import-pipeline med `mode = 'review_resolve'`, eller
2. Manuellt ladda upp binär via review-queue-flow + transitiona
   `LINK_ONLY_BLOCKER -> IMPORTING -> IMPORTED_TO_CCO -> VERIFIED_IN_CCO`.

---

## 5. Soft-delete vs hard-delete

| Operation                                         | Slutstatus                                             | Tillåten för                                              |
| ------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `softDeleteAsset(id, { reason, actor, target })`  | `REJECTED` (default), `DUPLICATE` eller `NEEDS_REVIEW` | All clinical journalrelevant data — **default**           |
| `hardDeleteAsset(id, { technicalReason, actor })` | (raden raderas)                                        | **Endast** icke-kliniskt-verifierade tekniska fel + audit |

**Hard-delete-guard:** `hardDeleteAsset()` kastar om
`isJournalRelevant === true` och `status in { VERIFIED_IN_CCO,
VISIBLE_ON_PATIENT_CARD }`. För journal-relevant verifierat material
gäller alltid soft-delete — patientjournal-lagstiftningen tillåter
inte hard-delete av kliniskt verifierat innehåll.

Båda operationerna emittar audit-event:

- `asset.status_changed` (via soft-delete -> `transitionStatus`)
- `asset.hard_deleted` (med fullt audit-record inklusive `technicalReason`)

---

## 6. Exempel-skiftbild (anonymiserad)

```json
{
  "id": "00000000-0000-4000-a000-000000000001",
  "patientId": "anon-patient-001",
  "encounterId": "anon-enc-001",
  "sourceSystem": "old_cco",
  "sourceRecordId": "legacy-asset-xyz",
  "originalDriveFileId": "anon-drive-id",
  "originalDrivePath": "Anonymized/Treatment/Folder",
  "originalFileName": "example-journal.pdf",
  "storageProvider": "local",
  "storageKey": "2026/05/anon-hash-12c/00000000-0000-4000-a000-000000000001.pdf",
  "thumbnailKey": null,
  "checksum": "sha256:0000...placeholder",
  "fileSize": 102400,
  "mimeType": "application/pdf",
  "category": "journal",
  "documentDate": "2026-05-13",
  "importedAt": "2026-05-30T08:00:00Z",
  "importedBy": "system",
  "importRunId": "00000000-0000-4000-b000-000000000001",
  "confidence": "high",
  "status": "VISIBLE_ON_PATIENT_CARD",
  "auditRequired": true,
  "isJournalRelevant": true,
  "isPatientVisible": false
}
```

Fler exempel: `examples/cco-patient-assets.example.json`.

---

## 7. Audit-events

Alla nedan emittas via `ccoAuditLog`. **Detail-payload innehåller bara
IDs och enums — aldrig PII**.

| Event                             | Trigger                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `asset.imported`                  | `addAsset()` lyckas                                         |
| `asset.status_changed`            | `transitionStatus()` lyckas                                 |
| `asset.link_only_blocker_flagged` | `markAsLinkOnlyBlocker()`                                   |
| `asset.linked_to_patient`         | `markAsVisibleOnPatientCard()` eller `linkAssetToPatient()` |
| `asset.linked_to_encounter`       | `linkAssetToEncounter()`                                    |
| `asset.checksum_verified`         | `recordChecksumVerified()`                                  |
| `asset.read`                      | `listAssetsForPatient/Encounter()`                          |
| `asset.hard_deleted`              | `hardDeleteAsset()`                                         |
