# ORD-104 — SMS-påminnelsen når inte kunden: resolva `primaryPhone` från patienten

|                       |                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bas-commit**        | `cb8f3dd4a` (`main`, efter merge av V13 bokningsbekräftelse/24h-påminnelse)                                                                                                |
| **Ägare**             | CCO-agent (implementering + tester)                                                                                                                                        |
| **GO**                | väntar Fazli                                                                                                                                                               |
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

### Numret finns på patienten, och uppslagningen finns redan

- `src/ops/ccoPatientMasterStore.js` exponerar `primaryPhone` (normaliserat via
  `normalizePhone`, rad 177/223) på varje patientpost.
- `getPatient({ tenantId, patientId })` (rad 728) slår upp en patient med ID.
- `listPatientMatchDirectory({ tenantId })` (rad 984) ger en lättviktig katalog
  med `primaryPhone` per patient — lämplig om uppslagningen ska batchas istället
  för en `getPatient` per påminnelse.
- `reminder.patientId` är redan ifyllt i kön (rad 387).

### Kedjan är testad men tom

- `tests/ops/ccoPatientCareSmsReminder.test.js` (5 tester, mutationstestade gröna)
  matar `phone` explicit in i kön. Den testar aldrig att numret **resolveras**,
  vilket är exakt det som saknas i produktion.

## Vad som ska göras — konkret

1. **Resolva telefon i dispatch, inte i kön.** I `dispatchPatientVisitReminderSms`:
   när `reminder.phone`/`customerPhone` saknas, slå upp patienten via en
   **injicerbar** `patientMasterStore` (ny parameter) med `reminder.patientId`,
   och ta `primaryPhone`. Saknas patient eller nummer → hoppa över rad som idag
   (ingen crash), resten av kön fortsätter.
2. **Skicka med storen.** `runCcoCustomerReminders` i `src/ops/scheduler.js` har
   redan `patientMasterStore` i scope — skicka den in i SMS-anropet (samma
   mönster som `buildCustomerReminderQueue` redan använder).
3. **Verifiera E.164.** 46elks kräver E.164 (`+46…`). Kontrollera att
   `normalizePhone` redan ger det; om inte, normalisera innan `sendSms` — läs
   koden, anta inte.
4. **Regressionstester (mutationstestbara), minst:**
   - telefon på raden används som idag (befintliga tester fortsätter gröna);
   - saknad telefon → resolvas via `patientMasterStore.primaryPhone`;
   - saknad telefon + patient saknas → `skipped`, ingen crash;
   - uppslagning kastar → `skipped`, resten av kön fortsätter.
     Befintliga 5 tester i `ccoPatientCareSmsReminder.test.js` ska förbli gröna.

## Icke-mål / gränser

- **Ingen CMO-kod rörs.**
- **Inga hemligheter i repo** — 46elks-nycklarna (`ELKS_API_USERNAME`,
  `ELKS_API_PASSWORD`, `SMS_FROM_NUMBER`) sätts av Fazli på Render, aldrig i kod.
- **Inga påhittade personal-/kundnummer och inga riktiga SMS** i tester — använd
  syntetiska E.164-testnummer.
- **Förläng inte Twilio** — 46elks är valt.
- **Rör inte `bookingReminderScheduler.js`** — den är `@deprecated`.
- **En branch + svenska commit-meddelanden** som förklarar varför.

## Validering (efter varje kodändring)

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit` (inga nya röda; dagens kända röda är pre-existerande)
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
