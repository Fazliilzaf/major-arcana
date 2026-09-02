# ORD-163 · Operationsdagsgrinden känner ett av två ingrepp

**Arbetsorder · 2026-09-02**
**Bas:** `main` (`eaef1507`)
**Föregås av:** ORD-129 (ögonlocksplastik är kirurgi), ORD-159 (betänketiden efter ingreppstyp), masterplanens steg 3
**Grind:** `CCO_SEND_LIVE` orörd · ingen dokumenttext ändras
**Prioritet:** P1 — måste vara löst innan operationsdagsvyn byggs

---

## Fyndet

```js
// src/ops/ccoOperationDayGate.js:5
const OPS_BLOCKED_JOURNAL_TYPES = new Set(['tp_treatment']);
```

Grinden hindrar att en operationsjournal startas eller signeras på
behandlingsdagen innan friskförsäkran är signerad. Den känner **en** journaltyp.

Systemet har nio:

```
historical_import    tp_treatment          health_declaration
fitness_certificate  follow_up             prp_treatment
consultation_plan    consent_bundle        bleph_treatment
```

`bleph_treatment` är ögonlocksplastik. Det enda ingrepp i systemet som lagen
kallar kirurgi, som fick sju dagars betänketid i ORD-159, och vars avtal
rättades i ORD-157 §2. Den är inte grindad.

## Det är inte ett förbiseende överallt

PRP är **medvetet** undantagen. Testet säger det rakt ut:

```js
// tests/ops/ccoOperationDayGate.test.js:46
const prp = assertOperationDayJournalAllowed({ journalType: 'prp_treatment', … });
assert.equal(prp.allowed, true);
```

Och: _"släpper igenom PRP-journal utan FF via patient-context och frågar inte
efter FF"_. Någon har tagit ställning till PRP.

Ingen har tagit ställning till `bleph_treatment`. Den nämns inte i grinden, inte
i grindens test, ingenstans i `src/`. Frånvaro, inte beslut.

## Att någon avsåg något annat

Katalogen bär `friskfoers_curatiio_op` — _Friskförsäkran (op)_, journeyStep 8,
Curatiios egen. Dokumentet finns. Det grindar ingenting.

Och frontend grupperar redan de tre behandlingsjournalerna som en klass:

```js
// public/major-arcana-preview/app/patient-master-ui.js:5674
if (
  type === 'tp_treatment' ||
  type === 'prp_treatment' ||
  type === 'bleph_treatment'
)
  return 'treatment';
```

Frontend ser tre. Backend grindar en.

Det är tredje gången samma skillnad dyker upp: ögonlocksplastik behandlas i
koden som hårtransplantationens lillebror, medan lagen och avtalet behandlar den
som kirurgi. ORD-129 fann det i flödesvarianten, ORD-159 i betänketiden, den här
i operationsdagen.

---

## Uppgiften

### 1 · Frågan är medicinsk, inte teknisk

**Ska en ögonlocksplastikjournal kräva signerad friskförsäkran på
behandlingsdagen?**

Bevisen pekar åt ja: ingreppet är kirurgi, Curatiio har en egen
friskförsäkran i katalogen, och friskförsäkran finns för att fånga att
patienten är frisk nog samma dag.

Men det är medicinskt ansvarigs beslut, inte en agents. Ställ frågan innan
raden ändras, och skriv ner svaret med datum.

Samma fråga gäller de övriga sex typerna. `follow_up`, `consent_bundle` och
`health_declaration` är uppenbart inte behandlingsjournaler. `prp_treatment` är
avgjord. Kvar att ta ställning till är alltså i praktiken bara
`bleph_treatment` — men listan ska gås igenom, inte antas.

### 2 · Låt uppsättningen bära sitt skäl

Som den står i dag går det inte att se om en typ saknas för att någon beslutat
det eller för att ingen tänkt på den. Det är hela orsaken till att felet
överlevde.

Skriv om den så att varje journaltyp finns med och bär ett uttryckligt värde —
grindad eller inte, och varför. En ny typ som läggs till i `JOURNAL_TYPES` utan
att tas ställning till ska falla, inte tyst släppas igenom.

### 3 · Ett test som fäller frånvaro

`tests/ops/ccoOperationDayGate.test.js` täcker `tp_treatment` och
`prp_treatment`. Det räcker inte: en typ som varken är grindad eller testad
syns inte.

Testet ska jämföra grindens uppsättning mot `JOURNAL_TYPES` i
`ccoJournalStore.js` och faila när någon typ saknas i beslutslistan.

Läs filsystemet, inte git — se `tests/meta/testerFragarInteGit.test.js`.

### 4 · Vyn byggs efter, inte före

Masterplanens steg 3 beskriver operationsdagen som en egen yta. Steg 8 bär tolv
dokument, inte fyra som planen säger — mätt 2026-09-02.

En vy som visar tolv dokument utan att kräva rätt ordning är prydligare, inte
säkrare. Bygg grinden först.

---

## Fällan

**Lägg inte bara till `bleph_treatment` i mängden.** Det löser dagens fall och
lämnar nästa typ lika osynlig. Det var precis så den här luckan uppstod.

**Ta inte bort PRP-undantaget.** Det är ett fattat beslut med ett test som säger
varför. Att grinda PRP skulle stoppa behandlingar som inte kräver friskförsäkran.

