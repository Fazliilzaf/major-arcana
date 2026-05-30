# OLD-CCO File-Work Inventory — 2026-05-30 (P0.C)

> **Scope:** Per P0.C av CCO Document & Media Import Pipeline. Owner-pivot
> 2026-05-30: Drive-länkar tas bort som slutlösning, allt importeras IN
> till CCO. Innan vi bygger en ny import-pipeline måste vi inventera vad
> som redan existerar i kodbasen för fil/journal/bild-hantering så vi
> ÅTERANVÄNDER istället för att duplicera.
>
> **Compliance:** Inga patientnamn / personnummer / email / filinnehåll
> finns i denna rapport. Endast LOC, byte-storlek, paths, last-mod.
>
> **Slutmandat:** `link_only_files = 0` är icke-förhandlingsbart. Drive +
> Meridiq = källor, INTE destinationer. Se
> `.cursor/rules/cco-no-drive-links-import-only.mdc`.
>
> **Komplementdokument:** Detaljerad asset-inventering finns i
> `docs/strategy/OLD-CCO-ASSET-INVENTORY-2026-05-30.md`. Denna fil är
> P0.C-specifik fokus på user-spec-checklist.

---

## 1. Quick-status per user-spec-punkt

| # | Sök | Hittad? | Path |
|--:|---|---|---|
| 1 | Nested repo `major-arcana-cco-next/` | **EJ I REPO** | Finns endast som `cco-next-uncommitted-backup-20260527-003001.zip` + `cco-next-release/` PWA-skal i iCloud parent-folder. Bekräftad gitignore-rad 15 men inga lokala filer. |
| 2 | `src/ops/journalPhotosBackup.js` | FINNS (57 LOC) | tar -czf-arkiv av `data/journal-photos/` — disaster-backup, ej import |
| 3 | `src/lib/googleDriveClient.js` | FINNS (196 LOC) | service-account, `listCustomerPhotos`, `uploadCustomerPhoto`, `streamDriveFileToResponse`, token-cache 55 min |
| 4 | `scripts/migration/scanGoogleDriveApi.js` + `*Drive*.js` | FINNS | `scanGoogleDriveApi.js` (108 LOC), `scanDriveFolder.js`, `scanDriveZips.js`, `enrichIndexWithDriveIds.js`, `preflightDriveApi.js`, `proposeMojibakeDriveMatches.js` |
| 5 | `scripts/backfill-drive-file-ids.js` | FINNS | P6.14.3 idempotent backfill — kan köras flera ggr, producerar rapport |
| 6 | `scripts/migration/lib/migrationIndexWriter.js` + `migrationEnv.js` | FINNS | Writer (40 LOC) bygger `data/migration-index.json` via `aggregateProfiles`. Env (resolveMigrationPaths) ger tenantId + paths för migration |
| 7 | `src/migration/reconciliationEngine.js` | FINNS | Compares Cliento-import vs Drive-index → flags dubblets/orphans. INGEN auto-merge. Definierar `FLAGS`-konstanter. |
| 8 | `data/migration-index.json` | **SAKNAS i worktree** | Genereras on-demand av scan-script — ej gitignored eftersom hela `data/` är ignorerad |
| 8 | `data/cco-patient-master.json` | **SAKNAS** | Refereras i `migrationEnv` men inte materialiserad i denna repo |
| 8 | `data/cco-journal.json` | FINNS (35 671 B) | Master journal-store-state |
| 9 | Andra `data/cco-*.json` | **41 filer** | Se sektion 5 |
| 10 | Sök `customerPhoto/journalPhoto/patientFile/assetImport/fileImport` i src/ops/ | FINNS i 4 filer | `ccoJournalPhotoStore.js`, `ccoOfferFromPlan.js`, `journalPhotosBackup.js`, `scheduler.js` |

Andra parent-paths som sökts:
- `/Users/.../Major Arcana 2.0/` toppmappen — bekräftad **INGEN `major-arcana-cco-next/`-mapp** finns där. Endast `cco-next-release/` (PWA-skal, < 10 KB) och `cco-next-uncommitted-backup-20260527-003001.zip` (269 KB).

