# ORD-34 — Internalisera all Drive-dokumentation (Drive sunset)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (har Google Drive-inlogg + äger backend-moduler)
**Claude-spår:** PM + UAT (dry-run-inventory → verifiera → batchad ingest → flip native → kapa Drive)
**Prio:** P1 · datamigrering, fundament för Drive-fritt
**Ersätter:** ORD-33 (Drive-namn-refetch) — korrekta filnamn fås på köpet här, så ORD-33 blir överflödig.

---

## Bakgrund / mål

Google Drive **ska bort**. All patientdokumentation som ligger där (~7 000 patienter / ~18 000 filer) ska flyttas **internt i Arcana** och serveras därifrån. Vi ska aldrig länka till `drive.google.com` (frontend pekar redan på intern `/api/v1/cco-patient-master/file`, commit 1860cb09).

Infrastrukturen finns redan (delvis, bakom pilot-flagga) — **bygg vidare på den, bygg inte nytt:**

- `src/ops/ccoPatientAssetStore.js` — intern asset-store
- `src/ops/ccoAssetImportPipeline.js` — import-pipeline
- `src/ops/ccoSecureStorageProvider.js` — lagring
- `src/ops/ccoAssetReviewQueueStore.js` + `ccoAssetImportRunStore.js` — granskningskö + körningslogg
- `src/ops/ccoDriveJournalNativePilot.js` — serverar native assets i st f Drive-index (`applyNativeJournalFilesForPilot`, `resolvePatientAssetStore`, gate `pilotConfig.enabled`)
- `src/lib/googleDriveClient.js` — Drive-läsning (Codex har creds; `getDriveFileMetadata`/`getDriveFileName` finns redan från ORD-33)

## Scope (Codex)

1. **Skala import-pipelinen pilot → ALLA patienter.** För varje fil i migration-indexet med `driveFileId`: hämta **innehåll + korrekt namn** från Drive (medan Drive finns) → spara i `ccoPatientAssetStore` via secure storage. Korrekt UTF-8-namn (med å/ä/ö) lagras → mojibaken (literal `?`/`+?`, bevisat lossy) försvinner som sidoeffekt.
2. **Idempotent + batchad.** Hoppa redan-importerade (checksum/driveFileId-dedupe). Paginering + throttling mot Drive-rate-limits (75 ms + 429-backoff, som ORD-33). Körningslogg i `ccoAssetImportRunStore`. Osäkra matchningar → `ccoAssetReviewQueueStore`.
3. **Servera internt.** Generalisera native-pilot-logiken så `/file` + dossier-listan läser från asset-storen (ej Drive) när asset finns. Behåll Drive-proxy (`streamDriveFileToResponse`) som fallback ENBART tills migreringen är klar.
4. **Dry-run/inventory-läge först.** Endpoint/CLI som rapporterar: antal filer, hur många redan interna, hur många återstår, uppskattad tid — INGA skrivningar. Claude kör den → visar Fazli → GO för skarp ingest.
5. **Kapa Drive sist.** När 100 % internt + verifierat: flagga `pilotConfig.enabled` → alltid på, ta bort Drive-proxy-fallback. Egen sub-task efter verifiering.

## FÖRBJUDET

- Radera ALDRIG Drive-originalen (vi kopierar in, raderar inte källan).
- Ingen skarp ingest utan dry-run-inventory + Fazli-GO.
- Bygg inte ny lagring — använd `ccoPatientAssetStore` + `ccoSecureStorageProvider`.
- Rör inte patient↔fil-matchningen (drive-attach, ORD redan klar) — bara content+namn in.
- Inga credentials i kod/repo. Drive-creds via env på servern.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Idempotens-test (andra körning = 0 nya), dedupe-test, dry-run = 0 skrivningar.
- Commit refererar ORD-34.

## Rapport till Claude (UAT)

Commit-hash + ändrade filer + bevis: (a) dry-run-inventory utan skrivningar, (b) batchad ingest på 1 pilot-patient → asset i store + korrekt namn, (c) idempotens, (d) `/file` serverar internt när asset finns, (e) plan för Drive-cutover.

## Status

| Fas                                     | Status          |
| --------------------------------------- | --------------- |
| Order skapad (repo + Notion)            | KLAR 2026-06-08 |
| Codex: skala pipeline + native-serve    | Väntar          |
| Claude UAT (dry-run → ingest → cutover) | Väntar          |