**Ändra inte grinden utan medicinskt besked.** En grind som blockerar fel sak
stoppar vård på behandlingsdagen. Fel åt det hållet är också fel.

---

## Godkänt när

1. Varje journaltyp i `JOURNAL_TYPES` bär ett uttryckligt beslut i grinden.
2. Beslutet om `bleph_treatment` är fattat av medicinskt ansvarig och nedskrivet
   med datum, som ORD-148:s ägarbeslut.
3. Ett test som failar när en ny journaltyp saknar ställningstagande.
4. Mutationstesta punkt 3: lägg till en påhittad typ i `JOURNAL_TYPES` och visa
   att testet blir rött.
5. PRP släpps fortfarande igenom, med sitt test intakt.
6. Ingen ändring i dokumenttexter eller i `CCO_SEND_LIVE`.

---

## Ägarbeslut 2026-09-02 — ja, men den kan inte slås på ännu

Ägaren, ordagrant: _"vi har inte det så idag men jag tycker vi ska ha det."_

**Ögonlocksplastik ska kräva signerad friskförsäkran på behandlingsdagen.**
Beslutet är fattat och gäller riktningen.

Det gör inte `blocked: true` till rätt värde i dag. Se mätningen nedan: det
finns noll friskförsäkringar i produktion. Grinden skulle blockera på ett
dokument som inte går att producera, och det stoppar vård i stället för att
skydda den.

Beslutet skapar alltså ett bygge, inte en radändring:

```
1  friskförsäkran ska gå att skapa och signera för Curatiio     bygge, egen order
2  först därefter blocked: true för bleph_treatment             en rad
```

`bleph_treatment` stannar på `VANTAR_PA_BESLUT` tills steg 1 finns — men posten
ska nu bära beslutet, inte frågan:

```js
bleph_treatment: {
  beslut: 'ska grindas',
  fattat: '2026-09-02',
  av: 'ägaren',
  blockerasAv: 'friskförsäkran går inte att signera för Curatiio (noll i prod 2026-09-02)',
}
```

Skillnaden mot i går är att listan nu säger _vad som saknas_, inte _att någon
inte svarat_. Den kan bara tas bort genom att bygga bort hindret.

**En reservation.** Beslutet är ägarens. Ordern sa medicinskt ansvarig, och
ingreppet utförs av Arya Emami. Om formell medicinsk påskrift krävs för ett
kirurgiskt moment bör den hämtas innan grinden slås på — inte innan bygget
börjar.

---

## Mätt i prod 2026-09-02 — grinden får inte slås på ännu

Läst via SSH mot `/var/data/cco-journal.json` på prod-instansen.

```
poster totalt   5943

  5152   historical_import
   773   consultation_plan
     5   health_declaration
     5   tp_treatment
     5   prp_treatment
     3   follow_up
     0   fitness_certificate      ← grinden väntar på just denna
     0   bleph_treatment
     0   consent_bundle
```

**Det finns inte en enda signerad friskförsäkran i produktion.**

Det ändrar ordningen i ordern. Slås grinden på för `bleph_treatment` blockeras
varje framtida ögonlocksjournal på ett dokument systemet aldrig producerat, och
vård stannar på behandlingsdagen första gången någon försöker. Ett ja från
medicinskt ansvarig går alltså inte att verkställa i dag.

Innan grinden kan gälla ögonlocksplastik måste friskförsäkran gå att skapa och
signera. Det är ett bygge, inte ett beslut — och det hör inte till den här ordern.

**Frågan står kvar men är inte brådskande.** Noll ögonlocksjournaler betyder att
ingen patient berörs. `VANTAR_PA_BESLUT` i `77de756f` håller frågan synlig tills
den besvaras, vilket är rätt läge.

Två saker till som siffrorna visar, och som inte är den här orderns sak:

**Grinden har aldrig kunnat användas.** Den ska blockera `tp_treatment` tills
friskförsäkran är signerad. Med noll friskförsäkringar och fem TP-journaler
betyder det antingen att de fem inte skapades på behandlingsdagen, eller att de
gick förbi grinden. Vilket det är syns inte i typräkningen.

**Systemet är knappt använt skarpt.** 5152 av 5943 poster är historisk import.
Tretton är riktiga behandlingsjournaler. Det stämmer med att `CCO_SEND_LIVE` är
`false`, och det är värt att veta innan någon läser siffror som produktion.

---

## Vad jag inte avgjort

**~~Om `friskfoers_curatiio_op` faktiskt används.~~** BESVARAD 2026-09-02, se
mätningen ovan: noll `fitness_certificate` i prod. Frågan var dessutom fel
ställd av mig — `friskfoers_curatiio_op` är ett dokument i katalogen, medan
grinden frågar efter journaltypen `fitness_certificate`. Att räkna det ena och
tro att man mätt det andra ger ett exakt svar som är fel. Rättelsen kom från den
som byggde, inte från mig.

**Vad de tolv dokumenten på steg 8 är till för.** Planen säger fyra. Skillnaden
kan vara att katalogen räknar båda klinikerna, eller att steget vuxit utan att
någon räknat. Det avgör hur stor vyn i steg 4 blir.