---

## 2. Befintliga moduler (categorized)

### A. Foto/bild-hantering (närmast `patient_assets`-schema)

| Modul | Roll | Skriver till |
|---|---|---|
| `src/ops/ccoJournalPhotoStore.js` | **Disk-binär-store** för foton per tenant/patient: `savePhoto/readPhoto/saveAnnotations/saveAnnotatedPreview/deletePhoto` | `data/journal-photos/<tenant>/<patient>/<id>.{jpg,png}` |
| `src/ops/ccoPhotoStore.js` | **Metadata-store** för foton — typ (before/during/after/reference/consent) + source (cco_camera/drive/upload/legacy_import/meridiq_import) | `data/cco-photos.json` (filePath in option) |
| `src/ops/ccoJournalPhotoProcess.js` | Mid-tier som binder photoStore + metadata-koppling | (n/a) |
| `src/ops/ccoJournalBeforeAfter.js` | Hjälpare för before/after-foton kopplade till journal-entry | (n/a) |
| `src/ops/ccoPhotoConsentStore.js` | Foto-publicerings-samtycken per patient | `data/cco-photo-consents.json` |
| `src/ops/ccoPhotoPublishConsent.js` | Publishera till showcase med consent-gate | (n/a) |
| `src/ops/journalPhotosBackup.js` | tar -czf-arkivering av journal-photos-mappen | backup-mapp |

### B. Journal/PDF-import

| Modul | Roll | Skriver till |
|---|---|---|
| `src/ops/ccoJournalStore.js` (1 083 LOC) | Master journal-store: skapa/signera/låsa/rätta. Har `importHistoricalForPatients()` som tar `filesByPersonnummer` → journal-entries | `data/cco-journal.json` |
| `src/ops/ccoJournalPdfExport.js` | Genererar + arkiverar PDF per signerad journal-entry | `data/cco-journal-pdfs/<uuid>.pdf` |
| `src/ops/ccoJournalAiGuard.js` | Guardrail mot att skicka journal-innehåll till AI externt | (n/a) |
| `src/ops/ccoJournalReadAudit.js` | Auto-audit-wrapper för journal-läsning | append cco-audit.jsonl |
| `src/ops/ccoJournalQaDashboardStore.js` | QA-snapshot av journal-coverage | `data/cco-journal-qa.json` |
| `scripts/migration/importHistoricalJournals.js` | CLI: matchar Drive-index → journal-entries (hoppar bilder by default) | journal-store |
| `scripts/backfill-journal-pdfs.js` | Backfill PDF för historiska entries utan PDF | cco-journal-pdfs/ |

### C. Drive-integration (källor)

| Modul | Roll | Skriver till |
|---|---|---|
| `src/lib/googleDriveClient.js` | Service-account-auth + photo upload/list + file-stream | (lever Drive API) |
| `src/ops/ccoDriveFolderCoupler.js` | Patient → predicted Drive-folder + status/confidence-livscykel | `data/cco-master-card-drive-coupling.json` |
| `src/ops/ccoDrivePathPredictor.js` | Heuristik: brand/år/månad → Drive-path | (pure) |
| `src/ops/ccoDriveLinkBuilder.js` | Bygger drive.google.com-URLs för UI | ⚠️ **deprecated per ny regel** — provenance only |
| `scripts/migration/scanGoogleDriveApi.js` | CLI: lista alla filer i en Drive-folder → migration-index | `data/migration-index.json` |
| `scripts/migration/lib/googleDriveApi.js` | Lågnivå: `getAccessToken`, `listAllDriveFiles`, `openDriveFileReadStream` | (lever Drive API) |
| `scripts/migration/preflightDriveApi.js` | Pre-import health-check (auth, folder-existens) | rapport |

### D. Migration-pipeline (orchestration)

