# CCO Import Engine — Readiness audit (2026-05-30)

> **Scope:** P0.C-readiness-svar för CCO Asset Import Pipeline. Tolv frågor
> som täcker återanvändbarhet, P0-blockers och compliance inför cutover.
>
> **Owner-spec:** `.cursor/rules/cco-no-drive-links-import-only.mdc` +
> `.cursor/rules/cco-journal-cutover-first.mdc`
>
> **Slutmandat:** `link_only_files = 0` (icke-förhandlingsbart).
>
> **PII-policy:** Detta dokument refererar bara filvägar, counts och
> modul-namn. Inga patientnamn / personnummer / email / telefon.

---

## Q1. Vilka gamla CCO-moduler hittades?

Per `docs/strategy/OLD-CCO-FILE-WORK-INVENTORY-2026-05-30.md` §2 finns
följande fil/foto-relaterade moduler i kodbasen:

**Foto / bild-hantering (A):**

- `src/ops/ccoJournalPhotoStore.js` — disk-binär-store
- `src/ops/ccoPhotoStore.js` — metadata-store
- `src/ops/ccoJournalPhotoProcess.js` — mid-tier
- `src/ops/ccoJournalBeforeAfter.js` — before/after-koppling
- `src/ops/ccoPhotoConsentStore.js` — publiceringssamtycken
- `src/ops/ccoPhotoPublishConsent.js` — publish + consent-gate
- `src/ops/journalPhotosBackup.js` — tar.gz-arkiv

**Journal / PDF-import (B):**

- `src/ops/ccoJournalStore.js` (1 083 LOC) — master journal-store
- `src/ops/ccoJournalPdfExport.js` — PDF-export
- `src/ops/ccoJournalAiGuard.js` — AI-guardrail
- `src/ops/ccoJournalReadAudit.js` — auto-audit
- `src/ops/ccoJournalQaDashboardStore.js` — QA-snapshot
- `scripts/migration/importHistoricalJournals.js` — CLI
- `scripts/backfill-journal-pdfs.js` — PDF backfill

**Drive-integration (C):**

- `src/lib/googleDriveClient.js` — service-account
- `src/ops/ccoDriveFolderCoupler.js` — patient -> Drive-folder
- `src/ops/ccoDrivePathPredictor.js` — path-heuristik
- `src/ops/ccoDriveLinkBuilder.js` — deprecated per ny regel, provenance-only
- `scripts/migration/scanGoogleDriveApi.js` — bulk-scan
- `scripts/migration/lib/googleDriveApi.js` — lågnivå
- `scripts/migration/preflightDriveApi.js` — health-check

**Migration-pipeline (D):** `src/ops/ccoMigrationIndexStore.js`,
`src/migration/reconciliationEngine.js`, `src/migration/safeMergeService.js`,
`scripts/migration/runMigrationPipeline.js`,
`scripts/migration/runBulkMigration.js`, plus 9 lib-moduler under
`scripts/migration/lib/`.

**Konsumenter (E):** `src/ops/ccoMasterPatientCardStore.js`,
`src/ops/ccoPatientMasterStore.js`, `src/ops/ccoFortnoxPatientSync.js`.

> **Källa:** Inventoryn §2, raderna 80-160.

---

## Q2. Finns gamla patient-file mappings?

**JA — flera.**

- `data/cco-master-card-drive-coupling.json` (3 783 398 B) — kanonisk
  `{patientId -> driveFolderId}`-mapping per master-card. Inventoryn §4.
- `data/drive-coupling-by-cliento-id.json` (2 825 484 B) — interim
  Cliento-id-mapping. Flagged for deprecation enligt cursor-regeln.
- `src/ops/ccoDriveFolderCoupler.js` — coupling-livscykel (status +
  confidence).

> Dessa fungerar som **lookup-källa för pipeline-stegets `linkPatient`**.

---

## Q3. Finns gamla journal-PDF imports?

**JA.**

- `src/ops/ccoJournalStore.js` har `importHistoricalForPatients()` som tar
  `filesByPersonnummer` -> journal-entries (inventoryn §2.B).
