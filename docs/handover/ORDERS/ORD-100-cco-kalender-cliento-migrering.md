# ORD-100 — CCO:s egen kalender/bokning: vad som återstår innan Cliento kan lämnas

|                       |                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bas-commit**        | `ec5f00bd` (`main`, 2026-08-07)                                                                                                                                                |
| **Ägare**             | Cowork (kartläggning, denna order)                                                                                                                                             |
| **GO**                | väntar Fazli                                                                                                                                                                   |
| **Allvarlighetsgrad** | **Strategiskt, inte ett buggfynd.** Det här är det största återstående steget för att verkställa hela CCO — betydligt större än något annat i backloggen.                      |
| **Föregångare**       | ORD-99 (avkapade meddelandekroppar), som ledde till frågan "vad blockerar CCO i sin helhet" — svaret visade sig vara det här, inte den ursprungligen misstänkta steg 2-frågan. |

## Bakgrund — hur den här ordern uppstod

Under ORD-99-arbetet frågade Fazli var projektet står mot att "verkställa CCO".
Ett tidigare svar pekade felaktigt ut steg 2 (bokningsbekräftelsens
Meridiq-länk) som den enda blockeraren. Fazli rättade: Cliento hanterar
bokningsflödet **medvetet**, eftersom CCO:s egen kalenderdel inte är klar —
det är inte en osäker fråga, det är ett känt, redan beslutat interimsläge.

Fazli bad om en oberoende kodverifiering av kalenderns faktiska status
(samma metod som resten av dagen: verifiera, gissa inte). Kartläggningen
nedan är resultatet. Fazli bekräftade sedan explicit att data, bokningar och
patientanteckningar i Cliento **inte** är flyttade än, och ramade in arbetet:
_"detta är mitt och ditt projekt att se till att hela CCO verkställs."_

## Observation — vad som faktiskt finns (verifierat, inte antaget)

### Backend är genuint byggt och testat

- `src/ops/ccoBookingEngineStore.js` (1 920 rader) — riktig bokningsmotor:
  `listAvailability`, `reserveSlots` med verklig konfliktdetektion
  (`isSlotTaken`, rad 1381–1394), `confirmBooking`, `cancelBooking`,
  `reserveAndConfirmIdempotent`.
- Persistens är verklig, inte in-memory: atomisk `fs.writeFile` via
  tmp+rename (rad 123, 134), backas av persistent disk
  (`src/ops/persistentDir.js`).
- Monterad i `server.js` på riktigt — `app.use('/api/v1', ...)` för
  `createCcoBookingEngineRouter` (rad 13939–13953),
  `createPublicBookingEngineRouter` (rad 13541–13552),
  `createCalendarRouter` (rad 12233–12239), `createCcoBookingsRouter`
  (rad 13905–13921).
- **89/89 tester gröna** för hela kedjan (`tests/routes/calendar.test.js`,
  `ccoBookingEngine.test.js`, `publicBookingEngineVip.test.js`,
  `ccoBookings.test.js`, `ccoCalendarBookingCreate.test.js`,
  `ccoCanonicalBookingCalendar.test.js`).

### Personalgränssnittet är avsiktligt skrivskyddat

- `public/kalender.html:3982` hårdkodar
  `window.CCO_CALENDAR_READ_ONLY = true`. Ingen query-param eller config
  override hittad i filen.
- Den enda knapp som skulle skapa en riktig bokning —
  `openCreateBookingDrawer()` (`public/cco-kalender-shell.js:749-935`,
  anropar riktiga, testade `/create/preflight` + `/create/confirm`) —
  renderas bara när `CCO_CALENDAR_CREATE_BOOKING_ENABLED === true`
  (`cco-kalender-shell.js:29-31`). Den flaggan sätts **aldrig** till sant
  någonstans i det som faktiskt skickas till webbläsaren.
- Bekräftat medvetet, inte ett missat steg: `tests/public/ccoCalendarCreateBooking.test.js:52`
  är uttryckligen döpt "controlled UI is default-off and orders preflight
  before explicit confirm".

### Två döda anrop — RÄTTAT 2026-08-07, de var overkliga, inte bara döda på servern

- `onBookingClick()` (`cco-kalender-shell.js:483-508`) hämtade
  `/api/v1/calendar/booking/:id/status-pills` — **existerade inte som route**
  någonstans i `src/routes/*.js` eller `server.js`. Misslyckades tyst
  (`catch (_) {}`), visade alltid tomma statuspills.
- `loadIntelligence()` (`cco-kalender-shell.js:1392-1410`) hämtade
  `/api/v1/calendar/booking/:id/intelligence` — samma sak, visade alltid
  "Insikter ej tillgängliga (404)".