| Modul | Roll |
|---|---|
| `src/ops/ccoMigrationIndexStore.js` (201 LOC) | Aggregerar Drive-scan per personnummer → `profilesByPersonnummer`. CRUD: `getFileById`, `getFilesForPersonnummer`, `getProfile`, `getStats`, `replaceScanResult`, `reassignPersonnummer` |
| `src/migration/reconciliationEngine.js` | Cliento × Drive cross-check → FLAGS (dubbletter, orphans, missing data, multiple-patient-files). **NEVER auto-merges.** |
| `src/migration/safeMergeService.js` | Safe-merge-fall för granska merge-candidates |
| `scripts/migration/runMigrationPipeline.js` | Wrapper för pipeline-läge |
| `scripts/migration/runBulkMigration.js` | Orkestrerar preflight → scan → cliento-merge → import |
| `scripts/migration/reconcileStaleNeedsReview.js` | Periodisk genomgång av migration-review-queue |
| `scripts/migration/resolvePipedriveAmbiguous.js` | Pipedrive-specifik dedup |
| `scripts/migration/lib/migrationUtils.js` | `buildFileRecord`, `normalizePersonnummer`, csv-parser. **Schema är nära `patient_assets` men har bara raw scan-fält (ingen checksum, ingen kategorisering).** |
| `scripts/migration/lib/migrationIndexWriter.js` | Writer som tar files + scanMeta och bygger index-JSON |
| `scripts/migration/lib/migrationEnv.js` | resolveMigrationPaths + resolveDriveCredentials |
| `scripts/migration/lib/driveFileMatch.js` | Heuristik: Drive-filnamn → patient-koppling |
| `scripts/migration/lib/mojibakeMatch.js` | Hantera UTF8-broken filnamn (åäö → mojibake) |
| `scripts/migration/lib/spotCheckCore.js` | Sample-validering av index |
| `scripts/migration/lib/migrationZipReader.js` | Läs zip-arkiv av Drive (offline-mode) |

### E. Patient-master & coupling (consumer av asset-data)

| Modul | Roll |
|---|---|
| `src/ops/ccoMasterPatientCardStore.js` | Aggregerar patient-360: customer + journals + photos + consents + agreements + forms + timeline. **Konsumerar ccoPhotoStore — kommer konsumera nya ccoPatientAssetStore.** |
| `src/ops/ccoPatientMasterStore.js` | Master-patient CRUD |
| `src/ops/ccoFortnoxPatientSync.js` | Fortnox-sync (booking-baserad) |

---

## 3. Pipelinens täckta steg (gap-analys mot `cco-no-drive-links-import-only.mdc` Pipeline 1–13)

| Steg | Owner-spec | Täcks idag av | Status |
|--:|---|---|---|
| 1 | Discover | `scanGoogleDriveApi.js`, `scanDriveFolder.js`, `scanDriveZips.js` + `ccoMigrationIndexStore` | OK för Drive. **Saknas:** Meridiq-scan, old-CCO-scan |
| 2 | Download | `googleDriveClient.streamDriveFileToResponse` (read-only stream) | Delvis. **Saknas:** copy-to-secure-storage |
| 3 | Checksum (SHA-256) | (ingen modul) | **SAKNAS** |
| 4 | Verify | (ingen modul) | **SAKNAS** |
| 5 | Classify (journal/photo_X/consent/agreement/form) | `migrationUtils.buildFileRecord` ger `fileType: journal_pdf\|image\|video` | **DELVIS** — för grov |
| 6 | Link patient | `migrationUtils.normalizePersonnummer` + `driveFileMatch` + `reconciliationEngine` | OK |
| 7 | Link encounter (datum + behandling) | `ccoJournalStore.importHistoricalForPatients` (för journal-entries) | DELVIS |
| 8 | Index → `patient_assets` record | (ingen modul) | **SAKNAS — byggs i P0.B** |
| 9 | Audit-log import-event | `ccoAuditLog.append` finns; men `asset.*`-vocab saknas | **DELVIS — vocab läggs till P0.B** |
| 10 | Show i patient-card UI | `patient-master-ui.js` Filer-tab renderar `driveFiles` från API | **BROKEN per ny regel** — hämtar fr. Drive, inte fr. CCO-store |
| 11 | Timeline | `ccoMasterPatientCardStore.buildTimeline` täcker photos/journals/consents/agreements/forms | OK för existing types, **utvidgas till assets** |
| 12 | Provenance bevarad | `originalDriveFileId/Path` finns ENBART i `migrationIndex.files[]`; försvinner vid journal-import | **SAKNAS i journal/photo-domänen** |
| 13 | Review queue | `migration-review-queue.json` är per-patient-merge, ej per-asset | **SAKNAS — byggs i P0.B** |

