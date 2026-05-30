# CCO Import Engine Readiness v3 (path-safe + 6 owner-skärpningar)

*Genererad: 2026-05-30 · Ersätter v2 från samma datum
(`CCO-IMPORT-ENGINE-READINESS-2026-05-30-v2.md`)*

> **Scope:** P0.C-readiness-svar för CCO Asset Import Pipeline efter
> 6 owner-skärpningar + första demo-import-run.
>
> **Owner-spec:** `.cursor/rules/cco-no-drive-links-import-only.mdc` +
> `.cursor/rules/cco-journal-cutover-first.mdc`
>
> **Slutmandat:** `link_only_files = 0` (icke-förhandlingsbart).
>
> **PII-policy:** Detta dokument refererar bara filvägar via
> placeholders (`<REPO_ROOT>` / `<PROD_STORAGE_ROOT>` /
> `<DEMO_STORAGE_ROOT>` / `<DEMO_ASSET_STORE>` / `<PROD_ASSET_STORE>`)
> samt counts och modul-namn. Inga absoluta paths, inga patientnamn,
> personnummer, email eller telefon.

---

## Ändringslogg (v3 vs v2)

- **Path-safe:** alla absoluta paths ersatta med placeholders. Detta
  möjliggör säker distribution/PR-recension utan att läcka host-specifik
  metadata.
- **OWNER-SKÄRPNING #6 applicerad:** adapter validerar patientId mot
  CCO master + pipeline-guard mot predicted folders.
- **Adapter tightened:** `customerStore` aktiv dependency. Utan
  customerStore → varje record `patientId=null` + `_needsPatientReview=true`.
- **Pipeline-guard tightened:** `_folderOnly` records → automatisk
  LINK_ONLY_BLOCKER innan loadBody-försök. `_needsPatientReview`
  tvingar NEEDS_REVIEW även om binär finns.
