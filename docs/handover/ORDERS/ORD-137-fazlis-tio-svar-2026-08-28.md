# ORD-137 · Fazlis tio svar — besluten är fattade

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`dfddb9a6`)
**Föregås av:** ORD-133, ORD-134, ORD-135, ORD-136

Tio öppna frågor låg hos Fazli. Alla är besvarade. Nedan är svaren och vad
de betyder i koden. Ett enda följdbeslut är obesvarat — det står sist.

---

## 1 · Medical Finance på Curatiio — **ja**

`auto_medical_finance` ska nå Curatiio.

**Men inte genom att bredda `clinics`.** Mallen bär "Hair TP" fem gånger i
brödtexten. Curatiio är ett annat bolag med annan adress och annan
personuppgiftsansvarig. Bygg en **Curatiio-variant**, inte en delad rad.

Samma sak gäller de sju övriga auto-utskicken — de är fortfarande orörda
och ska förbli det tills de har egna varianter. Varje variant är `pending`
tills en människa juridiskt godkänner den. `CCO_SEND_LIVE` orörd.

## 2 · "Botox" → **skriv substansen**

Botox är ett varumärke. Kunddokument ska säga **botulinumtoxin**.

Tio filer bär ordet:

```
steg8-journal-botox-curatiio-final-demo.html    21
steg4-botulinum-info-final-demo.html             9
steg4-botulinum-info-sve-final-demo.html         8
cco-workflow-curatiio.html                       7
steg5-offert-botox-final-demo.html               7
steg7-offert-botox-final-demo.html               7
curatiio-botox-info-final-demo.html              6
cco-workflow-v13.html                            3
cco-analytics-v3.html                            1
cco-template-fill.html                           1
```

**Ändra bara text som kunden ser.** `id`, `data-registry-id`,
`flowApplies: ['botox']` och filnamn ska stå kvar — de är nycklar, inte
text. Byter du en nyckel tappar kundkortet dokumentet.

Tjänstenamnen i katalogen ("Botox: 1 område") är vad kunden bokar. Låt dem
vara tills Fazli säger annat — det är en fråga för hemsidan, inte för
koden.

## 3 · `DHI Ärr` — **från 15 000 kr**

Katalogen har `price: "—"` i dag. Enda tjänsten av 82 utan pris.

**Detta är repots första "från"-pris.** Prisgrinden
(`scripts/check-price-divergence.js`) jämför strängar. Ett spann matchar
inte ett fast belopp. Lös det innan raden läggs in — annars larmar grinden
på en tjänst som är korrekt.

Skriv i rapporten hur du löste det. Gissa inte i tysthet.

## 4 · Presentationerna — **åtkomliga före varje konsultation**

Fysisk och online, båda.

Sex PDF:er, `Krona` och `Vikar` × `DHI` · `FUE` · `PRP`, plus två PPTX.
Lägg in dem i systemet och gör dem valbara i konsultationsformuläret
(ORD-136 steg 5).

Kravet är **före** konsultationen, inte under. Personalen ska kunna öppna
rätt presentation innan patienten kommer.

## 5 · Curatiio får uppföljningsjournaler — **ja, skapa dem**

Öppen sedan ORD-133. Åtta behandlingar hade behandlingsjournal men ingen
`_follow`.

Kadensen är **4 · 8 · 12** — samma som Hair TP. Katalograder,
`clinics: ['curatiio']` eller båda där det gäller.

## 6 · Suturborttagning — **egen journal**

`7107 Ögonlocksplastik: Suturborttagning` **ärver inte**.

Ta bort den ur `inheritsFrom` i `cco-service-inheritance.json`. Den blir en
rad som står själv i arbetsbladet. Min bedömning i ORD-135 var fel —
Fazli sa eget ingrepp, alltså egen journalföring.

**Arbetsbladet blir 67 rader att gå igenom, inte 66.**

## 7 · Uppföljning Botox / Filler — **botox- respektive fillerjournalen**