---

## 4. Source-systemets befintliga data-tillgångar

### `data/` JSON-states med koppling till fil/foto

| Path | Storlek | Roll |
|---|---:|---|
| `data/cco-journal.json` | 35 671 B | Master journal-store-state |
| `data/cco-journal.json.pre-pdf-backfill-*.bak` | 32 815 B | Backup |
| `data/cco-journal-pdfs/` (dir) | n/a | PDF-arkiv per signerad entry |
| `data/journal-photos/` (dir) | n/a | Disk-binär-rot för ccoJournalPhotoStore |
| `data/photos/` (dir) | tom | Reserverad |
| `data/cco-photo-consents.json` | 1 106 B | Foto-samtycken |
| `data/cco-master-card-drive-coupling.json` | 3 783 398 B | **Värdefull**: `{patientId → driveFolderId}` per master-card. Källan för bulk-walk i import-pipeline. |
| `data/drive-coupling-by-cliento-id.json` | 2 825 484 B | **Interim** — Cliento-id → coupling. Per ny regel ska ersättas. |
| `data/migration-review-queue.json` | 14 678 B | Patient-merge-review (Cliento×Meridiq dubbletter). **Annan domän** än asset-review. |
| `data/cco-audit.jsonl` | (växande) | Append-only audit-log |

### Data-filer som SAKNAS

- `data/migration-index.json` — genereras on-demand
- `data/cco-patient-master.json` — refereras i `migrationEnv` men inte materialiserad
- `data/cco-patient-assets.json` — **skapas i P0.B**
- `data/cco-asset-import-runs.json` — **skapas i P0.B**
- `data/cco-asset-review-queue.json` — **skapas i P0.B**

---

## 5. Sammanfattning: vad SAKNAS jämfört med owner-spec

1. **Generisk `patient_assets`-store** med full schema (UUID, sourceSystem, storageKey, checksum, category, status, confidence, audit). `ccoPhotoStore` finns men bara för bild-typer; ingen för PDF/consent/agreement/form/aisia_report.
2. **`asset_import_runs`-store** med run-historik (totalDiscovered/Imported/Verified/NeedsReview/Failed/LinkOnlyBlockers per körning).
3. **`asset_review_queue`-store** per fil (inte per patient som befintliga `migration-review-queue.json`).
4. **SHA-256 checksum-pipeline** — finns ingen modul som hashar.
5. **State-machine status** (DISCOVERED → IMPORTING → IMPORTED_TO_CCO → VERIFIED_IN_CCO → VISIBLE_ON_PATIENT_CARD → NEEDS_REVIEW → REJECTED/DUPLICATE/FAILED_IMPORT/LINK_ONLY_BLOCKER).
6. **`asset.*` audit-actions-vocab** i `ccoAuditLog.ACTIONS`.
7. **RBAC-permissions** för `asset.read/write/delete/import/review/export`.
8. **Secure storage destination** (S3 / encrypted-fs / local-encrypted) för raw asset-binär utanför Drive.
9. **`link_only_files` räknare** i QA-dashboard.
10. **Klassifikator** journal/photo_before/during/after/consent/agreement/form/aisia_report/other.

---

## 6. Recommended reuse-strategi

