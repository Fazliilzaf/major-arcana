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

### Två döda anrop i den levande UI:n

- `onBookingClick()` (`cco-kalender-shell.js:483-508`) hämtar
  `/api/v1/calendar/booking/:id/status-pills` — **existerar inte som route**
  någonstans i `src/routes/*.js` eller `server.js`. Misslyckas tyst
  (`catch (_) {}`), visar alltid tomma statuspills.
- `loadIntelligence()` (`cco-kalender-shell.js:1392-1410`) hämtar
  `/api/v1/calendar/booking/:id/intelligence` — samma sak, visar alltid
  "Insikter ej tillgängliga (404)".

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
   historik. **Inte påbörjad.** Sannolikt större än alla andra punkter
   tillsammans. Ingen mekanism finns idag utöver manuell CSV/mejl-parsning.
2. Slå på personalens skriv-UI (`CCO_CALENDAR_CREATE_BOOKING_ENABLED`) när
   redo — flaggan finns redan, bara av.
3. Fixa eller ta bort de två döda endpoint-anropen (`status-pills`,
   `intelligence`).
4. Städa den föräldralösa create-modal-koden — bestäm om den ska bli den
   riktiga vägen eller tas bort.
5. Konsolidera de två parallella bokningsstackarna.
6. Bekräfta `ARCANA_PUBLIC_WEB_BOOKING_ENABLED`s verkliga läge på Render
   Dashboard — går inte att se från repot.

## Föreslagen fasindelning — INTE påbörjad, väntar på Fazlis prioritering

Detta är ett förslag till ordning, inte ett beslut.

- **Fas 0 — KLAR (2026-08-07).** Mätt: 121 782 bokningar totalt i Cliento,
  55 221 importerade, **66 561 (≈55 %) saknas**. Se facit nedan. Inget
  API krävdes — Cliento erbjuder ett riktigt CSV-exportverktyg (`Dataexport`)
  som täcker hela historiken i en fil.
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

## Fas 0 — mätt 2026-08-07, del 2 av 2 — FACIT

Fazli exporterade Clientos eget CSV-underlag direkt (`Dataexport 1 augusti
2021 - 31 augusti 2026.csv`, `Kundexport_nya`-varianter), sparade på
iCloud. Radantal räknat med `wc -l` på Mac:en, rubrikrad läst med `head -1`
— ingen patientdata i den här utredningen, bara struktur och räknetal.

**`Dataexport` är bokningsnivå, inte bokningsrader** — rubrikraden börjar
`"Boknings-id","Bokningsreferens","Skapad tid","Starttid",...`, en unik
`Boknings-id` per rad. Det gör radantalet direkt jämförbart med vår egen
`totalBookingsImporteradeHittills`.

| Mått                                                                   | Värde              |
| ---------------------------------------------------------------------- | ------------------ |
| Bokningar totalt i Cliento (`Dataexport`, 121 783 rader − 1 rubrikrad) | **121 782**        |
| Redan importerade till CCO (del 1 ovan)                                | 55 221             |
| **Gap — inte importerat**                                              | **66 561 (≈55 %)** |

**Slutsats: mer än hälften av alla bokningar saknas i CCO.** Betydligt
större gap än vad ordern ursprungligen antog ("manuell CSV-import,
omfattning okänd"). Det här är inte längre en okänd risk — det är en
kvantifierad, stor datamigrering.

**Kundexport_nya är INTE customer-källan för bokningarna.** Rubrikrad:
`"Namn","Telefon","E-post","Skapad"` — fyra fält, ingen `Kund-id`, inget
personnummer. `Dataexport` har i stället `Kund-id`, `Kundnamn`,
`Kund e-post`, `Personnummer` per bokningsrad — rikare än kontaktlistan.
Det förklarar den tidigare skenbara avvikelsen (7 579 distinkta kunder i
CCO mot 6 745–6 932 rader i Kundexport_nya): fel fil jämfördes mot fel
mått. Kundantalet bör härledas ur `Dataexport`s `Kund-id`, inte ur
`Kundexport_nya`, om det behöver mätas exakt igen.

**`internalNotes: 0`-frågan (del 1) är nu delvis förklarad, inte löst.**
`Dataexport`s rubrikrad har `Bokningsanteckning`, `Meddelande från kund`,
`Anpassade fält`, `Attribut` — men ingen kolumn som uttryckligen heter
något i stil med "interna anteckningar". Trolig förklaring: interna
anteckningar, om de finns, ligger i `Anpassade fält`/`Attribut` och
CSV-importern (`opsClientoBookingsImport.js`) mappar inte de fälten till
`internalNotes`. Fortfarande obekräftat mot faktisk radinnehåll — bara
rubrikraden är läst, aldrig data.

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
