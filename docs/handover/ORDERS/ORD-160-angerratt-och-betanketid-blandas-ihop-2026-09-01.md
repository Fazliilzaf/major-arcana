# ORD-160 · Ångerrätt och betänketid blandas ihop

**Arbetsorder · 2026-09-01**
**Bas:** `main` (`bf19640d`)
**Föregås av:** ORD-159 (betänketiden efter ingreppstyp), ORD-157 §2, ORD-131 (ingen avtalstext ändras utan beslut)
**Grind:** `CCO_SEND_LIVE` är `false` · **ingen avtalstext ändras i den här ordern**
**Prioritet:** P1 — måste vara löst innan `CCO_SEND_LIVE` slås på

---

## Två lagar, en grind

```
ångerrätt      14 dagar   distansavtalslagen (2005:59)   gäller distansavtal
betänketid    2/7 dagar   lag 2021:363                   gäller behandlingen
```

Bekräftat av Nordbros jurist Gabrielle Handler 2026-09-01: ångerrätten hör till
distansavtal och har ett standardformulär (bilaga 3). Betänketiden är något
annat — den hänger på ingreppet, inte på var pappret skrivs under.

Koden grindar **betänketiden** på distansavtalsvillkoret.

`src/ops/ccoTreatmentAgreementStore.js`

```js
const deliveryMode = normalizeEnum(
  agreement.deliveryMode,
  DELIVERY_MODES,
  'plats'
);
const cooling = getCoolingOffMeta(agreement, options.nowMs);
if (
  deliveryMode === 'distans' &&
  cooling.active &&
  options.forceAccept !== true
) {
  return { allowed: false, reason: `Betänketid gäller till …` };
}
```

`src/routes/ccoTreatmentAgreement.js:204`

```js
const deliveryMode = normalizeText(body.deliveryMode) || 'plats';
```

Förvalet är `plats`. Ett avtal som signeras på kliniken får `coolingOffEndsAt`
satt till tom sträng och kan accepteras samma minut. Felmeddelandet säger
"Betänketid" — koden vet vad fristen heter, den grindar bara på fel villkor.

Följden: ögonlocksplastik som signeras på plats kan accepteras direkt, mot ett
avtal som sedan ORD-157 §2 säger sju dagar.

Ett befintligt test låser fast beteendet:

```
tests/ops/ccoTreatmentAgreementStore.test.js
  it('canAcceptAgreement tillåter plats utan betänketid', …)
```

---

## Uppgiften

### 1 · Mät först: används `plats` i verkligheten?

Det avgör om det här är akut eller latent, och det syns inte i koden. Räkna
avtalen i prod per `deliveryMode`, och särskilt hur många av dem som är
ögonlocksplastik.

**Bygg ingenting innan den siffran finns.** Är svaret noll är resten en
härdning; är det inte noll är det en rättelse med patienter bakom sig.

### 2 · Betänketiden ska inte hänga på leveranssättet

`canAcceptAgreement` ska blockera på aktiv betänketid oavsett `deliveryMode`.
Antalet dagar kommer från `ccoCoolingOffPolicy` (ORD-159) — kirurgi sju,
övrigt två.

`angerBlanketUrl` ska däremot fortsätta gälla enbart distans. Den hör till
ångerrätten, och den grindningen är korrekt.

Testet ovan ska skrivas om, inte strykas. Det mäter i dag ett beteende som är
fel; ett struket test lämnar ingen spår efter sig.

### 3 · Ångerblankettlänken är död

Mätt 2026-09-01:

```
kodens url      HTTP 404   konsumentverket.se/for-foretag/konsumentratt-for-foretagare/…/angerblankett/
juristens url   HTTP 200   publikationer.konsumentverket.se/mallar-och-blanketter/angerblankett
```

Ligger på två ställen: `ccoTreatmentAgreementStore.js:195` och
`ccoTreatmentAgreementDocument.js:6`. En patient som klickar för att utöva sin
ångerrätt får en 404.

Byt till juristens adress, och lägg en kontroll som failar när länken slutar
svara 200. En död länk i ett juridiskt dokument ska inte kunna ligga tyst.

### 4 · Ge `ccoTreatmentAgreementStore` rätt antal dagar

Storen har inget `serviceId` att härleda ur. Den tar `coolingOffDays` från
anroparen och faller tillbaka på två. Följ `serviceId` genom anropskedjan från
`ccoCommercial` in i avtalet och skicka med rätt siffra.

Tre moduler står i `KVAR_PA_GAMLA_POLICYN` i
`tests/ops/betanketidTreLager.test.js`. Listan får krympa — ta bort raden när
modulen flyttats, annars failar testet.

---

## Vad som INTE byggs här

Två fynd är juridiska frågor, inte kodfrågor. De ska ställas till Nordbro, och
ingen agent ändrar avtalstext på dem (ORD-131).

### Bilagorna finns inte

Alla tio avtal hänvisar till "standardformulär, se bilaga 3". Nordbros källfil
refererar dessutom **bilaga 1** (tjänstebeskrivningen, i två klausuler) och
**bilaga 2**. Ingen av de tre finns i repot.

Gabrielle svarade 2026-09-01 vad bilaga 3 är — Konsumentverkets blankett. Kvar:
vad bilaga 1 och 2 är, och om referenserna ska bli länkar eller bifogade filer.

### Fel klinik i sex avtal

```
Hair TP   tp, prp-hair, prp-skin, microneedling, prf, profilo
          → "meddelande kan skickas till contact@curatiio.com"
```

Samtliga sex Hair TP-avtal ber patienten skicka sin ångerrättsanmälan till
Curatiios adress. Felet kommer ur Nordbros källfil — DHI-avtalet, alltså Hair
TP:s eget, bär curatiio-adressen. Vi kopierade källan troget.

Ägaren har påpekat det för Nordbro. Hennes svar gällde bilaga 3, inte adressen.
**Ändra den inte förrän Nordbro svarat** — det är avtalstext under ORD-131.

---

## Fällan

**Ta inte bort distansvillkoret överallt.** `angerBlanketUrl` ska ha kvar det.
Bara betänketidsgrinden ska lossna från leveranssättet.

**Ändra inte testet till att förvänta sig dagens beteende.** "tillåter plats
utan betänketid" beskriver felet, inte kravet.

**Rör inte avtalstexten.** Adressen och bilagorna väntar på Nordbro.

---

## Godkänt när

1. Siffran från punkt 1 står i ordern eller i commitmeddelandet.
2. Betänketid blockerar oavsett `deliveryMode`, med dagar ur `ccoCoolingOffPolicy`.
3. `angerBlanketUrl` gäller fortfarande bara distans, och pekar på en url som
   svarar 200.
4. Ett test som failar om betänketidsgrinden åter hängs på `deliveryMode`.
5. Mutationstesta punkt 4: återinför distansvillkoret och visa att det blir rött.
6. `KVAR_PA_GAMLA_POLICYN` har krympt med minst
   `ccoTreatmentAgreementStore.js`, och testet är fortfarande grönt.
7. Noll ändringar i avtalens brödtext. Diff ska visa noll rader under
   `public/major-arcana-preview/steg7-offert-*`.
