# ORD-74 · Full historik från 2024 + varje mail räknas (olöst-kö)

**Status:** KLAR (Claude byggde 2026-07-16, ägar-beställning samma dag)
**Ägare:** Claude · **Prio:** P1

## Ägar-beställning (andemening, ordagrant underlag)

> "vi ska ha företaget och utgifter minimum från 2024 1 jan annars ser vi inte
> mönster — vi måste gå genom varje mejl och få med oavsett kostnader eller köp,
> och kan vi inte tyda så ska vi inte hoppa, vi ska hitta lösningen och sen gå
> till nästa mail"

## Byggt

1. **CM_IMAP_SINCE default 2026-01-01 → 2024-01-01** och **cursor-reset**: om
   SINCE flyttas bakåt jämfört med sparad `backfillSince` nollas UID-cursorn så
   hela den äldre historiken skannas om (dedupe skyddar mot dubbletter).
2. **Varje mail importeras** — ekonomifiltret styr inte längre bort mail; det
   räknar bara statistik (`nonEconomy`). Allt sparas som rawItems + originalarkiv.
3. **Olöst-kön**: när AI:n läst ett mail men inte funnit köpdata (unknown/
   confidence < 50) skapas ett OLÖST record (`expenseType: unknown`, avsändare
   som ledtråd, NEEDS_MANUAL_REVIEW) i granska-kön — inget försvinner tyst.
   Gäller både IMAP-intaget och reprocess-flödet.
4. **Tekniska AI-fel** (429/nätfel) skapar INTE olösta records — de retryas via
   reprocess tills de lyckas (annars hade tillfälliga fel begravt riktiga köp).
5. **CM_RAW_ITEMS_MAX default 2000 → 10000** — full historik får inte rotera ut
   oprocessade rawItems innan extraktionen hunnit ikapp.

## Verifiering

- [x] 34/34 cm-tester gröna (6 imap, inkl. cursor-reset + olöst + retry)
- [ ] CI grön, merge, deploy
- [ ] Prod: om-skanning från 2024 → backlog betas av, olösta hamnar i granska-kön