`8952 Uppföljning: Botox` → `journal_estetik_botox`
`8953 Uppföljning: Filler` → `journal_estetik_filler`

Ärvningen står kvar för dessa två.

## 8 · Patientsammanslagningarna — **kör**

Karin Ståhl först, sedan resten.

Grindarna från ORD-131 gäller oförändrat:

- inga personnummer i klartext
- ingenting raderas — journalföringsplikt, Patientdatalagen, ≥ 10 år
- sammanslagning är en **koppling**, inte en överskrivning; båda posterna
  ska gå att se efteråt
- behåll de senast uppdaterade uppgifterna

## 9 · Två saknade tjänster — **lägg in dem**

| Tjänst                       | Pris     |
| ---------------------------- | -------- |
| Rynkbehandling BTX 5 områden | 5 400 kr |
| Filler 1 ml                  | 3 600 kr |

**Det här är första gången katalogen får en rad utan Cliento-`apiId`.**
Alla 82 befintliga bär ett. De två nya finns bara på hemsidan.

De behöver ett CCO-eget id som **inte kan krocka** med ett framtida
Cliento-`apiId`. Välj ett format som syns — inte ett löpnummer i samma
serie. Skriv i rapporten vilket format du valde och varför.

## 10 · Priserna — **hemsidans nuvarande priser gäller**

Det avslutar CMO-frågan: hemsidan är sanningen, även när CMO ändrar den.

`data/website-price-snapshot.json` är en **fryst avläsning från 27
augusti** som täcker 26 av 52 tjänster. Den duger inte som facit längre.

Två saker ska bli klara innan prisgrinden schemaläggs:

1. Hämta priserna **nu**, och täck alla tjänster — inte 26 av 52.
2. Grinden ska läsa en **färsk** avläsning, inte en fryst fil. Ändras
   hemsidan ska grinden se det utan att någon kör om ett skript.

Grinden **larmar**, den rättar inte. Ett pris ändras av en människa.

---

## Godkänt när

1. `auto_medical_finance` finns som **egen Curatiio-variant**, `pending`.
   Ingen breddad `clinics`-lista på auto-utskicken.
2. Tio filer säger botulinumtoxin i kundtext. **Noll nycklar ändrade** —
   visa det med en sökning på `data-registry-id` före och efter.
3. `DHI Ärr` bär `från 15 000 kr` och prisgrinden larmar **inte** på den.
4. Presentationerna går att välja före en konsultation, online och fysiskt.
5. Curatiio har uppföljningsjournaler med kadens 4 · 8 · 12.
6. `7107` är ute ur `inheritsFrom`. Arbetsbladet räknar **67 rader**.
7. `8952` och `8953` pekar på rätt journal.
8. Sammanslagningarna körda. Inget raderat, inga personnummer i klartext.
9. Två nya tjänster inne, med ett id-format som inte kan krocka med
   Cliento.
10. Färsk prisavläsning som täcker alla tjänster.

**Och genomgående:** `pending` är kvar som förval, ingen mall godkänns av
kod, `CCO_SEND_LIVE` orörd.

---

## Den enda obesvarade

**`8954 Uppföljning: Profhilo`.** Fazli svarade "botox/filler" på fråga 7
och nämnde inte Profhilo. Jag lägger inte en journal på den utan svar.

Låt raden stå kvar som märkt bedömning i `_judgments` tills han säger
vilken journal den ska ha.

---

## Kvar sedan tidigare

- **ORD-136** — konsultationsformuläret, offert/journal-delningen,
  biverkningsgenomgången.
- **ORD-135 punkt 2** — arbetsbladet är fortfarande 82 rader med 619 `?`.
  Ärv-tabellen finns men bladet regenererades aldrig. Det ska bli 67 efter
  punkt 6 ovan.
- **ORD-128** — läkarens ordination. Väntar på medicinskt ansvarig.
- **ORD-129** — ögonlocksplastik som `minorSurgery`.
