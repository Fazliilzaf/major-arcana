# Reservationer är inte bokningar · uppdrag

> **Datum:** 2026-08-23 · **Beställare:** Fazli · **Utförare:** DeepSeek
> **Bas:** `feat/cliento-srvid-brand` (`91ba7cdd`)
>
> Allt nedan är mätt i `~/Downloads/Dataexport 1 maj 2021 - 16 juni 2027.csv`
> (40 256 rader) samma dag. Mät inte om — siffrorna står här så du slipper.

## Beslutet

**Importera reservationer som blockerad tid, utan orsakskod.**

Kalendern behöver veta att tiden är upptagen. Den behöver inte veta varför.

---

## 1. Vad mätningen visar

`Typ` har exakt två värden i exporten:

| Typ | Rader | Utan tjänstenamn |
|---|---:|---:|
| `SimpleBooking` | 31 037 | 2 531 (8,2 %) |
| `Reservation` | 9 219 | **9 218 (100,0 %)** |

Reservationer bär **noll** patientdata — inte i något fält:

| Fält | Reservation | SimpleBooking |
|---|---:|---:|
| Kundnamn | **0** | 29 525 (95,1 %) |
| Kund-id | **0** | 29 525 |
| Kund e-post | **0** | 25 197 |
| Kund (mobilnummer) | **0** | 29 380 |
| Personnummer | **0** | 132 |
| Bokningens pris | **0** | 10 442 |

Och `Reservationstyp` säger vad de faktiskt är:

```
6 719  (tom)
1 950  Lunch
  280  Absence
  220  Vacation
   37  SickLeave
   10  OnLeave
```

Lunch, frånvaro, semester, sjukfrånvaro. Personalens schema — inte patientbesök.

**Det här är tredje gången i dag samma fel dyker upp i ny förklädnad.** Först
`visits` + `slots` i preflight-skriptet. Sedan igen i kalendergrindarna. Nu
reservationer räknade som bokningar. Varje gång har det gett fel svar på en
fråga någon ställt i god tro.

Det är också förklaringen till "28 % av bokningarna saknar tjänstenamn". Det är
inte ett datafel — det är mest rätt data i fel hink.

---

## 2. Varför orsakskoden inte ska sparas

`SickLeave` är 37 rader som säger att en **namngiven anställd var sjukskriven en
viss dag**. Det är personaluppgifter om hälsa, och de har ingenting i ett
patientbokningslager att göra.

`Lunch`, `Vacation`, `Absence` och `OnLeave` är mindre känsliga men följer samma
princip: kalendern renderar blockerad tid lika bra utan dem.

**Spara alltså inte `Reservationstyp`.** Om schemaläggningen senare visar sig
behöva skilja lunch från semester är det ett eget beslut, med egen genomgång av
hur länge det sparas och vem som ser det — inte något som smyger in via en
importfix.

---

## 3. Att göra

Tre filer, i den här ordningen.

### `src/ops/clientoBookingCsvImport.js`

Raden byggs vid **rad 228** (`bookings.push({`). Läs `row['Typ']` och sätt ett
booleskt fält, inte orsaken:

```js
// Cliento skiljer på SimpleBooking (patientbesök) och Reservation (blockerad
// tid: lunch, frånvaro, semester, sjukfrånvaro). Reservationer bär noll
// patientdata — 0 av 9 219 har kundnamn, kund-id, e-post, telefon eller pris.
// De ska in i kalendern som upptagen tid, men aldrig räknas som bokningar.
// Orsaken (Reservationstyp) sparas medvetet INTE: 37 rader är sjukfrånvaro för
// namngiven personal, och kalendern behöver inte veta varför tiden är blockerad.
const isReservation = normalizeText(row['Typ']) === 'Reservation';
```

Skicka med `isReservation` på objektet.

### `src/ops/clientoBookingStore.js`

Radformen börjar runt **rad 158**. Lägg till fältet:

```js
isReservation: safe.isReservation === true,
```

**Lägg det INTE i `PRESERVE_WHEN_BLANK_FIELDS`** (rad 204). Det är en boolean —
`false` är ett giltigt värde, inte "blankt". Att bevara det vid blank
uppdatering skulle göra det omöjligt att rätta en felaktigt märkt rad.

### `src/ops/clinicCalendarView.js`

`type: 'booking'` är hårdkodat på **rad 214**. Låt reservationer få sin egen typ:

```js
type: raw?.isReservation === true ? 'reservation' : 'booking',
```

Kontrollera sedan vad som faktiskt läser `entry.type` innan du ändrar mer —
sannolikt finns räkningar och grupperingar som behöver exkludera den nya typen.

---

## 4. Vad som ska bevisas

Testerna behöver visa mer än att fältet finns:

1. En rad med `Typ = 'Reservation'` blir `type: 'reservation'`, inte `'booking'`.
2. En rad med `Typ = 'SimpleBooking'` blir `'booking'` — ingen regression.
3. **`Reservationstyp` finns ingenstans i den lagrade raden.** Sök på strängarna
   `Lunch`, `SickLeave`, `Vacation`, `Absence` i importresultatet och kräv noll
   träffar. Det är hela poängen med beslutet, och det enda som förhindrar att
   någon "hjälpsamt" lägger tillbaka fältet senare.
4. Bokningsräkningar exkluderar reservationer.
5. Rader importerade före ändringen saknar `isReservation` och ska bete sig som
   bokningar precis som förut — ingen tyst omklassning av historik.

---

## 5. Det som ligger kvar efteråt

**~2 500 SimpleBookings utan tjänstenamn.** Personal som skapar en bokning utan
att välja tjänst. De går inte att backfylla: `Tjänste-id` är tomt på alla,
och `Bokningsanteckning` innehåller namn och interna noteringar (`Bokf`,
`Önskat sem`), inte tjänster. Ett fåtal är räddningsbara — `Botox` 21,
`PRP TP 1 av 3` 20. Det är ett arbetsflödesproblem, inte ett datafel.

**Rumsnamn i tjänstefältet.** `Stora rummet` 221, `OP rummet` 28. Kommer aldrig
att gå att klassa som tjänster. Egen backlograd.

**~9 300 legacy-hårnamn** (`PRP TP`, `Hårtransplantation`, `Almän Konsultation`).
Lägst prioritet: de visas redan rätt, eftersom omappat behålls i Hair TP-vyn och
döljs i Curatiio-vyn. Att mappa dem gör kartan snyggare men flyttar ingen bokning.

---

## Arbetsregler

1. Mät mot exporten eller koden, gissa inte. Siffrorna ovan har ett kommando bakom sig.
2. `visits` är bokningar, `slots` är lediga tider, `Reservation` är blockerad tid.
   Tre olika saker. Att slå ihop två av dem har gett fel svar tre gånger i dag.
3. Öppna kalendern och titta innan något kallas färdigt. Ett grönt test är inte
   ett fungerande gränssnitt.
4. Om du kommer på ett skäl att spara orsakskoden ändå — fråga först. Beslutet i
   §2 är beställarens, inte en teknisk detalj.
