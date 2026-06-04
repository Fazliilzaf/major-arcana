# CCO Import Engine Readiness v2 (uppdaterad efter 5 owner-skärpningar)

*Genererad: 2026-05-30 · Ersätter v1 från samma datum
(`CCO-IMPORT-ENGINE-READINESS-2026-05-30.md`)*

> **Scope:** P0.C-readiness-svar för CCO Asset Import Pipeline efter
> 5 owner-skärpningar + första demo-import-run.
>
> **Owner-spec:** `.cursor/rules/cco-no-drive-links-import-only.mdc` +
> `.cursor/rules/cco-journal-cutover-first.mdc`
>
> **Slutmandat:** `link_only_files = 0` (icke-förhandlingsbart).
>
> **PII-policy:** Detta dokument refererar bara filvägar, counts och
> modul-namn. Inga patientnamn / personnummer / email / telefon.

---

## Svar på owner-fråga: "Finns filen direkt i CCO utan att öppna Drive?"

### För demo: JA

- 1 demo-fil verifierad (63 bytes PDF) i CCO secure storage
- `storageKey`, `checksum`, `fileSize`, `mimeType`, `patientId`, `category`
  alla satta korrekt
- `status = VISIBLE_ON_PATIENT_CARD`
- `listAssetsForPatient('anon-patient-001')` returnerar asseten
- Mappar till patientkort-sektion **"Journaler"** via `category=journal`

### För prod: NEJ ÄNNU

- Pipeline har **INTE** kört mot Drive / Meridiq / old_cco med riktig data
- Demo `linkOnlyBlockerCount = 1` är **avsiktligt** (demo bygger 1 sådan
  för att visa flödet — den är **inte** produktions-bevis)
- **Prod-cutover kräver `linkOnlyBlockerCount = 0` EFTER riktig
  importkörning**
- Tom store eller demo-store är **INTE** cutover-bevis

### Hard rule (bekräftad — icke-förhandlingsbart)

- Ingen patientfil får räknas som klar utan `storageKey` + `checksum`
- `LINK_ONLY_BLOCKER` är **ALLTID** en blocker tills resolverad
- `cutoverReadiness.ready` blir aldrig `true` med
  `linkOnlyBlockerCount > 0`
- `markAsVisibleOnPatientCard()` kräver ALLTID `patientId` — ingen
  review-bypass

### Adapter-status (P0.I — 2026-05-30)

- `src/ops/ccoOldCcoAssetAdapter.js` **byggd och testad** (9 tester)
- Wire-up i `ccoAssetImportPipeline.discoverFromOldCco()` klart
- Kan läsa `data/cco-master-card-drive-coupling.json` (7 257
  patient-couplings, 6 268 med folder-id)
- **Saknar:** Google Drive service-account för att hämta riktiga
  binärer — utan SA returnerar adaptern `LINK_ONLY_BLOCKER` per
  coupling (vilket är korrekt beteende per hard rule)

---

## Owner-fråga: "Finns filen direkt i CCO utan att öppna Drive?"

### Svar (ärligt)

**JA — bevisat för 1 demo-fil (verifierat 2026-05-30 via
`scripts/demo-asset-import-run.js`).**

**För riktig prod-data: NEJ ÄNNU — pipeline har inte kört mot Drive,
old_cco eller Meridiq med riktig data.**

### Verifierad demo-bevis

```
Fil:           data/demo/cco-secure-storage/2026/05/b23a6a8439c0/41e14a30-bac1-43ce-8824-f8aa4366bddf.pdf
Storlek:       63 bytes
Checksum:      sha256:6f52f56122a93fc9f34b87589e0aef51b379e9b3f4ebbe8cd438e71d6e00e732
Patient:       anon-patient-001
Category:      journal
Status:        VISIBLE_ON_PATIENT_CARD
Drive-länk:    behövs ej (filen ligger i CCO secure storage)
```

Reproducerbar:

```bash
node scripts/demo-asset-import-run.js --clean
```

---

## Owner-skärpningar applicerade

