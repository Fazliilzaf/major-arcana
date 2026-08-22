# Sköterskornas schema — sammanslagen plan

Ersätter `skoterskeschema-underlag-kimi.md` som arbetsdokument. Underlaget finns
kvar som historik.

Tre oberoende analyser gjordes av samma underlag: Kimi, Claude Code och Coworker.
Alla tre landade i samma huvudslutsats — **det är datapopulering som fattas, inte
motorkod** — men var och en fångade något de andra missade. Det här dokumentet är
den sammanslagna bilden, med varje påstående verifierat mot `origin/main`
2026-08-22.

## Sanningen, efter rättelser

| Påstående                                      | Ursprung    | Facit                        |
| ---------------------------------------------- | ----------- | ---------------------------- |
| Cykelstödet är kod-klart, bara data saknas     | alla tre    | ✅                           |
| `managedBy: 'staff'` skyddar mot överskrivning | alla tre    | ✅                           |
| `confirmBooking` kollar bara `isSlotTaken`     | alla tre    | ✅                           |
| Ingen endpoint skriver block                   | underlaget  | ❌ **fel** — routen finns    |
| `getCycleWeekForDate` följer ISO-veckor        | underlaget  | ❌ **fel** — räknar dygn     |
| Block räcker för dagbyten                      | Kimi        | ❌ block kan bara stänga tid |
| Ingen länk personal → `resourceId`             | Claude Code | ✅                           |
| Börja med bara konsultation                    | Kimi        | ✅ rätt scope                |

### Rättelse 1 — block är skrivbara

```
src/routes/ccoBookings.js:1861   GET  /cco-bookings/calendar-blocks
src/routes/ccoBookings.js:1881   POST /cco-bookings/calendar-blocks
```

Underlaget sökte bara i `ccoBookingEngine.js`. Routen ligger i syskonfilen
`ccoBookings.js` och anropar `upsertCalendarBlock` rakt av. Luncher och ledighet
behöver ingen ny route.

Kvarstående begränsning: `normalizeCalendarBlock` är byggd för återkommande
veckoblock — `dateFrom`/`dateTo` plus `weekdays`. Enstaka datum går, men klumpigt.

### Rättelse 2 — cykeln räknas i dygn, inte ISO-veckor

```js
// ccoBookingEngineStore.js:1446–1453
const daysDiff = Math.floor((date.getTime() - startMs) / 86400000);
const weeksDiff = Math.floor(daysDiff / 7);
return (
  (((weeksDiff % rule.cycleWeeks) + rule.cycleWeeks) % rule.cycleWeeks) + 1
);
```

Formeln `(((isoVecka − 35) % 4 + 4) % 4) + 1` ger samma svar **bara** om
`cycleStart` är måndagen i ISO-vecka 35. Annars glider veckogränserna — rätt svar
i tre veckor, fel i den fjärde, och inget test fångar det om man inte testar mot
exakt rätt datum.

## Öppen lucka i produktionskod

`POST /cco-bookings/calendar-blocks` är gated med `requireStaffRole`, som bara
kontrollerar rollen:

```js
// ccoBookings.js:395
const role = normalizeText(context?.actor?.role).toUpperCase();
if (STAFF_ROLES.has(role)) return;
```

`req.body` går sedan orörd till `upsertCalendarBlock`, som gör noll
aktörsvalidering — `normalizeCalendarBlock` nämner varken `actor` eller `userId`.

**Två konsekvenser:**

1. Vilken inloggad personal som helst kan skriva ett block på någon annans
   resurs.
2. Värre: funktionen är en upsert på `blockId`. Ett anrop med
   `blockId: 'block-lunch-all'` skriver över klinikens globala lunchblock — eller
   tömmer det.

Det här är inte ett framtida designproblem. Det ligger i prod nu. Enda skyddet i
dag är att ingen UI exponerar routen.

**Åtgärd:** scope-kontroll på routen innan den visas för personal, och ett skydd
mot att skriva över block man inte äger.

## Rotationen

```
A  mån–fre 08–17     B  tis–lör 08–17
C  tis–fre 11–20     D  ons–lör 10–18

           v1   v2   v3   v4
Veronica   B    C    D    A
Clara      A    D    C    B
Louise     C    B    A    D
Wendela    D    A    B    C
```

