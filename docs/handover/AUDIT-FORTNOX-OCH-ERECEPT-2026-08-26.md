# Audit · Fortnox 20/80 och SharePoint/e-recept

**Till Fazli · 2026-08-26**
**Granskat:** `384509c7` (Fortnox 20/80), `edfea8fa` + `7f1e011d` + `f7874c0b` (SharePoint/e-recept)
**Metod:** läst koden och kört parsern med riktiga svenska belopp. Varje påstående har fil och rad.

---

## Sammanfattning

**E-receptet är rent.** Alla tre kontrollpunkterna håller.

**Fortnox har ett dött led och tre tysta belopp.** Ingenting är farligt
i dag eftersom inga fakturor skickas automatiskt — men regeln du bad om
körs aldrig, och tre vanliga sätt att skriva ett pris ger fel eller
inget svar utan att någon märker det.

---

## Fortnox · Fel 1 — 80 %-regeln är död kod

Du sa: slutfakturan ska gå ut ungefär två veckor före operationsdagen.
Den regeln är byggd — `buildFinalInvoiceSignalFromOp`,
`ccoCommercialEconomics.js:157`, med fjortondagarsfönstret på rad 133.

Den anropas från `ccoCommercialStore.js:399`, men bara om caset har ett
`opDate`:

```js
const opDate = normalizeText(safeCase.opDate);
if (opDate && normalizeText(safeCase.quotedAmount)) { … }
```

**`opDate` skrivs aldrig.** Jag sökte hela `src/` och `server.js`: tolv
förekomster totalt, samtliga är läsningar eller testdata. Fältet finns
inte i casets normalisering (`ccoCommercialStore.js:223-234` sätter
`quotedAmount` och `depositAmount`, inte `opDate`), och ingen kod kopplar
bokningens datum dit. Kommentaren på rad 389 säger "satt från bokningen"
— det stämmer inte.

Följden: **signalen kan aldrig utlösas.** Den enda slutfaktura-signal som
går att få är den vid journalsignering, alltså _efter_ behandlingen — det
motsatta av vad du bad om.

Det är samma klass av fel som eftervårdshooken i morse: koden finns,
villkoret är alltid falskt, och ett test som matar in `opDate` direkt
blir grönt.

**Åtgärd:** koppla bokningens operationsdatum till caset. Tills det är
gjort ska ingen påstå att 20/80-regeln är i drift.

## Fortnox · Fel 2 — tre sätt att skriva ett pris som går fel

Jag körde `parseSekNumber` mot femton skrivsätt:

| Inmatning      | Tolkas som   | 20 % blir  |
| -------------- | ------------ | ---------- |
| `38 400 kr`    | 38 400       | 7 680 ✓    |
| `38.400 kr`    | 38 400       | 7 680 ✓    |
| `SEK 38400`    | 38 400       | 7 680 ✓    |
| `ca 38 400 kr` | 38 400       | 7 680 ✓    |
| **`12 500:-`** | **null**     | **inget**  |
| **`38,400`**   | **38,40 kr** | **8 kr**   |
| **`-5000`**    | **−5 000**   | **−1 000** |

**`12 500:-` ger null.** Kolon-streck är ett av de vanligaste sätten att
skriva pris på svenska. Blir det null skapas ingen deposition och ingen
signal — tyst.

**`38,400` blir 38 kronor och 40 öre.** Kommatecknet läses som
decimaltecken, vilket är rätt enligt svensk konvention men fel om någon
skriver på engelskt vis. Depositionen blir **8 kr** i stället för
7 680. Tre tiopotenser fel, utan varning.

**Negativa belopp accepteras.** `-5000` ger en deposition på `-1000`.

**Åtgärd:** lägg en rimlighetsgrind i `parseSekNumber`. Avvisa negativa
belopp. Hantera `:-`. Och när ett tal med kommatecken har exakt tre
siffror efter kommat — flagga det i stället för att gissa; det är
antingen 38,400 kr eller 38 400 kr, och skillnaden är för stor för att
tas tyst.

