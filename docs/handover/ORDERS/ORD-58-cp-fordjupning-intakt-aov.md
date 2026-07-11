# ORD-58 · Clinic Performance-fördjupning: intäkt/AOV (fas 1) → Beläggning (fas 2)

Status: awaiting-fazli (kräver frys-undantag) · Byggare: CURSOR (klinik-kod) · Beställare: Fazli via CEO-spåret 2026-07-11

## Kontext (sök-befintligt gjort)

CEO-appen är FÄRDIG för detta: `coerceLive` i arcana-ceo-agent/lib/clinic-metrics.ts konsumerar redan
revenueSek/avgOrderValueSek/utilizationRate och Clinic Performance-ytan visar "Källa på väg" tills värden kommer.
Gapet ligger i KLINIK-gatewayn: major-arcana/src/ops/clinicPerformance.js rad 13–15 —
"revenue and avg order value still have previous:null until finance gets a proper period-sliced source.
utilizationRate and channelSplit still have no clean source and stay null."
Fortnox är redan integrerat i kliniken (EKONOMI-segmentet live sedan 2026-06-10).

## Fas 1 — Intäkt + AOV (denna order)

1. Periodskuren intäktskälla: summera betalda Fortnox-fakturor per kalendermånad (innevarande hittills + föregående samma dagsintervall — samma ärliga jämförelse som bookings).
2. revenueSek = {current, previous} ur Fortnox-perioderna. Ingen fabricering: saknas data för period → null.
3. avgOrderValueSek = revenueSek/bookings per period (eller Fortnox-ordervärde om renare) — dokumentera valet i dataNote.
4. Befintlig payload-form till gatewayn behålls (CEO-sidan kräver ingen ändring).
5. Tester: periodskärning, tom period → null, previous-fönstret matchar bookings-logiken.

## Fas 2 — Beläggning (SEPARAT beslut, ej denna order)

utilizationRate kräver kapacitetsmodell (behandlingsslots/dag per resurs). ÄGARFRÅGA till Fazli:
definiera klinikens kapacitet (rum × öppettider) innan fas 2 beställs.

## Forbidden

- INGEN deploy av frysta arcana-tjänsten utan Fazlis explicita frys-undantag i denna order.
- Rör inte journal/feed/forms-routes i server.js. Aldrig git add -A.
- Inga påhittade siffror — null tills källan är verifierad.

## Acceptance

- /clinic-performance i CEO-appen visar Intäkt + Snittordervärde live med ärlig föregående-jämförelse.
- Hero-chippen går från "2 mätvärden live" till "4 mätvärden live".