Utläst ur Cliento-kalendrarna. Wendelas rad på Schema-sidan var inaktuell och
rättades av Fazli 2026-08-22 — alla fyra stämmer nu.

Öppettider: konsultation 10–18 vardag, 10–16 lördag. Behandling 08–20 / 08–17.
Konsultation är 45 minuter.

## Planen

Ordningen är den de tre kom överens om efter att ha läst varandra. Två saker
flyttades: konfliktkontrollen tidigarelades, och antalet regler skars ner.

### 1. Kalibrera `cycleStart` och lås det med ett test

`cycleStart: '2026-08-24T00:00:00.000Z'` — måndag, ISO-vecka 35.

Testet ska bevisa att Wendela har måndagstid både v36 och v40, fyra veckor isär.
Faller det är kalibreringen fel, och allt som byggs ovanpå blir fel med den.

**Först. Allt annat vilar på den här siffran.**

### 2. Sexton konsultationsregler

Fyra sköterskor × fyra cykelveckor, bara `consultation-physical`.

- `cycleWeeks: 4`, `cycleWeek: 1..4`, samma `cycleStart` för alla
- `managedBy: 'staff'`
- `startTimes` genererade ur `konsultationstider()` (rad 188–198), beskurna till
  snittet av personens skift och konsultationsöppettiden

Skiftet är bredare än konsultationsfönstret — B är tis–lör 08–17 medan
konsultation är 10–18. Det är **snittet** som ska bokas, inte hela skiftet.

Inte 80 regler. PRP, microneedling och followup ligger utanför det uttalade
målet och kräver ett eget beslut om vilka pass de hör till.

### 3. Konfliktkontroll — före skrivvägen, inte efter

En read-only rapport: givet ett föreslaget schema, vilka redan bekräftade
framtida bokningar hamnar utanför?

Fråga mot `state.bookings` filtrerat på `resourceId` och tidsintervall.

Redan bekräftade bokningar är i sig säkra — `confirmBooking` är frikopplad från
reglerna, så en avstängd regel rör inte en befintlig bokning. Det som saknas är
**varningen**: personalen ska se vad de är på väg att göra innan de sparar.

Säkerhetsnätet före skrivvägen. Inte tvärtom.

### 4. Länk personal → `resourceId` + scope-kontroll

Resurserna har `id`, `label`, `active`, `publicBookable`. Inget användarkonto.
`role: 'Sjuksköterska'` är en etikett, inte en länk.

Utan den går "personalen sköter sitt eget schema" inte att avgränsa till _sitt
eget_. Lägg samtidigt scope-kontrollen på `/cco-bookings/calendar-blocks` — se
luckan ovan.

### 5. Minimalt UI för lunch

Mot den befintliga routen, scopad via länken i steg 4.

### 6. `scheduleOverrides` för dagbyten

Ett block kan bara **stänga** tid. Ett dagbyte kräver båda riktningarna: bort hos
en person, till hos en annan, för ett specifikt datum. Ingen befintlig primitiv
gör det.

Ny lista: `resourceId` + datum + `add`/`remove`, som `listAvailability` lägger
ovanpå det regelgenererade rutnätet. Litet och avgränsat — men nytt.

### 7. Semester

Samma blockmodell som lunch, bara heldag och längre `dateFrom`/`dateTo`. Ingen ny
kod om steg 5 är byggt.

### 8. Övriga tjänster

PRP, microneedling, followup — per pass, som ett eget beslut när konsultationerna
är bevisade.

## Arkivsidan

`installningar.html` i iCloud: **använd den inte.** 68 kB layout utan `id` på
öppettidsblocket och utan sparning. Den har inget frontend-kontrakt att
återanvända — att bygga ovanpå den vore att skriva om den ändå.

Alla tre analyserna landade oberoende i samma slutsats.

## Vad var och en bidrog med

Bevarat för att det säger något om hur granskningen ska läsas.

- **Kimi** — att routen för block redan finns, och att scopet ska vara bara
  konsultation.
- **Claude Code** — att cykeln inte räknar ISO-veckor, att länken personal →
  resurs saknas, att dagbyten kräver en ny primitiv, och den öppna luckan i
  block-routen.
- **Coworker** — att underlaget självt hade fel om blocken, och avgörandet i de
  två punkter där de motsade varandra.

Ingen av de tre hade hela bilden ensam.