- **Denna ordens ursprungsversion påstod att dessa "ARE reachable/live"
  (till skillnad från create-modal-koden nedan). Det var fel.** Läsning av
  koden visar att `onBookingClick` kollar `isReadOnlyMode()` FÖRST och
  kortsluter till `renderReadonlyDrawer` innan de döda anropen nås —
  och `CCO_CALENDAR_READ_ONLY` är hårdkodat `true` i den enda HTML-filen
  som laddar skriptet. Samma overkliga situation som create-modal-koden,
  bara i en annan gren av samma flagga. Åtgärdat genom att ta bort de
  dömda nätverksanropen — identiskt fallback-beteende kvar, en dömd
  nätverksrundtrip mindre om flaggan någonsin flippas.

### En föräldralös kodväg

- `openCreateBookingModal()`/`submitCreate()` (`cco-kalender-shell.js:1691-1904`)
  postar mot `/api/v1/calendar/booking`, `/calendar/booking/conflict-check`
  — routes som inte finns. Utlösaren (`ccoCalCreateBtn`,
  `cco-kalender-shell.js:2754`) binder till ett knapp-ID som inte finns
  någonstans i `kalender.html`. Onåbar idag, men oklart om den är tänkt att
  bli den riktiga vägen eller ska tas bort helt.

### Två parallella bokningsstackar

- `ccoBookingEngineStore.js`/`ccoBookingEngine.js` ("engine") och
  `ccoBookingStore.js`/`ccoBookings.js` (äldre "case"-baserad API) — båda
  monterade, båda testade, aldrig konsoliderade.

### Cliento-relationen idag: helt separat, ingen automatisk synk av bokningar

- `.cursor/rules/website-booking-policy.mdc`: _"Ingen CCO-koppling till
  hemsidans bokningsflöde tills CCO-bokning är 100 % redo … `ARCANA_PUBLIC_WEB_BOOKING_ENABLED`
  ska vara `false` på prod."_ Runtime-vakten är `src/infra/publicWebBooking.js:8-13`
  — är flaggan av ger varje `/api/public/booking-engine/*`-route 503.
- `src/config.js:28,921` defaultar flaggan till `true` i koden, men
  `render.yaml:127-131` har en kommentar om att Render Dashboard kan ha en
  override till `false` — **inte verifierbart från repot ensamt**, samma
  sorts fråga som `ARCANA_PUBLIC_BASE_URL` var i `ORD-86`.
- Bokningsimport från Cliento är **manuell/batch, inte live-synk**:
  `src/routes/opsClientoBookingsImport.js` — ägaren klistrar in en
  CSV-export från Clientos UI i en owner-only endpoint. Plus
  `clientoBookingMailParser.js` som läser bokningsbekräftelsemejl. Ingen
  API-synk för bokningar.
- Den enda genuint **live, automatiska** Cliento-integrationen är
  `src/infra/clientoApi.js` + `src/ops/clientoCustomerDeltaSync.js`, körd
  av schemaläggaren var ~24:e timme (`src/ops/scheduler.js:49,2674-2690`)
  — men den synkar bara **kund-/patientposter**, inte bokningar. Sökning
  efter "booking"/"appointment" i `clientoApi.js` ger noll träffar.
- `docs/strategy/CCO-KALENDER-MASTER.md:16,30`: _"Cliento förblir orört som
  canonical patient-bokning tills CCO är 100 % klar + godkänd."_

### Gammal dokumentation motsäger koden — samma mönster som resten av dagen

