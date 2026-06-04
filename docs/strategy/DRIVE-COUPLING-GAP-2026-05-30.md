# Drive-Coupling Gap

*Genererad: 2026-05-30 · P0.3 — koppling till Google Drive utan service-account*
*Styrande regel: `.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done` punkt 1 & 4.*

## Sammanfattning

CCO kan idag **predikera** Drive-path per encounter utan service-account, men kan inte:

1. Verifiera att mappen faktiskt finns.
2. Enumerera filer (PDFs, bilder) inuti mappen.
3. Skriva tillbaka journal-PDF eller bilder till Drive.

Master-patient-card-strukturen (`ccoMasterPatientCardStore`) fylls med
`predictedDrivePath` + `driveStatus: 'pending_service_account_auth'` per
encounter. När service-account aktiveras kan ett separat job (P0.4 i
cutover-plan) byta `driveStatus` till `verified` och fylla `folderId` +
fil-listor.

## Vad som krävs för full Drive-coupling

| Krav | Detalj |
|---|---|
| Env-variabel `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` | Path till JSON-key för dedicated service-account `arcana-drive-readonly@<project>.iam.gserviceaccount.com` |
| Drive-medlemskap för SA | SA måste delas in i Shared Drive `Kunder HTP` (folder-ID `0APPck7epTcZ-Uk9PVA`) som **Contributor** (eller minst Viewer för read-only crawl) |
| Env-variabel `ARCANA_GOOGLE_DRIVE_FOLDER_ID` | Root folder-ID `0APPck7epTcZ-Uk9PVA` (Kunder HTP shared drive) |
| Script-körning | `node scripts/migration/scanGoogleDriveApi.js --output Migration-data/drive-inventory-htp.json` |
| Output | `Migration-data/drive-inventory-htp.json` (utanför repo, inte gitignored — separat säkerhetsperimeter) |

## Var datan kommer ifrån när SA finns

```
Google Drive (Shared Drive "Kunder HTP")
  ↓ Drive API v3 files.list (recursive)
Migration-data/drive-inventory-htp.json
  ↓ scripts/migration/buildDriveFolderIndex.js
data/cco-drive-folder-index.json
  ↓ scripts/migration/matchDriveToPatients.js
   (matchning: patient-namn-mapp + behandlingsdatum-mapp + brand)
data/cco-patient-drive-mappings.json   (gitignored, per-patient folderId)
  ↓ ccoMasterPatientCardStore.getCard()
master patient-card { driveFolder: { folderId, driveStatus: 'verified', files: [...] } }
```

## Hur master patient-card auto-fylls

`ccoMasterPatientCardStore` är read-only-aggregator. Den hämtar Drive-data
från `data/cco-patient-drive-mappings.json` när filen finns:

1. **Idag (P0.3 — service-account saknas):**
   - `driveFolder.folderId = null`
   - `driveFolder.driveStatus = 'pending_service_account_auth'`
   - `driveFolder.predictedPath = 'Kunder HTP/TP/Bokade/Hair TP Clinic 2026/Maj 2026/'`
   - `driveFolder.searchUrl = '<deeplink till närmaste kända mapp + sökquery>'`
   - `driveFolder.existsConfidence = 'high' | 'medium' | 'low' | 'unknown'`

2. **Efter P0.3 service-account-aktivering:**
   - `driveFolder.folderId = '<faktisk Drive folder-ID>'`
   - `driveFolder.driveStatus = 'verified'`
   - `driveFolder.files = [{ fileId, name, mimeType, modifiedTime }]`
   - `driveFolder.existsConfidence = 'verified'`

## Predikterad-path-heuristik (idag)

`src/ops/ccoDrivePathPredictor.js#predictDrivePath`:

| Brand | Treatment-type | Year | Confidence | Kommentar |
|---|---|---|---|---|
| `hair_tp` | `tp` | 2026 + Maj | **high** | Känd folder-ID `1Gof_xzKOvdote1DCjb-riNozlvpLgjbh` |
| `hair_tp` | `tp` | 2026 (annan månad) | **medium** | Känd årsfolder `10sOs6wyliXiNs1o2SdJfn61ctXaBG0gH` |
| `hair_tp` | `tp` | annat år | **low** | Känd `Bokade`-folder, men inte år |
| `hair_tp` | annan typ | — | **low** | Faller tillbaka på brand-root |
| `curatiio` | * | — | **unknown** | Root-folder-ID ej tilldelad ännu (`CURATIIO_ROOT_TBD`) |

## Kvarvarande Drive-blockerande arbete

| # | Uppgift | Beroende | Effort |
|---|---|---|---|
| 1 | Owner-godkänd service-account-konfig i GCP | extern aktör | 0,5 d |
| 2 | Lägg till SA som medlem i Shared Drive `Kunder HTP` | (1) | 10 min |
| 3 | Kör `scanGoogleDriveApi.js` → `Migration-data/drive-inventory-htp.json` | (2) | 30 min |
| 4 | Bygg `data/cco-drive-folder-index.json` från inventory | (3) | 0,5 d |
| 5 | Patient-namn + datum-matchning → `data/cco-patient-drive-mappings.json` | (4) + customer-store | 1 d |
| 6 | Curatiio root-folder-ID från owner | extern aktör | 5 min |
| 7 | Verifiera `ccoMasterPatientCardStore.driveFolder.driveStatus = 'verified'` på sample 100 patienter | (5) | 0,5 d |

**Total: ~3 dagar efter att SA är aktiverad.**

## Referenser

- `docs/strategy/DRIVE-INVENTORY-REPORT-2026-05-30.md` — Drive-struktur + folder-IDs
- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md#3` — Drive-mapp + fil-räkning (BLOCKED)
- `src/ops/ccoDrivePathPredictor.js` — path-prediktion (denna PR)
- `src/ops/ccoMasterPatientCardStore.js` — master-kort-aggregator (denna PR)
- `src/ops/ccoDriveLinkBuilder.js` — befintliga deeplinks
- `scripts/migration/scanGoogleDriveApi.js` — Drive-API crawl-script (väntar på SA)

---

*Status: GAP DOCUMENTED · path-prediktion fungerar utan SA · full Drive-coupling kräver service-account-aktivering*
