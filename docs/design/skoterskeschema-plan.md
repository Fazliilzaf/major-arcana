# Sköterskeschema — konsoliderad plan

Status: **beslutsunderlag, inget byggt än.** Ersätter inte
`skoterskeschema-underlag-kimi.md` (fakta, redan rättat) — det här dokumentet
är slutsatsen av tre oberoende granskningar av det underlaget (Kimi, Claude
Code, Coworker-arbitrering), konsoliderade till en enda plan. Ingen intern
motsägelse ska finnas kvar i det som följer; där granskarna skilde sig anges
vem som hade rätt och varför, en gång, sedan bara slutsatsen.

## Fastställda fakta (verifierade mot `origin/main`, ingen oenighet kvar)

- **Cykelstödet är kod-klart.** `cycleWeeks`/`cycleWeek`/`cycleStart` normaliseras
  (`ccoBookingEngineStore.js:1005–1021`) och `ruleAppliesOnDate` anropas redan
  inne i `listAvailability` (rad 1535). Bara datapopulering saknas, ingen ny
  motorkod.
- **`managedBy: 'staff'` skyddar korrekt** mot att default-sammanslagningen vid
  omstart skriver över personalens egna ändringar (rad 887, 896).
- **Block är redan skrivbara.** `POST /cco-bookings/calendar-blocks`
  (`src/routes/ccoBookings.js:1881`) är staff-gated och anropar
  `bookingEngineStore.upsertCalendarBlock` direkt. Ingen ny route krävs för
  luncher eller ledighet.
  - Begränsning kvar: `normalizeCalendarBlock` är byggd för återkommande
    veckoblock (`weekdays` + `dateFrom`/`dateTo`), inte för enstaka datum.
    Fungerar för en enskild dag, men klumpigt.
- **Routen är staff-gated men INTE resource-scopad.** `requireStaffRole`
  kontrollerar bara att anroparen är personal — inte att `resourceId` i
  request-body matchar den inloggade personen. Vem som helst med
  personal-roll kan idag skriva ett block på vem som helst av sina kollegors
  resurs. Detta är en öppen lucka i produktionskod, inte ett framtida
  designval.
  - **Och värre: funktionen är en upsert på `blockId`.**
    `upsertCalendarBlock` (rad 1573–1585) letar upp befintligt block med
    `findIndex` på `blockId` och **ersätter det i sin helhet** —
    `state.calendarBlocks[index] = nextBlock`. Ingen ägarkontroll. Ett anrop
    med `blockId: 'block-lunch-all'` skriver alltså över klinikens globala
    lunchblock, eller tömmer det, för alla resurser samtidigt.
  - Enda skyddet i dag är att ingen UI exponerar routen. Scope-kontrollen
    behövs alltså innan routen visas för personal — inte när
    självbetjänings-UI:t byggs.
- **`confirmBooking` validerar aldrig mot schemat.** Den kontrollerar bara
  `isSlotTaken` (rad 1767–1799) — aldrig `availabilityRules` eller
  `calendarBlocks`. En reservation som hamnar utanför schemat kan ändå
  bekräftas.
- **`getCycleWeekForDate` räknar inte ISO-veckonummer.** Den räknar
  `floor((datum − cycleStart) / 7 dygn) mod cycleWeeks` (rad 1446–1453).
  Klinikens formel `(((isoVecka−35)%4+4)%4)+1` ger samma svar **bara om**
  `cycleStart` sätts till måndagen i ISO-vecka 35. Fel kalibrering glider
  veckogränserna bort från kalenderveckorna — en bugg som ger rätt svar i tre
  veckor av fyra och fel i den fjärde, osynlig utan rätt testdata.
- **Ingen koppling finns mellan inloggad personal och `resourceId`.** Resurser
  har `id`/`label`/`active`/`publicBookable` — `role: 'Sjuksköterska'` är bara
  en etikett, inte en länk till ett användarkonto. Utan länken kan
  "personalen sköter sitt eget schema" inte avgränsas till eget schema.
- **Wendelas Cliento-rad är rättad** (2026-08-22) — varningen i ursprungsunderlaget
  gäller inte längre, alla fyra Schema-sidor stämmer nu mot kalendern.
- **`installningar.html` i iCloud-arkivet är inte värt att återanvända.** 68 kB
  markup utan `id` på öppettidsblocket och utan sparning — inget kontrakt att
  bygga mot, bara layout. Alla tre granskare är eniga: bygg en ny, minimal
  skärm mot de riktiga endpoints i stället.

## De fyra frågorna — beslutad design

**1. Rotationen: regler per cykelvecka.** Enda vettiga valet — fälten finns,
är redan inkopplade, kräver noll ny motorkod. Börja med **bara
`consultation-physical`**: 16 regler (4 sköterskor × 4 cykelveckor), inte 80
för alla fem tjänster. Målet i underlaget är uttryckligen konsultation; de
övriga tjänsterna (prp-hair, prp-skin, microneedling, followup-transplant) är
redan `active: true` i katalogen och kan aktiveras per pass som ett separat,
senare beslut. Mindre yta att få fel i första versionen.

