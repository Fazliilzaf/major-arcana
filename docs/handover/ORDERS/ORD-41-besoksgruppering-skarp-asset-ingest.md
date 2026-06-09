# ORD-41 — Besöksgruppering ur mappnamn + skarp asset-ingest (prod)

**Skapad:** 2026-06-09 (Claude PM)
**Assignee:** Codex (backend — internalisering + encounter-enrichment + prod-endpoint)
**Claude-spår:** frontend renderar besökssektioner i högerpanelen (dossiern) + UAT
**Prio:** P1 · gör Drive-sunset skarp + matar kundkortets per-besök-vy
**Relaterat:** ORD-34 (internaliserings-modul + lokal testbatch UAT:ad), ORD-36 (journal-metadata X/N), Drive-sunset-projektet, "Besök · tidslinje" i kundkortet

---

## Mål / bakgrund

Drive ska bort; all dokumentation internt. Kundkortets **högerpanel (dossier)** ska visa **sektioner per besök** — varje gång kunden varit här = ett avsnitt med just det besökets journal, foton och filer. Nya behandlingar lägger till en ny sektion; **gamla Drive-filer ska bakas in i samma upplägg** och kopplas till befintliga panel-funktioner (öppna stor vy, Sammanfatta, journal X/N, Ta bild, klickbara filer/foton).

Drive-mapparna ÄR redan per besök, med datum + typ + session i klartext i mappnamnet:

- `Joacim Benjaminsson -2025-12-18 PRP 3` → besök **2025-12-18**, typ **PRP**, session **3**
- `Joacim Benjaminsson - 2025-10-07 OP` → besök **2025-10-07**, typ **OP**
- HD-filer i månadsmapp: `April 2026/April 5/Alexander Lavesson - 19900422-5570/Hälsodeklaration-...pdf` → besök **2026-04-05**

**UAT-fynd 2026-06-09 (lokal testbatch, 50 filer):** nedladdning + intern lagring funkar (blobbar hash-verifierade, fileSize stämmer, storageKey rent), filnamns-mojibake fixad. MEN `documentDate` sätts felaktigt till **Drive modifiedTime** (alla ~2026-03-24) i stället för mappnamnets datum, och encounter-fälten fylls inte. Det är de två blockerarna nedan.

## Scope (Codex — backend)

### 1. Datum-källa (fix i `src/ops/ccoDriveAssetInternalization.js`)

`metadataDocumentDate()` + `normalizeDriveAssetRow()` använder idag `metadata.modifiedTime` som primär → fel. Ändra prioritetsordning för `documentDate`:

1. **ISO i mappnamn** (närmaste förälder): `/(\d{4}-\d{2}-\d{2})/` på `originalDrivePath` → `-2025-12-18 PRP 3` → `2025-12-18`.
2. **Månadsnamn + dag-mapp**: `<Månad> YYYY/<Månad> D` (sv: januari…december) → `April 2026/April 5` → `2026-04-05`.
3. **Unix-epoch i filnamnet**: `/-(\d{10})-/` → `1766080815` → `2025-12-18`.
4. **Drive modifiedTime** (sista utväg).

Sätt alltid `documentDateSource` = `folder_iso | folder_month | filename_epoch | drive_modified`.

### 2. Encounter-enrichment ur mappnamnet

Parsa mappnamn `<Namn> -?<YYYY-MM-DD> <TYP> <N?>` och fyll de befintliga (men tomma) asset-fälten:

- `treatmentType`: OP / PRP / DHI / FUE / Microneedling / Konsultation (matcha kända).
- `sessionNumber`: `PRP 3` → `3`.
- `visitLabel`: t.ex. `PRP 3` / `OP`.
- `encounterId`: **stabil** nyckel (t.ex. hash av `patientId + documentDate + treatmentType`) så att journal + foton + filer från **samma besök delar encounterId**.

### 3. Path-avkodning före parsning

`originalDrivePath` har kvar mojibake (`Ha??lsodeklaration`, `Torbj+?rn`). Avkoda korrekt (samma fix som filnamnet redan fått) INNAN datum/typ-parsning.

### 4. Naming/kategori-pipeline vid skarp ingest

