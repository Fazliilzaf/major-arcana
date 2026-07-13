# ORD-72 · Om-extraktion: hämta saknade belopp ur sparade källmail

**Status:** KLAR (Claude byggde 2026-07-13, ägar-beställning samma dag)
**Ägare:** Claude · **Prio:** P1 (blockerar ägar-flödet i finance.html)

## Ägar-beställning (ordagrant behov)

> "nej du kan läsa av det i inkomande mail. du får installera en sådan funktion"

Kontext: Foodora-kandidaten (m.fl.) promotades till CFO utan totalbelopp —
beloppet står i källmailet men extraktionen missade det. Ägaren ska inte
behöva fylla i belopp manuellt när underlaget redan finns arkiverat.

## Byggt

1. **`cmMailSync.reextractMissingAmounts({limit})`** — records som saknar
   `amountIncVat` läses om ur det SPARADE källmailet (`rawItem.rawBodyText`
   + ev. bilagor via harvest). Källa hittas via `record.rawItemId`, med
   fallback via dokumentets `rawItemId` (pre-ORD-68-records). Ledger-spårat
   (`reextracting` → done/failed). AI-budgeten respekteras
   (`CM_MAX_EXTRACT_PER_SYNC`).
2. **`cmStore.applyReextraction`** — fyller ENDAST tomma fält (belopp, moms,
   datum, leverantör, fakturanr …); befintliga/ägar-redigerade värden skrivs
   ALDRIG över. Flaggor räknas om (MISSING_TOTAL_AMOUNT m.fl. släpps när
   fältet fylls). Audit-händelse per record.
3. **CFO-backfill** — redan promotade utgifter (`record.cfoExpenseId`) får
   beloppet ifyllt via `cfoExpenseStore.updateExpense` OM `amountSek`
   fortfarande är tomt (actor `cm-reextract`). Aldrig överskrivning.
4. **Route** `POST /api/v1/cm/reextract-missing` (OWNER, limit ≤ 50).
5. **UI** — knappen "⟲ Hämta belopp ur mail" i CM-sektionen (finance.html),
   resultat-summering + `window.arcanaCfReload()`-refresh av CF-listan.
6. **Scheduler** — `cm_mail_sync`-jobbet kör nu även reextract (5/körning):
   helt automatiskt, inga knapptryck krävs. Statusraden visar "N belopp
   ifyllda".
7. **Tester** — 3 nya i `tests/cm/cmMailSync.test.js` (fyll-tomma-fält +
   aldrig-överskriv, CFO-backfill endast vid tomt belopp, skippedNoSource +
   ärliga extraktorfel). `extractDocumentImpl` injicerbar för test.

## Design-lås

- Om-extraktion ändrar ALDRIG ett satt värde — fyller bara tomrum.
- Avvisade records läses inte om (ägaren har dömt).
- Beslut förblir mänskliga: godkännande/export rör funktionen inte.

## Verifiering

- [x] 70/70 tester (cm + cfo) gröna lokalt
- [ ] CI grön på PR
- [ ] Prod: knapp-körning fyller Foodora-beloppet ur källmailet
- [ ] Prod: scheduler-körning visar "belopp ifyllda" i statusraden
