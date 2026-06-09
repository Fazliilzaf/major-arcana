# ORD-43 — Foto-miniatyrer (HEIC + JPEG) så bilder syns i kundkortet

**Skapad:** 2026-06-09 (Claude PM)
**Assignee:** Codex (backend — wire thumbnail-gen i import-pipeline + backfill)
**Claude-spår:** kortet visar redan `<img src=/api/v1/cco/assets/:id/thumbnail>` med fallback — tänds automatiskt när thumbnailKey finns.
**Prio:** P2 · gör Foto + fotosessioner i Journal helt visuella (båda formaten)
**Relaterat:** gemensamma kortets Foto/Journal (commit 34d96f43), ORD-41 (asset-import), [[project_gemensamt_kort_live_render_2026_06_09]]

---

## Mål / bakgrund

Kundkortets Foto-rutor + Journal-fotosessioner försöker visa en **inline-miniatyr** via `GET /api/v1/cco/assets/:id/thumbnail`. Men för **Drive-importerade foton** (Joacims `.HEIC` m.fl.) saknas `thumbnailKey` → ingen miniatyr, och HEIC förhandsvisas inte i webbläsaren. Vi måste kunna **hantera båda formaten** (HEIC + JPEG/PNG/WebP).

**Bra nyheter — det mesta finns redan:**

- `sharp` (0.34.5) är installerat (HEIC-stöd via libvips/libheif).
- `secureStorage.generateThumbnailIfImage(storageKey, mimeType)` finns (`ccoSecureStorageProvider.js` rad 329) — läser valfritt `IMAGE_MIMES` (inkl `image/heic`), resize 320, skriver **`.thumb.jpg`** (JPEG q70). Hanterar alltså HEIC→JPEG + vanliga format.
- Thumbnail serveras av `GET /api/v1/cco/assets/:assetId/thumbnail` (404 om ingen `thumbnailKey`).
- `generateThumbnailIfImage` **används redan** av scalp-analys/foto-review.

**Gapet:** import-pipelinen (`ccoAssetImportPipeline.js`) anropar **aldrig** `generateThumbnailIfImage` → Drive-foton får aldrig thumbnailKey. Plus: redan importerade foton behöver backfill.

## Scope (Codex — backend)

### 1. Wire thumbnail-gen i import-pipelinen

I `ccoAssetImportPipeline.js`, för **bild-assets** (kategori `photo_*` / `IMAGE_MIMES`): efter `storage.putObject(...)`, anropa `storage.generateThumbnailIfImage(putResult.storageKey, sourceRecord.mimeType)` och sätt `thumbnailKey` i `assetStore.addAsset({... thumbnailKey ...})`. Gäller **både HEIC och JPEG/PNG/WebP** (utilen avgör via mime). Misslyckas konverteringen → `thumbnailKey: null` (graceful, kortet faller tillbaka på fallback-ruta).

### 2. Backfill för redan importerade foton

Script `scripts/run-asset-thumbnail-backfill.js` (server-side, mot `/var/data`): iterera bild-assets som saknar `thumbnailKey` (t.ex. Joacims + alla ~18k Drive-foton), kör `generateThumbnailIfImage` på originalets storageKey, uppdatera `thumbnailKey`. **Batchad** (`--limit/--offset`), **idempotent** (hoppa de som redan har thumbnailKey), rapport (skapade/hoppade/misslyckade). Kör i batchar via prod (där `/var/data` + sharp + originalen finns).

### 3. Verifiera sharp-HEIC på Render

Bekräfta att sharp 0.34 prebuilt på Render dekodar HEIC (libheif medföljer normalt). Om HEIC-dekodning fallerar → utilen returnerar null idag (ingen krasch), men då måste libheif/libvips-stöd säkras i build. **Flagga** i rapporten om HEIC-dekodning inte funkar i prod-miljön.

### 4. (Valfritt) Browsbar fullstorleks-JPEG

För klick-att-öppna i webbläsaren: HEIC-originalet förhandsvisas inte i Chrome. Överväg en `viewKey` (JPEG-version i lagom storlek) eller en konverterande `/file`-variant för bilder, så "öppna bild" visar en JPEG i browsern. Ej blockerande för miniatyrerna.

## FÖRBJUDET / säkerhet

- Rör **inte** originalfilerna (thumbnails skrivs som separata `.thumb.jpg`).
- Samma RBAC på thumbnail-endpoint som download (redan så).
- Ingen extern AI på bildinnehåll. Ingen PII i URL:er.
- Backfill får ej överskrida secure-storage-diskens utrymme — övervaka (thumbnails är små, men 18k st ska få plats).

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: (a) import av .heic → `thumbnailKey` satt + thumb-endpoint returnerar JPEG; (b) import av .jpg → samma; (c) backfill idempotent (kör 2× → andra gången 0 nya); (d) korrupt/ej-bild → `thumbnailKey: null`, ingen krasch.
- Commit refererar ORD-43.

## Rapport till Claude (UAT)

Commit + filer + bevis: (a) ny bild-import får thumbnailKey, (b) backfill genererade N thumbnails för befintliga foton (inkl HEIC), (c) HEIC-dekodning funkar i prod (eller flaggat). Claude UAT:ar: öppna Joacims kort → Foto-rutorna + Journal-fotosessionerna visar **riktiga miniatyrer**.

## Status

| Fas                                           | Status          |
| --------------------------------------------- | --------------- |
| Order skapad (repo + Notion)                  | KLAR 2026-06-09 |
| Codex: wire generateThumbnailIfImage i import | Väntar          |
| Codex: backfill-script + körning (prod)       | Väntar          |
| Codex: verifiera sharp-HEIC på Render         | Väntar          |
| Claude: UAT foton i kortet                    | Väntar          |
