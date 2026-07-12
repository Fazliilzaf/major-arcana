# ORD-65 · CM kvitto-inbox i finance.html + tests/cm

**Status:** BYGGD (Claude 2026-07-12, denna PR) · **Beställare:** Fazli (svep-GO 2026-07-12)

## Byggt

1. **UI:** ny sektion **"CM · Mail- & kvittointag"** i `public/finance.html` (ovanför Receipt Inbox):
   KPI-rad (inbox / behöver granskas / överlämnade) + kandidatlista med leverantör/belopp/typ/
   confidence/flaggor + **"→ CFO"**-knapp per rad (POST `/api/v1/cm/expense-records/:id/promote`)
   - "Synka mail"-knapp (POST `/api/v1/cm/mail-sync`). Samma vellum-DNA och
     `credentials:'same-origin'`-mönster som resten av sidan. Ingen ny silo-sida.
2. **Tester (nya `tests/cm/`):**
   - `cmStore.test.js` — dedupe, flaggor, handed_off-livscykel, syncState-persistens, rotation.
   - `cmCfoHandoff.test.js` — fältmappning, kategorisynonymer, vatRate-validering,
     promote-integration mot riktig `cfoExpenseStore` (tmp-fil, inget nät).
   - `cmMailSync.test.js` — fixture-connector (delta-pages, attachment-content), inga nätanrop;
     verifierar cursor-persistens, dedupe, original-arkivering, ledger.

## Forbidden

Ingen live-AI i test (OPENAI_API_KEY får inte krävas) · inga ändringar i övriga finance-sektioner.

## Gates

`npm run check:syntax` · `node --test tests/cm/` · manuell UAT: /finance.html visar CM-sektionen.