- `scripts/migration/importHistoricalJournals.js` — CLI som matchar
  Drive-index -> journal-entries (hoppar bilder by default).
- `scripts/backfill-journal-pdfs.js` — backfill av PDF för historiska
  entries utan PDF.
- `data/cco-journal.json` (35 671 B) — befintlig master-state.
- `data/cco-journal-pdfs/` — PDF-arkiv per signerad entry.

> Pipeline-täckning enligt inventory §3: steg 1-2 (Discover/Download)
> finns delvis, steg 3-4 (Checksum/Verify) **saknades** -> nu byggt i
> `src/ops/ccoSecureStorageProvider.js`.

---

## Q4. Finns gamla bild-/foto-flöden?

**JA.**

- `src/ops/ccoJournalPhotoStore.js` — `savePhoto/readPhoto/saveAnnotations/
  saveAnnotatedPreview/deletePhoto`. Disk-binär per
  `data/journal-photos/<tenant>/<patient>/<id>.{jpg,png}`.
- `src/ops/ccoPhotoStore.js` — metadata med typ
  (before/during/after/reference/consent) + source
  (cco_camera/drive/upload/legacy_import/meridiq_import).
- `src/ops/ccoJournalPhotoProcess.js` — bind photoStore + metadata.
- `src/ops/ccoJournalBeforeAfter.js` — before/after-foton till journal-entry.
- `src/lib/googleDriveClient.js` — `listCustomerPhotos`,
  `uploadCustomerPhoto`, `streamDriveFileToResponse`.

> Befintliga foto-flöden täcker bild-typer men inte PDF/consent/agreement/
> form/aisia_report. Nya `ccoPatientAssetStore` är generisk för **alla**
> asset-typer.

---

## Q5. Finns gamla Drive/Meridiq mappings?

**Drive: JA.** Se Q2 — `data/cco-master-card-drive-coupling.json` är
kanonisk + `ccoDriveFolderCoupler` hanterar livscykel.

**Meridiq: BARA EXPORT-STRUKTURER.** Inventoryn §3 noterar att
"Meridiq-scan" saknas som dedikerad modul; meridiq-import sker idag via
CSV/SQL-dump till `scripts/migration/`. `discoverFromMeridiq()` i
`src/ops/ccoAssetImportPipeline.js` är en stub som ska injekteras vid
behov.

---

## Q6. Vilken logik kan återanvändas direkt?

Per inventory §6:

| Modul | Återanvändning |
|---|---|
| `googleDriveClient.streamDriveFileToResponse` | Stream-källa i pipeline:s download-fas |
| `googleDriveClient.listCustomerPhotos` | Discovery per customerId |
| `scanGoogleDriveApi.js` + `migrationIndexWriter` | Bulk-discovery |
| `ccoDriveFolderCoupler` + `cco-master-card-drive-coupling.json` | patient-lookup |
| `migrationUtils.buildFileRecord/normalizePersonnummer` | Filename-parse |
| `ccoJournalPhotoStore.savePhoto` | Disk-binär-skrivning (mappat via `storageProvider:'local'`) |
| `ccoJournalPdfExport` arkivmönster | Mall för raw-PDF-disk-arkivering |
| `ccoPhotoStore` (struktur, normalize, audit) | **Direkt mall** för `ccoPatientAssetStore` |
| `ccoAuditLog.ACTIONS` | Audit-event-emission |
| `reconciliationEngine.FLAGS` | Inspiration för review-reason-vocab |

---

## Q7. Vad måste skrivas om?

Per inventory §5 (10 gap-punkter), och nu åtgärdat i P0.B/B+/B++:

1. Generisk `patient_assets`-store -> **byggt:** `src/ops/ccoPatientAssetStore.js`
2. `asset_import_runs`-store -> **byggt:** `src/ops/ccoAssetImportRunStore.js`
3. `asset_review_queue`-store -> **byggt:** `src/ops/ccoAssetReviewQueueStore.js`
4. SHA-256 checksum-pipeline -> **byggt:** `src/ops/ccoSecureStorageProvider.js`
5. State-machine status -> **byggt + cementerat:** `STATUS_TRANSITIONS` +
   `transitionStatus()` i `ccoPatientAssetStore.js`