Alla 16 regler delar samma `cycleStart` (måndag, ISO-vecka 35) och
`cycleWeeks: 4`; `cycleWeek` per person/bokstav följer tabellen i underlaget
direkt. Starttider genereras ur samma `konsultationstider()`-grid som
läkarnas regler redan använder, beskuret till snittet av personens
skift och de publicerade konsultationsöppettiderna (10–18 vardag, 10–16
lördag) — skiftet är bredare än det publicerade fönstret.

**2. Luncher = befintliga block, dagbyten = ny primitiv.** Luncher och
ledighet skrivs redan via `POST /cco-bookings/calendar-blocks` — inget att
bygga där förutom UI och resource-scope (se punkt 4 nedan). Dagbyten är
genuint annorlunda: ett block kan bara **stänga** tid, aldrig **öppna** tid
utanför en regel. Ett byte kräver att en dag tas bort hos en person och
läggs till hos en annan för exakt det datumet. Ingen befintlig primitiv gör
det. Bygg `scheduleOverrides`: en ny lista (`resourceId` + specifikt datum +
add/remove), som `listAvailability` lägger ovanpå det regel-genererade
rutnätet.

**3. Redan bekräftade bokningar är redan säkra — men ingen varnar er.** En
bekräftad bokning är helt frikopplad från regeln som genererade den
(`confirmBooking` kollar bara `isSlotTaken`). Ändrar ni en regel i efterhand
rör det inte redan bekräftade tider — de ligger kvar orörda. Det som saknas
är den omvända riktningen: en varning **innan** en schemaändring sparas, som
listar bekräftade framtida bokningar för den resursen inom den tid som
försvinner. Enkel att bygga (fråga mot `state.bookings` filtrerat på
`resourceId` + tidsintervall, ingen ny lagringsmodell).

**4. Byggordning — säkerhetsnät före skrivrättigheter, minsta scope först:**

| Steg | Vad                                                                                                    | Varför i den ordningen                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Kalibrera `cycleStart` (måndag, ISO-vecka 35) + test mot Wendelas två kända måndagar (v36, v40)        | Allt annat vilar på att detta stämmer; fel här är osynligt utan rätt testdata                                                       |
| 2    | 16 konsultationsregler (4 sköterskor × 4 cykelveckor), `managedBy: 'staff'`                            | Gör dem bokningsbara för det faktiska målet, minsta möjliga yta                                                                     |
| 3    | Konfliktkontroll: read-only-rapport över bekräftade bokningar som hamnar utanför ett föreslaget schema | Byggs FÖRE steg 4 — risken uppstår först när personal kan ändra sitt eget schema, säkerhetsnätet ska finnas innan skrivvägen öppnas |
| 4    | Personal→`resourceId`-länk + resource-scope på `POST /cco-bookings/calendar-blocks`                    | Förutsättning för allt självbetjänings-UI nedan; stänger även den öppna luckan som redan finns i produktionskod idag                |
| 5    | Minimalt UI för egna luncher mot den redan befintliga block-routen                                     | Ingen ny backend, bara skärm nu när scope finns                                                                                     |
| 6    | `scheduleOverrides` för dagbyten                                                                       | Nytt, avgränsat tillägg                                                                                                             |
| 7    | Aktivera prp-hair/prp-skin/microneedling/followup per pass                                             | Separat beslut om vilka pass som får vilka tider, när sköterskorna är i drift för konsultation                                      |
| 8    | Ledighet/semester via samma blockmodell som lunch, bara hel dag och längre `dateFrom`/`dateTo`         | Ingen ny kod om steg 5 redan är byggt                                                                                               |

## Vad som INTE ska byggas

- Ingen ny route för block — `POST /cco-bookings/calendar-blocks` finns redan.
- Ingen ny modell för lunch/ledighet — `calendarBlocks` täcker det.
- Ingen ombyggnad av `installningar.html` — bygg nytt, minimalt, mot de
  riktiga endpoints.
- Alla fem tjänsterna på en gång — börja med konsultation.

## Öppna risker att hålla koll på

- Om sköterskorna aktiveras (steg 2) innan konfliktkontrollen (steg 3) finns,
  och personal sedan ändrar sitt schema, kan patienter hamna bokade hos
  någon som inte är där den dagen.
- `confirmBooking` litar på att tider kommer från `listAvailability`. En
  bugg eller direkt API-användning kan fortfarande bekräfta en tid utanför
  schemat — konfliktkontrollen (steg 3) är en varning efter ändring, inte en
  spärr vid bekräftelse. Om det visar sig otillräckligt är nästa steg att
  lägga en riktig validering i `confirmBooking` själv.
- Block-routens saknade resource-scope (se fastställda fakta) är en akut
  lucka redan idag, inte bara en förutsättning för framtida UI — värt att
  åtgärda även om inget UI byggs på ett tag.
