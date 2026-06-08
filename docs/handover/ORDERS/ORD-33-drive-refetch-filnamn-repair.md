# ORD-33 — Drive re-fetch: reparera mojibakade filnamn (hela CCO)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Cursor (write — ny Drive-klient-funktion + ny repair-endpoint + store-metod)
**Claude-spår:** UAT efter commit (dry-run mot 1 patient → verifiera → throttlad apply)
**Prio:** P1 · datakvalitet, ej flaggat (men dry-run-default = ingen skrivning utan confirm)
**Blockeras av:** —

---

## Bakgrund (bevisat 2026-06-08)

Drive-importerade filnamn i migration-indexet är mojibakade: å/ä/ö ersattes med **ren ASCII** redan vid importen. Verifierat via char-codes på prod: `"Journal ??? Abdulaziz Cabdi Kumi ??? 2024-01-10.pdf"` → tecknen är `63,63,63` (literal `?`), och `"Friskf+?rs+?kran H+?rtransplantation"` → `+?` (literal `+` `?`). INGET Unicode-ersättningstecken (U+FFFD) — bokstäverna är **borta**, går ej att avkoda fram. Datumen överlever (siffror).

Enda riktiga fixen: **hämta originalnamnen från Google Drive igen** via `driveFileId` (Drive har korrekt UTF-8). När indexet är reparerat försvinner mojibaken **överallt i CCO** eftersom alla vyer (Filer, Foton, Besök-tidslinje, journal-listan, GDPR-export) läser fileName därifrån.

Berör ~7 000 patienter / ~18 000 filer (de med `driveFileId`). Måste batchas/throttlas mot Drives rate-limits — INTE ett enda request.

## Scope (write)

1. **`src/lib/googleDriveClient.js`** — ny export `getDriveFileName({ driveFileId })`:
   - Använd `getConfiguredDriveAccessToken()` (finns).
   - `GET https://www.googleapis.com/drive/v3/files/{fileId}?fields=name&supportsAllDrives=true` med `Authorization: Bearer <token>`.
   - Returnera `{ ok, name, error }`. Hantera 404/403/429 (rate-limit → backoff).
   - Valfritt: `getDriveFileMetadata({ driveFileId, fields })` generellt, så `name` är ett specialfall.

2. **`src/ops/ccoMigrationIndexStore.js`** — ny metod `updateFileName({ fileId, name })` (och ev. `bulkUpdateFileNames(deltas)`):
   - Uppdaterar `fileName` på fil-recordet i `state.files` + i `filesByPersonnummer`-mappen, persisterar (samma save-väg som övriga muteringar).
   - Idempotent: om `name` redan == lagrat, no-op.
   - Returnera antal ändrade.

3. **`src/routes/ccoPatientMaster.js`** — ny endpoint `POST /cco-patient-master/repair-filenames` (ROLE_OWNER):
   - Body: `{ scope: 'patient'|'all', patientId?, personnummer?, dryRun?: boolean (DEFAULT true), confirmText?, batchSize?: number (default 50), startOffset?: number }`.
   - **dryRun=true (default):** läs filer i scope, hämta Drive-namn per `driveFileId`, returnera `[{ id, driveFileId, old, new, changed }]` + summering. INGA skrivningar.
   - **dryRun=false:** kräver `confirmText === 'REPAIR FILENAMES'`. Skriv tillbaka via `updateFileName`. Returnera antal ändrade + ev. rollback-lista (gamla namn) för loggning.
   - **Throttling:** max `batchSize` filer per anrop + `startOffset` för paginering (samma mönster som drive-attach bulk-apply). Liten delay mellan Drive-anrop (t.ex. 50–100 ms) + backoff vid 429.
   - Audit-logga (owner, scope, antal, dryRun).
   - Filer utan `driveFileId` hoppas över (rapporteras som `skipped`).

## FÖRBJUDET

- Ingen skrivning när `dryRun` (default) — endast läsning.
- Rör INTE filinnehåll/PDF:er, bara `fileName`-fältet.
- Ingen mass-apply i ETT request — måste batchas (max 50/anrop) så Drive-rate-limits respekteras.
- Inga ändringar i hur filer matchas till patienter (drive-attach) — bara namn.
- Ingen ändring av `extractFileOccasionContext`/tidslinjen (den funkar; datum kommer ur siffror).

## Gates (måste passera)

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit` (lägg test för `getDriveFileName` mockad + `updateFileName` idempotens + endpoint dryRun-default)
- Commit-meddelande refererar ORD-33.

## Rapport till Claude (UAT)

Commit-hash + ändrade filer + bevis på:
(a) `dryRun` är default och gör 0 skrivningar,
(b) dry-run mot 1 patient (t.ex. Abdulaziz Cabdi Kumi) returnerar korrekta gammalt→nytt-diffar med riktiga å/ä/ö,
(c) apply kräver `confirmText` och är idempotent,
(d) batchning/paginering funkar + 429-backoff.

Claude kör sedan: dry-run på 1 patient → visar Fazli → GO → throttlad apply över alla.

## Status

| Fas                          | Status          |
| ---------------------------- | --------------- |
| Order skapad (repo + Notion) | KLAR 2026-06-08 |
| Cursor: Drive-fn + endpoint  | Väntar          |
| Claude UAT (dry-run → apply) | Väntar          |