6. `asset.*` audit-vocab -> **byggt:** 8 events
   (`asset.imported/.status_changed/.read/.checksum_verified/.linked_to_patient/
   .linked_to_encounter/.link_only_blocker_flagged/.hard_deleted`)
7. RBAC-permissions -> **byggt** i `src/security/ccoRbac.js`
8. Secure storage destination -> **byggt:** `createLocalProvider` i
   `ccoSecureStorageProvider`, S3/encrypted-fs är pluggable
9. `link_only_files` räknare i QA-dashboard -> **byggt** (Phase 2-banner
   11 metrics i `public/journal-qa.html`)
10. Klassifikator för 9 kategorier -> **byggt:** `classify()` i
    `ccoAssetImportPipeline.js`

`ccoDriveLinkBuilder.js` ska **fasas ut för slut-UI** (provenance only).
`drive-coupling-by-cliento-id.json` ska ersättas — utanför P0.B/C scope.

---

## Q8. Finns något som fortfarande bara bygger på Drive-länk?

**JA — INTERIM, flaggat i UI.**

`public/kunder.html:5113` har sektion:

```html
<summary>Drive (interim) <span class="count">arkivkälla</span></summary>
```

Detta är **medvetet** per cursor-regelns interim-policy: predicted-folder-
coupling + drive-historik.html + deeplink-knapp i kunder.html fortsätter
fungera tills riktig import är komplett. Dessa byggs **inte ut nu** — de
flaggas och avvecklas i samband med cutover.

Specifika fil-referenser:

- `public/kunder.html` rad 4643-4675 — `DRIVE_LINK`-byggare (interim)
- `public/kunder.html` rad 5113 — UI-summary flaggad "interim"

Den nya `Filer & journaler`-sektionen (P0.G) renderar default-open från
`ccoPatientAssetStore` — i.e. **importerade assets** är primär källa,
Drive-deeplink är fallback under cutover.

---

## Q9. Hur många `LINK_ONLY_BLOCKER` har identifierats?

**Idag: 0.**

Verifierat via `stats()` på tom store (default-tillstånd när pipeline
inte körts):

```js
const s = store.stats();
// s.linkOnlyBlockerCount === 0
```

Bekräftat i `tests/ops/ccoPatientAssetStore.test.js`:

> "stats: alla 9 nya counters returneras med 0 på tom store" (test 29
> i suiten).

När pipeline kör mot riktig data första gången kommer
`linkOnlyBlockerCount` reflektera antalet records utan binär från
källan (Drive-link utan downloadbar fil, Meridiq-export utan PDF, m.m.).
Idag är store tom -> count = 0.

**linkOnlyBlockerCount: 0** är dock **inte** ett bevis på readiness —
det är ett bevis på att pipeline inte körts än. Cutover-mandatet
`link_only_files = 0` förutsätter att pipeline har kört och alla
record-typer har binär.

---

## Q10. Vilka stores skapades?

- `src/ops/ccoPatientAssetStore.js` — kanonisk asset-metadata-store
  (24 fält, 11-status state-machine, 8 audit-events)
- `src/ops/ccoAssetImportRunStore.js` — run-historik (12 fält, 3 modes,
  3 sourceSystems, 2 audit-events)
- `src/ops/ccoAssetReviewQueueStore.js` — per-asset review-queue (8 fält,
  5 reasons, 4 decisions, 2 audit-events)
- `src/ops/ccoSecureStorageProvider.js` — pluggable storage
  (local/encrypted-fs/S3) med SHA-256 + dedup
- `src/ops/ccoAssetImportPipeline.js` — 13-stegs-orkestrering

Plus schema-docs och fixtures:

