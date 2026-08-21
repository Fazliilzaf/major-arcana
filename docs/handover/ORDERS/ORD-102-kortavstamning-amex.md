# ORD-102 · Kortavstämning — Amex-CSV mot utgifterna

**Status:** BYGGD (Claude 2026-08-21) · **Prio:** P1 (revisorsunderlag)

## Ägar-beställning

CSV-exporter från båda Amex-korten (SAS Elite ····86005, Platinum ····61008,
hela 2026 — 788 dragningar) ska stämmas av mot utgifterna i CFO. Omatchade
dragningar = köp som saknar kvitto; revisorn får komplett kort-mot-kvitto.

## Byggt

1. `src/cfo/cfoCardReconciliation.js` — Amex-CSV-parser (svenskt beloppsformat,
   MM/DD/YYYY, citerade fält, kredit/betalning filtreras), dedupe med ordinal
   (samma fil kan om-importeras; äkta dubbelköp samma dag bevaras), store i
   `stateRoot/cfo-card-reconciliation.json`, matchningsmotor: auto-match vid
   entydig träff (belopp ±1 kr, datum ±7 d), annars förslag (±14 d) med
   leverantörs-hint. Rejected-utgifter deltar aldrig.
2. `src/routes/cfoCardReconciliation.js` — POST /cco-cf/card-import,
   GET /cco-cf/card-reconciliation, POST /card-transactions/:id/match|ignore
   (OWNER). Monterad i server.js intill voucher-sync.
3. finance.html: sektionen "Kortavstämning · Amex" — importera CSV (flera
   filer, kortRef ur filnamnet), statsrad (matchade / saknar kvitto + summa /
   ignorerade), lista omatchade med förslagsknappar + Ignorera (skäl krävs).
4. Tester: 3 st (parser/dedupe, auto-match+förslag+rejected-skydd,
   ägar-beslut persisteras).

## Design-lås

- Importen skapar ALDRIG utgifter — bara matchstatus. Beslut är ägarens.
- Om-import är idempotent. Original-CSV ligger kvar hos ägaren.

## Verifiering

- [x] 3/3 tester gröna lokalt
- [ ] CI grön, merge, deploy
- [ ] Prod: importera båda 2026-filerna → stats + omatchade-lista rimlig
