# Google Drive → kundvy: integrationskarta (för Cursor)

**Mål:** få Google Drive-filer (foton + dokument) att synas i nya kundvyn.
**Nyckelinsikt:** nya kundlistan/kundvyn **konsumerar redan** `dossierBundle.driveFiles`.
Drive-jobbet = få filerna dit i rätt form. **Rör inte view-filerna.**

## ⛔ RÖR INTE (klara — konsumerar bara driveFiles)

Läs för att förstå kontraktet, men ändra **inte**:

- `public/major-arcana-preview/app/cco-v12-canon.js` — stora vyn (s7 Bilder, s9 Dokument, Foto-dokumentation)
- `public/major-arcana-preview/app/cco-v11-rk.js` — lilla railen (M Foton, N Filer)
- `public/major-arcana-preview/app/cco-v11-rail-adapters.js` — `buildPhotosFromDriveFiles`,
  `buildFilesFromDriveFiles`, `buildStepAssets`

## ✅ HIT ska Drive-arbetet (backend)

**Inkopplingspunkt — där `driveFiles` sätts ihop till bundlen:**

- `src/routes/ccoPatientMaster.js` **rad ~500–608**
  - `driveFiles = migrationIndexStore.getFilesForPersonnummer(patient.personnummer)`
  - `nativeAssetFiles = resolvePatientAssetStore()` …
  - `filesForUi = [...nativeAssetFiles, ...visibleIndexFiles]`
  - `return { … driveFiles: filesForUi, occasionTimeline: buildOccasionTimeline(filesForUi) … }`

**Drive-pipeline (själva Google Drive-logiken):**

- `src/ops/ccoDriveAttachPipeline.js`
- `src/ops/ccoDriveAssetInternalization.js`
- `src/ops/ccoDriveFolderCoupler.js`
- `src/ops/ccoDriveLinkBuilder.js`
- `src/ops/ccoAssetImportPipeline.js`
- asset-store: `src/ops/ccoPatientAssetStore.js`

## 📐 Kontrakt — varje `driveFiles[]`-objekt MÅSTE ha

```js
{
  id,
  fileType: 'image' | 'document' | 'journal_pdf',
  category: 'photo_before' | 'photo_after' | 'photo_during', // → fas FÖRE/EFTER/ÖVER
  originalFileName | fileName | name,   // namn — buildStepAssets matchar dok→steg PÅ NAMNET
  mimeType,                             // pdf/docx/xlsx-ikon i s9
  capturedAt | captureDate | occasionContext: { date }, // foto-datum (grupperar per besök)
  documentDate | dateLabel,            // dok-datum i s9
  status,                              // s9-chip: Klar / Vänta sign / Auto / Intern
  angle,                               // krona/hårlinje-vy
  // href byggs av railFileViewUrl(f) i adaptern — se nedan
}
```

Rätt `fileType` + `category` + `name` → filerna renderas automatiskt:
foton → s7 + Foto-dokumentation (grupperas per besök via `capturedAt`),
dokument → s9, och per-steg-räknare (📄/📷) härleds ur filnamnen.

## ⚠️ Fallgrop (annars syns foton inte)

- `buildFilesFromDriveFiles` filtrerar på **`it.name`** → dokument syns med namn även utan URL.
- `buildPhotosFromDriveFiles` filtrerar fortfarande på **`href`** → **foton kräver att
  `railFileViewUrl(f)` ger en URL** (id/relativePath). Säkerställ det, annars tappas fotot i s7.

## Multi-besök

Hanteras redan: `buildOccasionTimeline` grupperar filer per besök (datum), och kundvyn
grupperar foton per besök + visar "+N fler" när listor kapas. Drive behöver bara leverera
filerna med korrekt `capturedAt`/`occasionContext.date` — grupperingen sker automatiskt.