`docs/strategy/PROJECT-CHECKLIST.md:22,37,222` påstår "Plan A bokning:
automated GO" och "Bookingmotor ✅". Direkt i konflikt med den låsta
policyn ovan och `CCO-KALENDER-MASTER.md:16` ("flagga OFF per Fazlis
explicita beslut"). Backend för Plan A är verkligen byggt och testat —
men "GO" i betydelsen "live för riktig patienttrafik" stöds inte av
gatingkoden. Behandla `PROJECT-CHECKLIST.md`s bokningsrader som föråldrade.

## Vad som saknas — konkret, i prioritetsordning

1. **Datamigrering från Cliento** — bokningar, patientanteckningar,
   historik. **Inte påbörjad. Omfattningen är INTE tillförlitligt mätt
   än** — ett första försök (2026-08-07) drog fel slutsats pga en
   `wc -l`-räknemetod som inte hanterade flerradiga CSV-fält korrekt; se
   Fas 0-facit nedan för den rättade, öppna versionen. Sannolikt större än
   alla andra punkter tillsammans oavsett exakt tal. Ingen mekanism finns
   idag utöver manuell CSV-import.
2. Slå på personalens skriv-UI (`CCO_CALENDAR_CREATE_BOOKING_ENABLED`) när
   redo — flaggan finns redan, bara av. **Ej påbörjad**, kräver Fazlis
   beslut om tidpunkt.
3. ~~Fixa eller ta bort de två döda endpoint-anropen~~ — **KLAR
   2026-08-07.** Borttagna, identiskt fallback-beteende kvar.
4. ~~Städa den föräldralösa create-modal-koden~~ — **KLAR 2026-08-07.**
   Borttagen (superseded av den redan testade `openCreateBookingDrawer`).
5. Konsolidera de två parallella bokningsstackarna. **Ej påbörjad.**
6. ~~Bekräfta `ARCANA_PUBLIC_WEB_BOOKING_ENABLED`s verkliga läge~~ —
   **KLAR 2026-08-07.** Bekräftat AV via `/_diag/env` (`#1332`).

## Föreslagen fasindelning — INTE påbörjad, väntar på Fazlis prioritering

Detta är ett förslag till ordning, inte ett beslut.

- **Fas 0 — DELVIS KLAR, gap-talet återöppnat (2026-08-07).** Ett första
  räkneförsök gav fel resultat (metodfel, se facit nedan) och drogs
  tillbaka samma dag. Rättad räkning: senaste Cliento-export har 26 887
  unika bokningar — **färre** än de 55 221 vi redan importerat, en ny
  oförklarad avvikelse. Nästa steg är en `Boknings-id`-mängddiff, inte
  gjord än. Inget API krävdes — Cliento erbjuder ett CSV-exportverktyg
  (`Dataexport`) som täcker hela historiken i en fil.
- **Fas 1 — billiga fixar, oberoende av migreringsbeslutet.** Punkt 3 och 4
  ovan. Litet, säkert, rör inte data.
- **Fas 2 — konsolidera stackarna** (punkt 5). Minskar underhållsytan
  innan migrering, så det inte finns två mål att migrera till.
- **Fas 3 — kontrollerad pilot.** Slå på skriv-UI (punkt 2) för ett fåtal
  personal/bokningar, med Cliento fortsatt canonical parallellt. Backend är
  redan testat; det här är riskreduktion, inte nybygge.
- **Fas 4 — full migrering + cutover.** Flytta historiska bokningar och
  anteckningar, verifiera stickprov, sätt Cliento till läsläge eller
  pensionera den. Kräver ett uttryckligt beslut av Fazli om tidpunkt —
  detta är inte reversibelt på samma sätt som en kodändring.

## Fas 0 — mätt 2026-08-07, del 1 av 2

Läs-endast mätning via Render SSH mot `clientoBookingStore`s persisterade
data (`state/cco/cliento-bookings.json` på prod, se `src/config.js`s
`clientoBookingStorePath`). Ingen skrivning, inga namn/mejl/anteckningstext
lämnade servern — bara räknetal.

| Mått                        | Värde                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| Bokningar redan importerade | **55 221**                                                       |
| Distinkta kunder            | **7 579**                                                        |
| Källa                       | `cliento_csv`: 55 220, `cliento_uat`: 1 (testkörning)            |
| Datumspann                  | 2021-06-30 → 2027-05-15 (framåtblickande, bokade framtida tider) |
| `notes`-fält ifyllda        | 44 695                                                           |
| `bookingNotes` ifyllda      | 21 524                                                           |
| `customerMessage` ifyllda   | 3 573                                                            |
| `treatmentNotes` ifyllda    | 30                                                               |
| `internalNotes` ifyllda     | **0**                                                            |

**Detta är inte samma sak som Clientos totala omfattning.** Det är bara vad
som redan importerats hit via CSV, historiskt. Volymen är betydligt större
än vad "manuell CSV-import" antydde — 55 000+ bokningar är inte ett litet
efterarbete, det är i sig ett dataförvaltningsproblem.

**`internalNotes: 0` är oförklarat, inte bekräftat ofarligt.** Kan betyda
att fältet aldrig exporteras av Cliento till CSV, att CSV-parsern inte
mappar det, eller att interna anteckningar helt enkelt inte förts i
Cliento. Skiljer sig åt i allvarlighet — kräver utredning innan Fas 4,
inte en gissning.

## Fas 0 — mätt 2026-08-07, del 2 av 2 — RÄTTAD, gap-frågan ÅTERÖPPNAD

Fazli exporterade Clientos eget CSV-underlag direkt (`Dataexport 1 augusti
2021 - 31 augusti 2026.csv`, `Kundexport_nya`-varianter), sparade på
iCloud. Ingen patientdata i den här utredningen, bara struktur och
räknetal — men metoden ändrades mitt i, se nedan.

### Metodfel, hittat och rättat samma dag

Första passet räknade rader med `wc -l` (121 783 − 1 rubrikrad = 121 782)
och drog slutsatsen "66 561 bokningar (≈55 %) saknas". **Det var fel
metod.** `Bokningsanteckning`-fältet är fritext och kan innehålla
radbrytningar inuti citerade CSV-fält — `wc -l` räknar då en enda
bokningspost som flera rader. Omräknat med `csv.DictReader` (Python,
citattecken-medveten parsning): **28 656 faktiska poster**, inte 121 782.
Av dessa är **26 887 unika `Boknings-id`** (1 769 dubbletter, troligen
flera tjänsterader per bokning som delar samma boknings-ID).

Statusfördelning (summerar exakt till 28 656, konsekvenskontrollerad):
`Show` 22 703, `Cancelled` 3 168, `NoShow` 1 413, `Booked` 1 125, tom 54,
`Done` 193.

### Nytt facit — och en ny, oförklarad avvikelse

| Mått                                               | Värde       |
| -------------------------------------------------- | ----------- |
| Unika bokningar i senaste Cliento-export           | **26 887**  |
| Redan importerade till CCO (del 1)                 | 55 221      |
| **CCO har fler bokningar än den senaste exporten** | **+28 334** |

Detta är **inte** "gapet är stängt" — det är en ny olöst fråga. Rimlig
hypotes: CCO:s 55 221 är ackumulerade från **flera** historiska
CSV-importer med olika/överlappande datumfönster över tid (den här
exporten, 2021–2026, är bara den senaste), inte en enda körning. Men det
är obekräftat — det kan lika gärna dölja dubbelimporterade eller
felaktiga poster i vårt system. **Den tidigare slutsatsen "66 561 saknas
(≈55 %)" är formellt tillbakadragen.**

**Enda pålitliga vägen framåt:** jämför de faktiska `Boknings-id`-mängderna
(inte totalsummor) — vilka ID finns i CCO men inte i senaste exporten,
och tvärtom. Boknings-ID är referensnummer, inte patientinnehåll, säkert
att extrahera och diffa. Inte gjort än — kräver ett skript på vardera
sidan (Render SSH mot vår store, lokalt mot CSV:n) och en mängddiff.
Föreslås som nästa steg, inte utfört utan Fazlis GO.

### `internalNotes`-frågan (del 1) — stärkt misstanke, fortfarande obekräftad mot innehåll

Innehålls-blind räkning (Python, `csv.DictReader`) över alla 28 656 rader,
utan att någonsin skriva ut fältvärden:

| Fält                 | Ifyllt (av 28 656) |
| -------------------- | ------------------ |
| `Attribut`           | 28 602 (99,8 %)    |
| `Bokningsanteckning` | 23 622 (82,4 %)    |
| `Anpassade fält`     | 8 526 (29,8 %)     |

`Attribut` är ifyllt i så gott som **varje** rad i källan, men
`internalNotes` är **alltid 0** i det vi importerat (del 1). Det är
starkare stöd för importer-bugg-hypotesen än tidigare — men fortfarande
inte bekräftat mot faktiskt innehåll (bara närvaro/frånvaro räknat, aldrig
värden lästa). Kan lika gärna vara ett systemfält (kategori-tagg) som
råkar vara nästan alltid satt, inte fritext-anteckningar. Kräver att någon
med Cliento-åtkomst tittar på vad `Attribut` faktiskt innehåller för en
handfull bokningar, i Clientos eget gränssnitt — inte via CSV-dump hit.

## Icke-mål för denna order

- **Ingen kod skrivs eller data flyttas förrän Fazli godkänt fasordningen.**
  Det här är kartläggning och ett förslag, inte en påbörjad migrering.
- **Rör inte Cliento-produktionsdata** utan explicit tillstånd, samma regel
  som gällt patientdata hela dagen — se `[[cco-patientdata-aldrig-i-agent-konversation]]`
  i minnessystemet. En datamigrering av bokningar och patientanteckningar
  är per definition patientdata i stor skala.
- **Slå inte på `CCO_CALENDAR_CREATE_BOOKING_ENABLED` eller
  `ARCANA_PUBLIC_WEB_BOOKING_ENABLED`** utan uttrycklig instruktion — båda
  är medvetet låsta av, och att flippa dem är en drift-/produktionsändring,
  inte en dokumentationsändring.