Testbatchen gav alla `NEEDS_REVIEW` + `category='other'` (master-validering kördes ej). Vid skarp ingest: kör full naming/kategori-pipeline så filer auto-klassas (Hälsodeklaration→HD, Journal-_→journal, IMG\__.HEIC→foto). Auto-godkänn tydliga fall (filnamns-prefix matchar mall); osäkra → review. Mål: granskningskön hanterbar, inte 23k.

### 5. Dossier-bundle exponerar besöksgruppering

Lägg `encounterId / visitLabel / treatmentType / documentDate / documentDateSource` på varje fil/journal/foto i dossier-bundle (eller en grupperad `encounters: [{encounterId, date, treatmentType, sessionNumber, label, files[], journals[], photos[]}]`), så frontend kan rendera besökssektioner och knyta rätt fil till rätt besök.

### 6. Prod-skrivväg (steg 2-endpoint)

`POST /api/v1/cco-patient-master/assets/internalize` — `requireAuth` + `requireRole(ROLE_OWNER)`, body `{ limit, offset, dryRun (default true) }`, kör `internalizeDriveAssets` mot **app.locals-storarna** (`/var/data` via env) + `driveClient`. `dryRun:false` kräver `confirmText: "INTERNALIZE ASSETS"`. Returnerar samma rapport-shape som CLI:n. Audit-event per körning.
**Gate:** kräver Drive-creds på Render (`ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` + `ARCANA_GOOGLE_DRIVE_FOLDER_ID`) — ägare sätter dem (Claude/Codex matar ej in creds).

## FÖRBJUDET

- Radera ALDRIG Drive-original.
- Auto-publicera ALDRIG `*Bilder | Delas med kund` till kund (intern lagring ≠ kundvisning).
- Ingen mock-data. Skriv inget mot `/var/data` från lokalt CLI (lokal testväg = slängbara `/tmp`-paths).
- Skarp prod-körning sker bara via endpointen med `confirmText` + `dryRun:false`, aldrig automatiskt.

## Idempotens / säkerhet

- Dedupe på `originalDriveFileId` + `contentHashSha256` (finns redan via `buildExistingAssetIndex`).
- Batchad (`limit`/`offset`), rollback-rapport.
- HEIC-foton (1,6–1,8 MB): notera `thumbnailKey`/JPEG-miniatyr som **följdpunkt** (Chrome renderar ej HEIC nativt) — ej blockerande för ingest.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: (a) fil i `-2025-12-18 PRP 3`-mapp → `documentDate=2025-12-18`, `treatmentType=PRP`, `sessionNumber=3`, `documentDateSource=folder_iso`; (b) HD i `April 2026/April 5` → `2026-04-05`, `folder_month`; (c) fil utan mappdatum → filnamns-epoch; (d) samma besök → delad `encounterId`.
- Commit refererar ORD-41.

## Rapport till Claude (UAT)

Kör om lokal testbatch (slängbara `/tmp`-paths) + leverera report-json + 5 sample-assets som visar korrekt `documentDate`/`documentDateSource`/`treatmentType`/`sessionNumber`/`encounterId`. Claude UAT:ar mot mappnamnen. DÄREFTER (separat GO) skarp prod-körning via endpoint i batchar.

## Claude-spår (frontend, separat)

Rendera besökssektioner i `.kkref .doss` grupperade på `encounterId`/datum, rubrik `<datum> · <typ> <session>`, varje fil/journal/foto wirad till **befintliga** handlers (`data-kk-open-storvy`, Sammanfatta, Ta bild, journal X/N, `data-kk-jump`). Additivt, ingen ny dataväg.

## Status

| Fas                                        | Status          |
| ------------------------------------------ | --------------- |
| Order skapad (repo + Notion)               | KLAR 2026-06-09 |
| Codex: datum-källa + encounter-enrichment  | Väntar          |
| Codex: naming-pipeline + bundle-gruppering | Väntar          |
| Codex: prod-endpoint (gated Drive-creds)   | Väntar          |
| Claude UAT lokal omkörning                 | Väntar          |
| Claude frontend: besökssektioner i panelen | Väntar          |
| Skarp prod-ingest (separat GO)             | Väntar          |