| # | Skärpning | Status | Test |
|---|---|---|---|
| 1 | `markAsVisibleOnPatientCard` kräver ALLTID `patientId` (ingen review-bypass) | ✅ | `tests/ops/ccoPatientAssetStore.test.js` (4 nya tester inkl. `reassignToPatient` happy-path) |
| 2 | `asset.soft_deleted` + `asset.hard_deleted` + `asset.reassigned_to_patient` i ACTIONS, snapshot i hard-delete, audit-saknas → kastar | ✅ | 3 nya tester (OS#2-prefixade) |
| 3 | Tom store ≠ cutover-bevis — `cutoverReadiness`-block i `stats()` med `reason: 'empty_store'` på tom store | ✅ | 3 nya tester (OS#3-prefixade) |
| 4 | PCRE-regex (`[0-9]` istället för `\d`) i compliance-scan + `scripts/scan-for-pii.sh` | ✅ | Live-körd, 0 PII-träffar |
| 5 | `originalDriveFileId` utan `storageKey`/`checksum` = `LINK_ONLY_BLOCKER` (pipeline-guard + stats-criterion) | ✅ | 6 nya tester (OS#5-prefixade) |

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

## 12-fråge-svar (uppdaterat efter skärpningar)

### Q1-Q8: oförändrade

Se v1 (`CCO-IMPORT-ENGINE-READINESS-2026-05-30.md`) — svaren på
infrastruktur-frågorna är samma. Endast Q9-Q12 är uppdaterade nedan.

### Q9. Hur många `LINK_ONLY_BLOCKER` har identifierats?

**Efter demo-run: 1 (avsiktligt — demo-data har 1 sådan för att visa
state-machine-vägen).**

**I prod: kommer bero på source-data.** För Hair TP förväntar vi
flera tusen blockers vid första körning mot Drive (gamla Drive-länkar
i `data/cco-master-card-drive-coupling.json` där binären kan vara
flyttad/raderad/permission-låst).

**Cutover-villkor: 0 efter alla source-systems körts.**

OWNER-SKÄRPNING #5 tydliggör att blocker-räkningen inte bara baseras på
`status === 'LINK_ONLY_BLOCKER'` — den räknar också assets med
`originalDriveFileId`/`originalDrivePath` men saknad `storageKey`/`checksum`
(oavsett status-fält). Detta så att assets som "smiter förbi" pipelinens
guard ändå dyker upp i stats.

### Q10. Vilka stores skapades?

Oförändrad lista (se v1 Q10), men med två nya store-funktioner:

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

### Q11. Vilka tester passerade?

Per-suite-resultat efter 5 owner-skärpningar (mätt 2026-05-30):

| Suite | Tester | Pass | Fail | Delta vs v1 |
|---|--:|--:|--:|--:|
| `tests/ops/ccoPatientAssetStore.test.js` | **43** | 43 | 0 | +12 |
| `tests/ops/ccoAssetImportRunStore.test.js` | 6 | 6 | 0 | 0 |
| `tests/ops/ccoAssetReviewQueueStore.test.js` | 8 | 8 | 0 | 0 |
| `tests/ops/ccoSecureStorageProvider.test.js` | 12 | 12 | 0 | 0 |
| `tests/ops/ccoAssetImportPipeline.test.js` | **13** | 13 | 0 | +3 |
| **TOTAL** | **82** | **82** | **0** | **+15** |

Nya tester sedan v1:

- **OS#1 (4):** `markAsVisibleOnPatientCard` utan patientId kastar
  alltid + `reassignToPatient` happy-path + bara-NEEDS_REVIEW-guard +
  patientId-validering
- **OS#2 (3):** `softDeleteAsset` emit dedikerat audit + `hardDeleteAsset`
  med fullAssetSnapshot + `hardDeleteAsset` utan auditLog kastar
- **OS#3 (3):** `cutoverReadiness` på tom store / med blocker / ready
- **OS#5 (5):** stats-criterion för Drive-provenance + saknad binär,
  ej-Drive-source exklusion, pipeline auto-LINK_ONLY_BLOCKER, pipeline
  emit dedikerat audit, loadBody-fel-grenar

### Q12. Bekräfta att inga patientdatafiler committades.

**Bekräftat — utvidgad verifiering efter OWNER-SKÄRPNING #4:**

1. `data/` är fortsatt `.gitignore`d (rad 3).
2. `data/demo/` (demo-script-output) ligger under `data/` → gitignored.
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
3. **Old CCO bridge — adapter.** Anpassa
   `data/cco-master-card-drive-coupling.json`-format till
   `{patientId → files[]}` så `pipeline.discoverFromOldCco()` kan läsa
   direkt (idag förväntar den `profilesByPersonnummer`-strukturen).
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
> Men: alla 5 skärpningar är applicerade + testade (82/82 gröna),
> demo-bevis finns på disk, cutoverReadiness är ärligt `false` med
> `reason='link_only_blockers_remain'` och 7-stegs-checklistan ovan
> visar exakt vad som krävs för att komma till `ready=true`.