- `docs/schema/cco-patient-assets.schema.md`
- `docs/schema/cco-asset-import-runs.schema.md`
- `docs/schema/cco-asset-review-queue.schema.md`
- `examples/cco-patient-assets.example.json` (anonymized)
- `examples/cco-asset-import-runs.example.json` (anonymized)
- `examples/cco-asset-review-queue.example.json` (anonymized)

---

## Q11. Vilka tester passerade?

Per-suite-resultat efter P0.B++ guards (mätt 2026-05-30):

| Suite | Tester | Pass | Fail |
|---|--:|--:|--:|
| `tests/ops/ccoPatientAssetStore.test.js` | **31** | 31 | 0 |
| `tests/ops/ccoAssetImportRunStore.test.js` | 6 | 6 | 0 |
| `tests/ops/ccoAssetReviewQueueStore.test.js` | 8 | 8 | 0 |
| `tests/ops/ccoSecureStorageProvider.test.js` | 12 | 12 | 0 |
| `tests/ops/ccoAssetImportPipeline.test.js` | 10 | 10 | 0 |
| **TOTAL** | **67** | **67** | **0** |

ccoPatientAssetStore har växt från 10 till 31 tester:

- 10 original (1 uppdaterad: `markAsLinkOnlyBlocker` testar nu förbjuden
  VISIBLE-transition istället för olaglig direkt-bump)
- 5 nya: `transitionStatus` (valid / invalid / terminal / audit / happy-path)
- 6 nya: `markAsVisibleOnPatientCard` (full guard / saknad storageKey /
  saknad checksum / saknad patientId / fel current-status / 404)
- 3 nya: `softDeleteAsset` (REJECTED default / DUPLICATE / invalid target)
- 4 nya: `hardDeleteAsset` (OK / journalrelevant-block / saknad reason /
  audit-event)
- 3 nya: `stats` (tom store / blandning / REJECTED-exklusion)

---

## Q12. Bekräfta att inga patientdatafiler committades.

**Bekräftat.**

1. `data/` är `.gitignore`d (rad 3 i `.gitignore`):

   ```
   data/
   ```

2. Inga av de nya filerna innehåller PII. PII-scan med UUID-strip på alla
   9 commit:ade filer:

   | Fil | pnr | phone | hairtp-email |
   |---|--:|--:|--:|
   | `docs/schema/cco-patient-assets.schema.md` | 0 | 0 | 0 |
   | `docs/schema/cco-asset-import-runs.schema.md` | 0 | 0 | 0 |
   | `docs/schema/cco-asset-review-queue.schema.md` | 0 | 0 | 0 |
   | `examples/cco-patient-assets.example.json` | 0 | 0 | 0 |
   | `examples/cco-asset-import-runs.example.json` | 0 | 0 | 0 |
   | `examples/cco-asset-review-queue.example.json` | 0 | 0 | 0 |
   | `src/ops/ccoPatientAssetStore.js` | 0 | 0 | 0 |
   | `src/ops/ccoAssetImportPipeline.js` | 3* | 0 | 0 |
   | `tests/ops/ccoPatientAssetStore.test.js` | 0 | 0 | 0 |

   *De 3 matches i `ccoAssetImportPipeline.js` är **regex-doc-kommentarer**
   som visar pnr-mönstret (`// 19800101-1234, 198001011234` och
   `// 800101-1234`) — pre-existing P0.D-kod, inte PII utan
   syntax-exempel för regex-parsern.

3. Alla exempel-UUIDs börjar med `00000000-` för tydlighet att de är
   fake. Alla `patientId`-värden i examples är prefixet `anon-patient-`.

---

## Slutsats

Pipeline är **strukturellt redo** (5 moduler, 67 passerade tester, 3
schema-docs, 3 anonymiserade fixtures, state-machine cementerad, soft/
hard-delete-guards på plats).

**linkOnlyBlockerCount: 0** (verifierat genom store.stats() på tom store)
— pipeline måste köras med riktig data för att producera realistisk
siffra. Cutover-mandatet `link_only_files = 0` kan inte verifieras innan
första riktiga import-run kompletterar.
