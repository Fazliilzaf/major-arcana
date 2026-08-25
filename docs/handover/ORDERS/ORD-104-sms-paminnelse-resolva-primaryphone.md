# ORD-104 — SMS-påminnelsen når inte kunden: resolva `primaryPhone` via `customerEmail`, inte `patientId`

|                       |                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bas-commit**        | `cb8f3dd4a` (`main`, efter merge av V13 bokningsbekräftelse/24h-påminnelse)                                                                                                |
| **Ägare**             | CCO-agent (implementering + tester)                                                                                                                                        |
| **GO**                | Givet 2026-08-25 (med granskningstillägg — uppslagsnyckel rättad från `patientId` till `customerEmail`)                                                                    |
| **Allvarlighetsgrad** | **Blockerande.** Utan den här åtgärden skickas **noll** SMS även efter att 46elks-nycklarna satts på Render. Kedjan ser ut att fungera men räknar varje rad som `skipped`. |
| **Föregångare**       | V13 — bokningsbekräftelse och 24h-påminnelse (mergad i `cb8f3dd4a`)                                                                                                        |

## Bakgrund — hur den här ordern uppstod

V13-ordern (bokningsbekräftelse + 24h-påminnelse via 46elks) bröt ut SMS-blocket
till `dispatchPatientVisitReminderSms` och lade regressionstester. Vid granskningen
upptäcktes en blockerare: kön byggs utan telefonnummer, så SMS:et når aldrig kunden.

Fyndet är verifierat (se nedan), inte antaget: ingen av de två `slots.push` i
`listUpcomingBookings` tar med telefon. `reminder.phone` är alltid `undefined`,
så `dispatchPatientVisitReminderSms` hoppar över varje rad. Numret finns dock att
hämta — på patienten, inte på bokningen.

## Observation — vad som faktiskt finns (verifierat, inte antaget)

### Kön bär inte telefonnummer

- `src/ops/ccoPatientCareOps.js`, `listUpcomingBookings` (rad 372–417) pushar för
  varje bokning/reservation: `kind`, `id`, `patientId`, `customerEmail`,
  `customerName`, `startsAt`, `hoursUntil`, `serviceId`, `resourceId`.
  **Ingen `phone`/`customerPhone`.**
- `dispatchPatientVisitReminderSms` (rad ~1013) läser
  `reminder.phone || reminder.customerPhone` → alltid `undefined` → `skipped += 1`.

### Bokningen bär INTE telefon — och det går inte att "propagera" den därifrån

- `grep -ci "phone" src/ops/ccoBookingEngineStore.js` → **0**. `listUpcomingBookings`
  läser `bookingEngineStore`, vars bokningar aldrig har haft ett telefonfält —
  det är inte något som tappas bort i kön, det har aldrig funnits.
- Cliento-bokningarna har `customerPhone` (`clientoBookingStore.js` rad 150), men
  det är en **annan store**. Att koppla ihop påminnelsekön med `clientoBookingStore`
  är ett eget arbete och ingår **inte** här.

### Nyckeln som alltid finns är `customerEmail`, inte `patientId`

- `src/ops/ccoBookingEngineStore.js` rad 1074–1076:
  `if (!tenantId || !conversationId || !customerEmail || !slot) return null;`
  **Ingen e-post → ingen bokning.** Fältet är garanterat satt på varje rad kön ser.
- `reminder.patientId` däremot är **ofta tomt med flit**: tvetydig identitet ger
  `null`, aldrig en gissning (se `tests/ops/ccoBookingsPatientIdResolution.test.js`,
  vars rubrik säger det rakt ut). Det är ett medvetet läckskydd — och det ska stå
  kvar — men det gör `patientId` oanvändbar som enda uppslagsnyckel.

### Numret finns på patienten, och uppslagningen finns redan

- `src/ops/ccoPatientMasterStore.js` exponerar `primaryPhone` (normaliserat via
  `normalizePhone`, rad 177/223) på varje patientpost.
- `getPatient({ tenantId, patientId })` (rad 728) — snabb väg när `patientId` finns.
- `findPatientByEmail({ tenantId, email })` (rad 744) och
  `findPatientsByEmails({ tenantId, emails })` (rad 759) — e-postvägen. Den senare
  ger en **array** av patienter per e-post, vilket behövs för att upptäcka att
  flera patienter delar samma adress.
