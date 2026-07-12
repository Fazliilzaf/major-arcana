# ORD-67 · CF.9 skarp: createVoucher + dryRun-granskning + kvitto@-aktivering

**Status:** BYGGD (Claude 2026-07-13) · **Ägar-beslut samma dag:**
AI/OCR = OpenAI OK för leverantörsunderlag (se `AI-OCR-POLICY-BESLUT-2026-07-13.md`) ·
Kontoplan = **GO + dryRun först** · CM-mailkälla = **dedikerad kvitto@**

## Byggt

1. `cfoFortnoxClient.createVoucher(voucher)` — POST `/3/vouchers` (wrappar `{Voucher}`)
2. `cfoExpenseStore.markFortnoxSynced({id, fortnoxVoucherId})` — kvittens efter lyckad sync
3. `src/routes/cfoVoucherSync.js` (ny, enligt ORGANISATION §4 — ingen ny logik i monoliten):
   - `GET /api/v1/cco-cf/voucher-sync/dry-run` (OWNER) — verifikat-förslag, skriver INGET
   - `POST /api/v1/cco-cf/voucher-sync/run` (OWNER) — fail-closed via scaffoldens gates
4. `finance.html`: sektion **"Fortnox verifikat · dryRun"** — granska payloads (konto/debet/
   kredit/balans) innan skarp write. Tenant-alias löses via `resolveConnectedFortnoxTenantId`.

## Aktiveringsordning för SKARP write (i denna ordning, alla ägar-handlingar)

1. **Granska dryRun:** /finance.html → "Generera dryRun-rapport" → verifiera konton med revisorn
   (kontoplansförslag: `CF9-KONTOPLAN-FORSLAG-2026-07-13.md`)
2. **Utöka Fortnox-scope:** Developer Portal → integration Arcana → lägg till **Bokföring**-
   behörighet → sätt `FORTNOX_SCOPE="customer invoice payment bookkeeping"` i Render-env
   (kräver DEPLOY, ej restart!) → koppla från + Anslut igen i EKONOMI-segmentet
3. **Tänd gaten:** `ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED=true` i Render-env → deploy
4. Kör `POST /voucher-sync/run` manuellt → verifiera verifikaten i Fortnox → först därefter
   ev. schemaläggning (separat beslut)

## kvitto@ (CM-mailkälla — ägarens 10-minuters-jobb)

1. M365 Admin → Teams & grupper → **Delade postlådor** → Lägg till: `kvitto@hairtpclinic.com`
2. Ge dig själv medlemskap (för insyn). Ingen licens krävs för delad postlåda.
3. Render-env på arcana: `CM_MAIL_ACCOUNT=kvitto@hairtpclinic.com` → deploy
4. Vidarebefordra/peka leverantörskvitton dit → "Synka mail" i /finance.html (delta-syncen
   läser Inbox på kontot via befintliga Graph-app-behörigheten)

## Forbidden

Ingen skarp write utan stegen ovan · patientdata aldrig till extern AI · journal-routes orörda.

## Gates

`check:syntax` · `lint:no-bypass` · `node --test tests/cfo/ tests/cm/`
