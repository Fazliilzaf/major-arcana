# ORD-149 · Momsen bor på tjänsten

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`f7c637e1`)
**Föregås av:** ORD-143 §1 (momsfrågan ställd), ORD-137 §3 (från-priset), ORD-134 (hemsidan är facit)

Fazli, 2026-08-30: **25 % moms på alla tjänster.** Verksamheten är estetisk
och därmed momspliktig. Satsen ska bo på tjänsten — inte skrivas in i tjugo
mallar.

Får göras i ett svep.

---

## Mätt

```
$ git show src/ops/cco-service-catalog.json | python3 …

rader             84
0 kr              21     ← konsultationer, kostar ingenting
från-pris          1     ← 7414 DHI Ärr, "från 15 000 kr"
avvikande format   0     ← alla matchar "(från )?[\d ]+ kr"
brand              Hair TP Clinic 54 · Curatiio 30
```

```
$ git grep -rln "moms\|VAT" -- src/ config/

src/cfo/cfoExpenseVatRules.js       'standard_25' finns redan
src/cfo/cfoExpenseStore.js          … och sju filer till
```

**Momsvokabulär finns redan i CFO-delen** — men för *ingående* moms på
utgifter. Ingenting för utgående moms på tjänster. Återanvänd namnen där de
passar, bygg inte ett andra ordförråd.

---

## Besvarat — priserna är INKLUSIVE moms

Fazli, 2026-08-30: **ja, priserna i katalogen är inklusive moms.**

```
"52 000 kr"  →  41 600 exkl + 10 400 moms = 52 000
```

Priset kunden ser är priset kunden betalar. Momsen **räknas bakåt** ur
det, den läggs inte på.

```
exkl  = pris / 1.25
moms  = pris − exkl
```

Det är den riktningen. Räknar du framåt (`pris × 0.25`) får varje offert
fel belopp — 52 000 blir 65 000, och kunden får en offert på 13 000 kr
mer än hemsidan lovade.

Det stämmer också med prisinformationslagen: pris till konsument anges
inklusive moms.

---

## Uppgiften

### 1 · Satsen på tjänsten, en gång

Lägg momssatsen i `cco-service-catalog.json`, som ett **eget fält** per rad.
Inte i mallar, inte i offertkoden, inte som en konstant någon glömmer.

Alla 84 raderna får fältet explicit. Ett saknat fält ska inte kunna betyda
något — det är samma lärdom som `legalReviewStatus` gav idag.

De 21 nollkroneraderna får satsen också, men de genererar ingen momsrad.
**"Moms på allt som kostar"** — 0 kr kostar ingenting.

### 2 · Rör inte `price`-strängen

```
7414  DHI Ärr  "från 15 000 kr"
```

Prisgrinden (`scripts/check-price-divergence.js`) jämför strängar mot
hemsidan. Ändrar du formatet larmar grinden på 84 korrekta tjänster.

Lägg ett **nytt numeriskt fält** bredvid. `price` är avläsningen från
hemsidan och ska förbli byte-identisk.

Kör grinden före och efter och visa noll nya larm.

### 3 · Från-priset är ett spann, inte ett belopp

`DHI Ärr` är den enda raden med `från`. Moms på ett spann är inte ett tal.

Bestäm hur det representeras och **skriv i rapporten varför**. Ett tal som
låtsas vara exakt på en offert där priset är ungefärligt är värre än en
tom ruta.

### 4 · Offerten visar tre rader

En tjänstespecifikation som bara visar totalen duger inte. Kunden ska se:

```
Pris exkl. moms
Moms 25 %
Att betala
```

Räknas fram ur tjänstens fält vid rendering. Ingen mall får bära en
hårdkodad procentsats — det var hela poängen med att lägga satsen på
tjänsten.

### 5 · Avrundning bestäms en gång

25 % av 41 600 går jämnt ut. 25 % av 2 300 gör det inte. Öre spelar roll
när Fortnox och offerten ska stämma överens.

Välj en regel, lägg den på ett ställe, och skriv vilken. Två avrundningar
i två filer blir en avstämning som aldrig går ihop.

---

## Godkänt när

1. Alla 84 rader bär momsfältet **explicit**. Sök och visa noll rader utan.
2. `price`-strängen är **byte-identisk** före och efter. Visa det.
3. Prisgrinden larmar **inte** på någon av de 84. Kör den, klistra utdata.
4. De 21 nollkroneraderna ger **ingen** momsrad. Ett test.
5. `7414` behandlas enligt punkt 3 och motiveringen står i rapporten.
6. Offerten visar tre rader, uträknade — inte inskrivna. Ett test som
   ändrar satsen på tjänsten och visar att offerten följer med.
7. **Ingen hårdkodad 25:a** utanför katalogen. Sök och visa.
8. Avrundningsregeln finns på ett ställe. Ett test med ett belopp som inte
   går jämnt ut.
9. **Momsen räknas bakåt.** Ett test med `52 000 kr` som ger exakt
   `41 600` + `10 400` — inte `52 000` + `13 000`. Mutationstesta: byt
   `/1.25` mot `*0.25` och visa att testet blir rött.
10. `CCO_SEND_LIVE` orörd. Inga mallar godkända.

## Curatiio: 25 % på alla trettio

Fazli, 2026-08-30: **nej, ingen rad är medicinskt motiverad.** Alla 84
tjänster är estetiska och momspliktiga. En enda sats, inga undantag.

**Fältet ska ändå kunna bära olika värden per rad.** Inte för att någon
rad avviker i dag, utan för att den dagen en gör det ska svaret vara att
ändra ett värde — inte att bygga om modellen.

Skulle Curatiio börja utföra ögonlocksplastik på medicinsk indikation
(synfältspåverkan) är den momsbefriad, och då blir det en ny rad eller ett
nytt värde. Det är en fråga för Fazli och Nordbro, inte för kod.

## Vad jag inte avgjort

**Tjänstespecifikationen som bilaga** — ORD-143 §2, advokatens
sjustegsordning. Den hör ihop med det här men är ett eget pass. Rör den
inte här.

**Avrundningsregeln.** Se punkt 5 — jag anger inte vilken, bara att den
ska finnas på ett ställe och stämma med Fortnox. Välj och motivera.