- `listPatientMatchDirectory({ tenantId })` (rad 984) — lättviktig katalog med
  `primaryPhone` + `emails` per patient om uppslagningen ska batchas.
- `reminder.customerEmail` är redan ifyllt i kön (rad 388).

### Kedjan är testad men tom

- `tests/ops/ccoPatientCareSmsReminder.test.js` (5 tester, mutationstestade gröna)
  matar `phone` explicit in i kön. Den testar aldrig att numret **resolveras**,
  vilket är exakt det som saknas i produktion — och den täcker inte fallet där
  `patientId` är tomt men telefonen ändå går att nå via e-post.

## Vad som ska göras — konkret

1. **Resolva telefon i dispatch, inte i kön.** I `dispatchPatientVisitReminderSms`
   (ny injicerbar `patientMasterStore`-parameter), i denna ordning:
   1. `reminder.phone`/`customerPhone` — använd rakt av om den finns.
   2. `reminder.patientId` → `patientMasterStore.getPatient` → `primaryPhone`
      (snabbast när id:t finns).
   3. `reminder.customerEmail` → `findPatientsByEmails`/`findPatientByEmail` →
      `primaryPhone`. **Matchar e-posten fler än en patient → hoppa över raden.**
      Skicka aldrig till den första i listan — ett SMS till fel person om någon
      annans besök är en patientdataincident. Samma princip som `patientId`-
      upplösningen redan följer: tvetydigt ger `null`, aldrig en gissning.
      (Kliniken har känd dubbletthistorik — ORD-101 städade 24 842 cross-tenant-
      dubbletter 13 aug. Delade adresser är inte hypotetiska.)
   4. Ingen väg ger ett nummer → `skipped`, som idag, resten av kön fortsätter.
2. **Skicka med storen.** `runCcoCustomerReminders` i `src/ops/scheduler.js` har
   redan `patientMasterStore` i scope — skicka den in i SMS-anropet (samma
   mönster som `buildCustomerReminderQueue` redan använder).
3. **Verifiera E.164.** 46elks kräver E.164 (`+46…`). Kontrollera att
   `normalizePhone` redan ger det; om inte, normalisera innan `sendSms` — läs
   koden, anta inte.
4. **Regressionstester (mutationstestbara), minst:**
   - telefon på raden används som idag (befintliga tester fortsätter gröna);
   - `patientId` tomt, e-post matchar **en** patient med telefon → SMS skickas
     (fallet ORD-104 som den ursprungligen såg ut missar helt);
   - `patientId` tomt, e-post matchar **två** patienter → `skipped`, inget skickat;
   - `patientId` satt men patienten saknar telefon, e-post ger en med telefon →
     skickas;
   - varken id eller e-post ger träff → `skipped`, kön fortsätter;
   - uppslagning kastar → `skipped`, resten av kön fortsätter.
     **Mutationstesta tvetydighetsfallet särskilt:** ta bort tvetydighetskontrollen
     och se att testet blir rött — blir det inte rött skyddar det ingenting, och det
     är just det testet som står mellan er och ett SMS till fel patient.
     Befintliga 5 tester i `ccoPatientCareSmsReminder.test.js` ska förbli gröna.

## Icke-mål / gränser

- **Ingen CMO-kod rörs.**
- **Koppla inte ihop påminnelsekön med `clientoBookingStore`** — telefon på
  Cliento-raden är en annan store och ett eget arbete. Håll dig till
  `bookingEngineStore` + `patientMasterStore`.
- **Inga hemligheter i repo** — 46elks-nycklarna (`ELKS_API_USERNAME`,
  `ELKS_API_PASSWORD`, `SMS_FROM_NUMBER`) sätts av Fazli på Render, aldrig i kod.
- **Inga påhittade personal-/kundnummer och inga riktiga SMS** i tester — använd
  syntetiska E.164-testnummer.
- **Förläng inte Twilio** — 46elks är valt.
- **Rör inte `bookingReminderScheduler.js`** — den är `@deprecated`.
- **Behåll `patientId`-läckskyddet** (tvetydigt → `null`) — ändra aldrig det
  beteendet, bara komplettera med e-postvägen.
- **En branch + svenska commit-meddelanden** som förklarar varför.

## Validering (efter varje kodändring)

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit` — sviten har **7 kända röda** sedan tidigare:
  `availabilityRules`, tre i merge-skriptet, `visit-segments`, två CTA-tester.
  Blir det **8**, är den åttonde din.
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
