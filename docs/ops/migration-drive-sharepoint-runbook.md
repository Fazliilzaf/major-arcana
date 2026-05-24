# Migration — Drive / SharePoint runbook (C1–C5)

Uppdaterad: 2026-05-20  
Tenant: `hair-tp-clinic`

## Översikt

| ID | Uppgift | Kommando | Klart när |
|----|---------|----------|-----------|
| C1 | Drive API scan | `npm run migration:preflight-drive` → `npm run migration:scan-drive-api` | `migration-index.json` har ≥20 profiler |
| C2 | Bulk journalimport | `npm run migration:import-journals` | Journal store har `historical_import`-poster |
| C3 | Spot-check | `npm run migration:spot-check` | ≥20 overlap, 0 avvikelser i sample |
| C4 | SharePoint archive | `npm run migration:sync-sharepoint` | `verify:sharepoint-archive` grön |
| C5 | PDL + EU region | `docs/legal/pdl-mdr-assessment.md` §6 | Frankfurt dokumenterad |

## Förutsättningar

### Google Drive (C1)

1. Skapa service account i Google Cloud (Drive API readonly).
2. Ladda ner JSON-nyckel → spara utanför repo (t.ex. `~/secrets/arcana-drive-sa.json`).
3. Dela journalmappen i Drive med service account `client_email`.
4. Hämta folder ID från Drive URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.

```bash
# .env eller Render
ARCANA_GOOGLE_DRIVE_FOLDER_ID=
ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json
ARCANA_MIGRATION_INDEX_PATH=/var/data/arcana/migration-index.json   # prod
```

### Cliento + MA-Archive

```bash
ARCANA_MIGRATION_ROOT=~/Code/MA-Archive
# Cliento CSV i MA-Archive/cliento/
```

## Steg-för-steg (lokal → prod)

### 1. Preflight (C1)

```bash
npm run migration:preflight-drive
```

Förväntat: PASS credentials, access token, root folder med barn.

### 2. Full scan (C1)

```bash
npm run migration:scan-drive-api
# eller begränsad verify:
node scripts/migration/scanGoogleDriveApi.js --verify-only
```

Output: `data/migration-index.json` med `stats.totalProfiles`, `stats.journalPdfs`.

### 3. Cliento + Drive merge

```bash
npm run migration:import
```

### 4. Spot-check (C3)

```bash
npm run migration:spot-check
# CI fixture:
npm run migration:spot-check -- --fixture tests/fixtures/migration-index-sample.json --min 2
```

### 5. Bulk journalimport (C2)

```bash
# Dry-run först
npm run migration:import-journals -- --dry-run --limit 10

# Full bulk
npm run migration:import-journals
# Med bilder (större):
npm run migration:import-journals -- --include-images
```

### 6. Hela pipelinen (C1+C2+C3)

```bash
npm run migration:run-bulk
# Planera utan skrivning:
npm run migration:run-bulk -- --dry-run
# Hoppa scan om index redan finns:
npm run migration:run-bulk -- --skip-scan
```

### 7. SharePoint (C4)

```bash
npm run migration:sync-sharepoint
npm run verify:sharepoint-archive
```

Manifest i repo: `docs/migration/sharepoint-manifest.json`  
Fysisk arkivkopia: `~/Code/MA-Archive/sharepoint/`

### 8. Prod verify

```bash
# Kräver OWNER-token för /cco-migration/status
ARCANA_OWNER_TOKEN=... npm run verify:migration-prod
```

## Prod (Render)

1. Sätt env: `ARCANA_GOOGLE_DRIVE_FOLDER_ID`, `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` (Render secret file).
2. Kör scan mot prod disk path (SSH/one-off job) eller lokal scan + `scp` av `migration-index.json` till `/var/data/arcana/`.
3. OWNER i CCO: **Importera Drive-profiler** + **Importera historik** via `/api/v1/cco-migration/*` eller CLI mot prod data volume.

## Felsökning

| Symptom | Åtgärd |
|---------|--------|
| `Drive API saknar konfiguration` | Kör preflight, kontrollera env |
| `403 insufficientPermissions` | Dela Drive-mapp med service account email |
| Spot-check overlap < 20 | Cliento personnummer matchar inte Drive-mappstruktur — kontrollera mappnamn `Namn YYYYMMDD-XXXX` |
| `403` på migration/status | Använd OWNER-token, inte STAFF |
| SharePoint archive saknas | `npm run migration:sync-sharepoint` |

## Relaterat

- `docs/strategy/cco-patient-journal-build-plan.md`
- `docs/strategy/ma-document-placement-plan.md`
- `docs/legal/pdl-mdr-assessment.md` §6