- **Review-reason-vocab:** ny canonical reason `patient_id_translation_failed`
  (för OS#6-flödet).
- **Test-totalsumma:** 106 (var 95) — +11 nya OS#6 tester.

---

## Path-placeholders (referens)

| Placeholder | Betyder |
|---|---|
| `<REPO_ROOT>` | Repo-roten (host-specifik, säkras i v3 av path-policy) |
| `<PROD_STORAGE_ROOT>` | Produktion-storage (iCloud Migration-data) |
| `<DEMO_STORAGE_ROOT>` | Demo-storage `<REPO_ROOT>/data/demo/cco-secure-storage/` |
| `<DEMO_ASSET_STORE>` | `<REPO_ROOT>/data/demo/cco-patient-assets.json` |
| `<PROD_ASSET_STORE>` | `<REPO_ROOT>/data/cco-patient-assets.json` (gitignored) |

---

## Owner-fråga: "Finns filen direkt i CCO utan att öppna Drive?"

### Demo: JA

Demo asset bevis-checklist (10 punkter per owner-spec):

- `storageKey`: finns (path-safe i denna doc)
- `checksum`: finns (SHA-256)
- `fileSize`: finns (matchar disk)
- `mimeType`: finns (`application/pdf`)
- `patientId`: finns (`anon-patient-001`, validerad mot CCO master)
- `category`: finns (`journal`)
- `status`: `VISIBLE_ON_PATIENT_CARD`
- `listAssetsForPatient('anon-patient-001')` returnerar asseten: ja
- Filen finns fysiskt i CCO secure storage: ja (`<DEMO_STORAGE_ROOT>...`)
- Ingen Drive-länk behövs: ja
- Mapping till patientkortsektion: `"Journaler"` (via `category=journal`)

### Prod: NEJ ÄNNU

- Pipeline har **INTE** kört mot riktig Drive/Meridiq/old_cco-data
- Demo `linkOnlyBlockerCount = 1` är **avsiktligt** (visar flödet)
- Prod-cutover kräver `linkOnlyBlockerCount = 0` efter riktig
  importkörning
- Tom store eller demo-store är **INTE** cutover-bevis

### Hard rule (bekräftad — icke-förhandlingsbart)

- Ingen patientfil får räknas som klar utan `storageKey` + `checksum`
- `LINK_ONLY_BLOCKER` är **ALLTID** en blocker tills resolverad
- `cutoverReadiness.ready` blir aldrig `true` med
  `linkOnlyBlockerCount > 0`
- `markAsVisibleOnPatientCard()` kräver ALLTID `patientId` — ingen
  review-bypass
- (OS#6) Predicted Drive-folder kan ALDRIG bli VERIFIED eller VISIBLE
- (OS#6) Patient utan master-validation kan ALDRIG bli VERIFIED

---

## State-flow

```
Gamla CCO-data
   |
   v
Adapter (ccoOldCcoAssetAdapter)
   |  - läser <REPO_ROOT>/data/cco-master-card-drive-coupling.json
   |  - validerar rawPatientId mot CCO master (OS#6)
   |  - flaggar _folderOnly + _needsPatientReview
   v
Pipeline (ccoAssetImportPipeline)
   |  - guard 1 (OS#6): _folderOnly => LINK_ONLY_BLOCKER (slut)
   |  - guard 2 (OS#5): hasDriveProvenance + no body => LINK_ONLY_BLOCKER (slut)
   |  - download till CCO secure storage (<PROD_STORAGE_ROOT>)
   |  - checksum (SHA-256)
   |  - patientId (validerad via master)
   |  - category (classify)
   |
   +--> needsReview=true => NEEDS_REVIEW + review-queue (slut, manuell)
   |
   +--> all green => VERIFIED_IN_CCO
                          |
                          v (markAsVisibleOnPatientCard guard)
                   VISIBLE_ON_PATIENT_CARD
                          |
                          v
                   patientkort + tidslinje + audit
```

### Terminala states (per state-machine §2)

- `VISIBLE_ON_PATIENT_CARD` — happy path
- `NEEDS_REVIEW` — manuell resolution via `reassignToPatient()`
- `LINK_ONLY_BLOCKER` — kräver SA / source-fix
- `DUPLICATE` — samma checksum, behåller provenance
- `FAILED_IMPORT` — non-Drive source + body-fel

---

## Owner-skärpningar applicerade

| # | Skärpning | Status | Test |
|---|---|---|---|
| 1 | `markAsVisibleOnPatientCard` kräver ALLTID `patientId` (ingen review-bypass) | applied | `tests/ops/ccoPatientAssetStore.test.js` (4 nya tester inkl. `reassignToPatient` happy-path) |
| 2 | `asset.soft_deleted` + `asset.hard_deleted` + `asset.reassigned_to_patient` i ACTIONS, snapshot i hard-delete, audit-saknas → kastar | applied | 3 nya tester (OS#2-prefixade) |
| 3 | Tom store ≠ cutover-bevis — `cutoverReadiness`-block i `stats()` med `reason: 'empty_store'` på tom store | applied | 3 nya tester (OS#3-prefixade) |
| 4 | PCRE-regex (`[0-9]` istället för `\d`) i compliance-scan + `scripts/scan-for-pii.sh` | applied | Live-körd, 0 PII-träffar |
| 5 | `originalDriveFileId` utan `storageKey`/`checksum` = `LINK_ONLY_BLOCKER` (pipeline-guard + stats-criterion) | applied | 6 nya tester (OS#5-prefixade) |
| 6 | Adapter validerar rawPatientId mot CCO master + pipeline-guard mot predicted folders | applied | 11 nya tester (OS#6-prefixade): 7 i adapter, 4 i pipeline |

---

## Cutover Readiness (efter demo-run 2026-05-30)

```
Total assets:                5
linkOnlyBlockerCount:        1  (demo skapar avsiktligt 1 för att visa flödet)
visibleOnPatientCardCount:   1
needsReviewCount:            1
duplicateCount:              1
failedImportCount:           1
verifiedButNotVisibleCount:  0
importedButNotVerifiedCount: 0

cutoverReadiness:
  ready:   false
  reason:  link_only_blockers_remain
  message: 1 LINK_ONLY_BLOCKER kvar — måste importeras eller flyttas
           till review med owner-beslut.
```

**För riktig cutover-readiness:**

- Alla source-systems måste ha kört (Drive, old_cco, Meridiq)
- `linkOnlyBlockerCount` måste vara **0** EFTER körning
- Alla `NEEDS_REVIEW` måste ha owner-beslut (review-queue tom)
- `cutoverReadiness.ready` måste vara `true` med
  `reason: 'all_imported_and_verified'`

---

## Per-suite testresultat (efter OS#6)

| Suite | Tester | Pass | Fail | Delta vs v2 |
|---|--:|--:|--:|--:|
| `tests/ops/ccoPatientAssetStore.test.js` | 47 | 47 | 0 | 0 |
| `tests/ops/ccoAssetImportRunStore.test.js` | 6 | 6 | 0 | 0 |
| `tests/ops/ccoAssetReviewQueueStore.test.js` | 8 | 8 | 0 | 0 |
| `tests/ops/ccoSecureStorageProvider.test.js` | 12 | 12 | 0 | 0 |
| `tests/ops/ccoAssetImportPipeline.test.js` | 17 | 17 | 0 | +4 (OS#6) |
| `tests/ops/ccoOldCcoAssetAdapter.test.js` | 16 | 16 | 0 | +7 (OS#6) |
| **TOTAL** | **106** | **106** | **0** | **+11** |

---

## 12-fråge-svar (uppdaterat efter OS#6)

### Q1-Q8: oförändrade

Se v1 (`CCO-IMPORT-ENGINE-READINESS-2026-05-30.md`) — svaren på
infrastruktur-frågorna är samma. Endast Q9-Q12 är uppdaterade nedan.

### Q9. Hur många `LINK_ONLY_BLOCKER` har identifierats?

**Efter demo-run: 1 (avsiktligt — demo-data har 1 sådan för att visa
state-machine-vägen).**

**I prod: kommer bero på source-data.** För Hair TP förväntar vi
flera tusen blockers vid första körning mot Drive (gamla Drive-länkar
i `<REPO_ROOT>/data/cco-master-card-drive-coupling.json` där binären
kan vara flyttad/raderad/permission-låst).

**Cutover-villkor: 0 efter alla source-systems körts.**

OWNER-SKÄRPNING #5 tydliggör att blocker-räkningen inte bara baseras på
`status === 'LINK_ONLY_BLOCKER'` — den räknar också assets med
`originalDriveFileId`/`originalDrivePath` men saknad `storageKey`/`checksum`
(oavsett status-fält). Detta så att assets som "smiter förbi" pipelinens
guard ändå dyker upp i stats.

OWNER-SKÄRPNING #6 lägger till två nya blocker-källor:
- Folder-only records (predicted folders utan filer) → pipeline
  guard 1 sätter LINK_ONLY_BLOCKER innan loadBody.
- Patient-validation-fel → NEEDS_REVIEW (inte VERIFIED), så de syns
  i `needsReviewCount` och blockerar cutoverReadiness via samma
  `link_only_blockers_remain` / `review_queue_pending` reason-enum.

### Q10. Vilka stores skapades?

Oförändrad lista (se v1 Q10), men med flera nya store-funktioner:

- `ccoPatientAssetStore.reassignToPatient()` — kanonisk väg
  NEEDS_REVIEW → patientId + VERIFIED_IN_CCO
- `ccoPatientAssetStore.stats().cutoverReadiness` — strukturerat
  go/no-go-svar med `reason`-enum

Nya audit-actions i `src/security/ccoAuditLog.js`:

```
ASSET_SOFT_DELETED         = 'asset.soft_deleted'
ASSET_HARD_DELETED         = 'asset.hard_deleted'
ASSET_REASSIGNED_TO_PATIENT = 'asset.reassigned_to_patient'
ASSET_VISIBLE_GUARD_FAILED = 'asset.visible_guard_failed'
```

Nya review-reasons (OS#6):

```
'patient_id_translation_failed'  // adaptern kunde inte översätta rawPatientId
                                 // mot CCO master directory
```

### Q11. Vilka tester passerade?

Se per-suite-tabellen ovan: **106/106 gröna efter OS#6**.

Nya OS#6-tester:

- Adapter (+7): no customerStore, direct master-match, cliento
  translation, meridiq translation, unknown raw-id, internal helper,
  folder-only (empty drive listing).
- Pipeline (+4): folder-only → LINK_ONLY_BLOCKER (audit-event),
  `_needsPatientReview=true` med binär → NEEDS_REVIEW + queue,
  adapter-flag → review-reason `patient_id_translation_failed`,
  predicted folder ALDRIG VISIBLE.

### Q12. Bekräfta att inga patientdatafiler committades.

**Bekräftat — utvidgad verifiering efter OWNER-SKÄRPNING #4:**

1. `<REPO_ROOT>/data/` är fortsatt `.gitignore`d (rad 3).
2. `<REPO_ROOT>/data/demo/` (demo-script-output) ligger under `data/` → gitignored.
3. `scripts/scan-for-pii.sh` körs lokalt + senare i CI med PCRE-format.
4. Live-scan 2026-05-30 på alla nya filer: **0 PII-träffar.**

```
$ bash scripts/scan-for-pii.sh
=== PII-scan (PCRE-format) ===
1. Personnummer-mönster: OK — inga personnummer hittade.
2. Svenska mobilnummer:  OK — inga svenska mobilnummer hittade.
3. Email-adresser:       OK — inga okända email-adresser hittade.
4. Git-tracked filer:    OK — inga PII-träffar i git-tracked filer.
PII-scan PASS: 0 träffar.
```

---

## Vad krävs för att svara JA på "Finns filen direkt i CCO?" för ALLA patienter

(7-stegs cutover-checklista)

1. **Drive service-account** — kräver `docs/ops/drive-service-account-setup.md`
   (oauth-creds, scope, OU-permission).
2. **Meridiq journal-API-access** — vendor-kontakt; saknas modul idag.
   `pipeline.discoverFromMeridiq()` är stub.
3. **Old CCO bridge — adapter klar (OS#6).**
   `ccoOldCcoAssetAdapter` läser `<REPO_ROOT>/data/cco-master-card-drive-coupling.json`,
   validerar patientId mot CCO master och flaggar folder-only +
   needs-review enligt master-spec.
4. **Kör pipeline för varje source-system** (commit-mode):
   ```bash
   node scripts/run-asset-import.js --source-system drive --commit
   node scripts/run-asset-import.js --source-system old_cco --commit
   node scripts/run-asset-import.js --source-system meridiq --commit
   ```
   (Wrapper-scriptet `scripts/run-asset-import.js` är inte byggt än —
   `scripts/demo-asset-import-run.js` är dess in-memory motsvarighet.)
5. **Resolva alla `NEEDS_REVIEW`** via staff-beslut i UI (Phase-2
   review-banner i `public/journal-qa.html`). Använd
   `reassignToPatient()` när patient identifieras.
6. **Bekräfta `linkOnlyBlockerCount = 0`** efter alla runs:
   ```js
   const s = assetStore.stats();
   if (!s.cutoverReadiness.ready) throw new Error(s.cutoverReadiness.message);
   ```
7. **Manuell verifikation** av 10 random assets — staff öppnar varje
   direkt i CCO-UI:t utan att gå till Drive. Audit-event `asset.read`
   logger varje verification.

---

## Vad pipeline INTE bevisar än (gap inför prod)

- **Drive-API är inte uppringd.** `discoverFromDrive()` returnerar []
  utan `driveClient`. Drift-bevis = kör mot riktig service-account.
- **Meridiq är stub.** Kräver vendor-API eller robust SQL-dump-adapter.
- **`scripts/run-asset-import.js` saknas.** Demo-scriptet bevisar
  pipeline-API men har inga CLI-flaggor för `--source-system` /
  `--commit` / `--limit` / `--tenant` / `--resume`.
- **Phase-3 review-UI** (resolve, reassign, mark-duplicate) är inte
  byggt — bara stores + Phase-2 read-only banner.

---

## Sammanfattning för owner

> **Q: Finns filen direkt i CCO utan att öppna Drive?**
> **A: JA för 1 demo-fil. NEJ för prod-data — pipeline har inte körts mot
> Drive/Meridiq/old_cco med riktiga creds.**
>
> Men: alla 6 skärpningar är applicerade + testade (106/106 gröna),
> demo-bevis finns på disk (path-safe placeholder
> `<DEMO_STORAGE_ROOT>...`), cutoverReadiness är ärligt `false` med
> `reason='link_only_blockers_remain'` och 7-stegs-checklistan ovan
> visar exakt vad som krävs för att komma till `ready=true`.
>
> OS#6 lägger den sista pipelinens-skärpning på plats: predicted
> folders kan ALDRIG bli verified, och en patient utan master-validation
> kan ALDRIG bli verified. Detta cementerar "no Drive links — import
> only" som arkitektur, inte bara konvention.
