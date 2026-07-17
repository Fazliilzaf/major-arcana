# ORD-75 · CP no-show: Cliento-delmängd + synlig täckningsgrad

**Status:** PR FÖRBEREDD · **MERGE BLOCKERAD** tills Drive-ingest-frysen släpper (samma gate som ORD-74)  
**Repo:** major-arcana · **Prio:** P2 · **Byggare:** CURSOR  
**Notion:** [ORD-75 · CP no-show](https://app.notion.com/p/3a0060ccc15b81d7af7df87f5397b9fc)  
**OBS:** Separat från CM-ORD-75 (underlag/avdragsbevis) — samma ORD-nummer, annat spår.  
**Kompis:** ORD-76 (betalande vs TP-paket) levereras i samma PR-gren.

---

## Inventering (check-before-code)

| Del                                   | Finns? | Var                            | Gap                     |
| ------------------------------------- | ------ | ------------------------------ | ----------------------- |
| Gateway `/monitor/clinic-performance` | hel    | `src/routes/monitor.js`        | —                       |
| Bokningsinsamling + same-day          | hel    | `src/ops/clinicPerformance.js` | —                       |
| `bookingSourceSupportsNoShow`         | hel    | samma fil (~rad 132)           | bara cliento/tom        |
| no-show vid blandade källor           | del    | `composeClinicMetrics`         | **nullar hela raten**   |
| Täckningsgrad i payload               | nej    | —                              | `noShowCoverage` saknas |
| CEO-fotnot för coverage               | nej    | arcana-ceo-agent               | Claude efter gateway-PR |

---

## Bakgrund

Ärlighetsregeln i gatewayn var korrekt: juli blandar Cliento + `cco_booking_engine` / `cco_treatment_encounter`, och systemet vägrade visa en siffra som bara täckte en del utan att säga det. Cliento har no-show-sanning (t.ex. 19 st i juli). ORD-75 räknar på Cliento-delmängden och visar täckningen öppet.

## Krav (DoD)

1. `noShowRate` = no-shows ÷ **no-show-kapabla** bokningar (Cliento / saknad source), same-day-fönster oförändrat.
2. Payload: `noShowCoverage: { current: { capable, total }, previous: { capable, total } }`.
3. 0 kapabla → `noShowRate` null (ingen fabricering). Coverage döljs aldrig när `< 100 %` (komplettering i `dataNote`).
4. CEO-värdet flyter via befintligt `noShowRate`-kontrakt. Coverage-fotnot = separat Claude-PR efter merge.
5. Tester: blandat → rate ur delmängd + coverage · enbart cliento → 100 % · 0 kapabla → null · övriga KPI same-day oförändrade.

## Forbidden

- Merga till main under Drive-ingest-frysen.
- Fabricera no-show på engine/encounter-rader.
- Dölja täckning `< 100 %`.
- Ändra Consent/CEO-UI i denna PR (Claude tar fotnoten).

## Referens

- `src/ops/clinicPerformance.js` — `composeClinicMetrics`, `bookingSourceSupportsNoShow`
- Cliento juli: 19 no-show / 560 bokningar (båda varumärken)
- CEO: `arcana-ceo-agent/lib/clinic-metrics.ts` `coerceLive`