## Fortnox · Det som är rätt

- **Ingen dubbelfakturering.** De två signalbyggarna delar `ruleId`, men
  op-signalen **ersätter** den journalbaserade i ett och samma fält
  (`ccoCommercialStore.js:398-400`). En plats, en signal.
- **Journalsigneringen kan inte fällas av ekonomin.**
  `maybeRecordFinalInvoiceSignal` (`ccoJournal.js:113`) ligger i
  try/catch och returnerar `null` vid fel. Rätt prioritering.
- **Ingen fejkad nolla.** Saknas accepterat pris returnerar
  `computeOutstandingBalance` `null`, inte `0` — och UI:t visar "okänt".
  Det var precis felet i den gamla SKULD-rutan.
- **Avrundning:** `Math.round` på hela kronor, inte trunkering.
- **Depositionen räknas bara på accepterad offert**
  (`ccoCommercialStore.js:232`).

## Fortnox · Två frågor jag inte kan besvara åt dig

**Avbokning.** Ingenting rensar `opDate` när en operation avbokas. I dag
spelar det ingen roll eftersom fältet aldrig sätts — men laga fel 1 utan
att laga det här, så fortsätter fakturasignalen ligga kvar på en inställd
operation.

**Delbetalning.** `computeOutstandingBalance` tar emot `paid`, men vem
fyller det? `ccoPatientMaster.js:1406` skickar `paid = 0` som standard i
lite-läget. Full betalhistorik finns i `buildPaymentContext` — kontrollera
att den vägen används där det räknas, annars visas hela beloppet som
utestående även efter delbetalning.

---

## SharePoint / e-recept · Ren

Dina tre kontrollpunkter, en och en:

**1 · Publiceras receptet utan godkännande? Nej.**
Anropet ligger i approve-routen (`staffPortal.js:3248`) och nås först
efter att signaturen validerats (`:3216`, avvisar kortare än två tecken)
och efter att `updateOrdinationReview` skrivit `status: 'approved'`.
Kastar skrivningen returnerar routen tidigt — publiceringen körs aldrig.
Ordningen är rätt: signera, spara, revisionslogga, publicera.

**2 · Kan `.catch` fälla läkarsvaret? Nej.**
Publiceringen är fire-and-forget med en `.catch` som bara loggar
(`:3254-3260`). Approve-svaret skickas oberoende. Det är precis rätt
form för ett sidoeffektsanrop i en klinisk väg.

**3 · Är flaggan av som standard? Ja, på båda ställena.**
`config.js:1078` — `asBool(process.env.ARCANA_GRAPH_SHAREPOINT_ENABLED, false)`.
`render.yaml:128-129` — `value: "false"`. Och site-identiteten är
`sync: false`, alltså inte satt.

### En anmärkning, inte ett fel

Eftersom publiceringen är fire-and-forget vet **ingen** om receptet kom
fram. Ett misslyckande blir en `console.warn` och inget mer — det finns
inget fält på ärendet som säger "publicerad" eller "misslyckades".

För ett recept är det värt en statusrad. Inte för att blockera något,
utan för att någon ska kunna svara på frågan _"nådde det fram?"_ utan att
läsa serverloggar. Ta det när flaggan ska slås på, inte nu.

---

## Vad jag rekommenderar

1. **`opDate`-kopplingen** — utan den finns inte 20/80-regeln, bara
   koden för den.
2. **Rimlighetsgrinden i `parseSekNumber`** — tre skrivsätt ger fel svar
   tyst, och det är pengar.
3. **Avbokningsrensningen** — direkt efter 1, inte senare.
4. **Publiceringsstatus på receptet** — när SharePoint-flaggan ska på.

Ingen av dem är akut i dag: inga fakturor skickas automatiskt, och
e-receptflaggan är av. Men punkt 1 och 2 måste vara på plats innan något
av det slås på.