| Modul | Återanvändning | Vad nya pipelinen tillför |
|---|---|---|
| `googleDriveClient.streamDriveFileToResponse` | Stream-källa i `download`-fasen | Lägg checksum-uppräkning + secure-storage-write |
| `googleDriveClient.listCustomerPhotos` | Discovery per customerId | Mata `ccoAssetImportRunStore` |
| `scanGoogleDriveApi.js` + `migrationIndexWriter` | Bulk-discovery | Konverteras till asset-import-run + asset-records |
| `ccoDriveFolderCoupler` + `cco-master-card-drive-coupling.json` | `{patientId → driveFolderId}` lookup | Lever rätt patient-koppling per fil |
| `migrationUtils.buildFileRecord/normalizePersonnummer` | Konvention för parse av filnamn → patient | Wrappas av `linkPatient`-steg |
| `ccoJournalPhotoStore.savePhoto` | Disk-binär-skrivning för bild-assets | `storageProvider: 'local'`-wrapping |
| `ccoJournalPdfExport` arkivmönster | Mall för raw-PDF-disk-arkivering | Liknande pattern för raw-Drive-PDF |
| `ccoPhotoStore` (struktur, normalize, audit) | **Mall** för `ccoPatientAssetStore` | Identisk pattern, utvidgat schema |
| `ccoAuditLog.ACTIONS` | Audit-event-emission | Ny namespace `asset.*` läggs till |
| `reconciliationEngine.FLAGS` | Inspiration för review-reason-vocab | Mappas till `ambiguous_patient/no_patient_match/duplicate_candidate/low_confidence/unknown_format` |
| `migration-review-queue.json` | **INTE återanvändbar** för asset-review | Annan domän (patient-dubbletter, inte per fil) |
| `ccoDriveLinkBuilder` | **Avveckling**: provenance-only | UI får inte längre använda denna för slut-presentation |

### Behåll INTERIM (rivs ej nu)

Per cursor-regeln: predicted-folder-coupling + drive-historik.html + deeplink-knapp i kunder.html är INTERIM och fortsätter fungera tills riktig import är klar. Inget rivs i P0.B/C — bara nytt byggs.

---

## 7. Konkret modul-tillägg i P0.B

| Skapas | Storlek | Mall |
|---|---:|---|
| `src/ops/ccoPatientAssetStore.js` | ~16 KB | `ccoPhotoStore.js` (normalize+audit+atomic-write) |
| `src/ops/ccoAssetImportRunStore.js` | ~6 KB | `ccoAftercareStore`-mönster |
| `src/ops/ccoAssetReviewQueueStore.js` | ~6 KB | `ccoPhotoStore`-mönster |
| `tests/ops/ccoPatientAssetStore.test.js` | 8+ test | `ccoMasterPatientCardStore.test.js`-mönster |
| `tests/ops/ccoAssetImportRunStore.test.js` | 5+ test | `ccoAftercareStore.test.js`-mönster |
| `tests/ops/ccoAssetReviewQueueStore.test.js` | 6+ test | `ccoPhotoStore.js`-mönster |
| `src/security/ccoRbac.js` (patch) | +6 permissions | `asset.read/write/delete/import/review/export` |
| `src/security/ccoAuditLog.js` (patch) | +11 ACTIONS | `asset.imported/.status_changed/.read/.review_*/.import_run_*/.linked_*/.checksum_verified/.link_only_blocker_flagged` |
| `data/cco-patient-assets.json` | (gitignored) | Skapas on-write med `{ schemaVersion, updatedAt, items, audit }` |
| `data/cco-asset-import-runs.json` | (gitignored) | Samma shape |
| `data/cco-asset-review-queue.json` | (gitignored) | Samma shape |

---

## 8. Risk-noteringar

- `cco-master-card-drive-coupling.json` är redan 3.8 MB. När asset-pipeline kör kan
  `cco-patient-assets.json` växa fort (10 000+ × ~600 B ≈ 6 MB+). Plan: håll JSON,
  monitorera med dashboard, flytta till sqlite vid > 50 MB.
- `data/migration-index.json` är discovery-källan — gitignored. Ska INTE
  replikeras i `cco-patient-assets.json`. Stora fält (path, raw mime) hamnar
  bara i asset-records för importerade filer.
- `drive-coupling-by-cliento-id.json` är 2.8 MB interim, ska enligt regeln
  ersättas. Inte i scope för P0.B/C.
- `major-arcana-cco-next/` är gitignored men finns inte i worktreen. Ingen
  asset-management-kod att lifta från detta repo.

---

*Skapad 2026-05-30 · ENBART counts, paths, byte-storlek, last-modified.
Inga patientnamn / personnummer / email / filinnehåll i denna rapport.*
