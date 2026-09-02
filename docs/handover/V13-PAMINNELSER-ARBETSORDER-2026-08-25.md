# V13 — bokningsbekräftelse och 24h-påminnelse

**Arbetsorder till DeepSeek · 2026-08-25**
**Repo:** `major-arcana` (CCO) · **Gren att utgå från:** `main` @ `37b2676b`
**SMS-leverantör: 46elks.** Beslutet är fattat, Twilio-vägen ska inte byggas ut.

---

## Läs det här först

Det mesta är redan byggt. Det är lätt att tro att V13 ska skrivas från
grunden och råka bygga en andra pipeline bredvid den som finns. Gör inte
det — det har redan hänt en gång i det här repot, se fällan längst ner.

Kartläggningen nedan är gjord med kommandon mot koden, inte ur minnet.
Varje påstående går att kontrollera på angiven fil och rad.

---

## Vad som redan finns och fungerar

| Del                    | Fil                                                           | Status |
| ---------------------- | ------------------------------------------------------------- | ------ |
| E-postmall påminnelse  | `src/templates/bookingReminderEmail.js`                       | Klar   |
| E-postmall bekräftelse | `src/templates/bookingConfirmationEmail.js`                   | Klar   |
| Bekräftelse-utskick    | `src/ops/bookingConfirmationDispatch.js`                      | Klar   |
| Påminnelseköen         | `ccoPatientCareOps.js` → `buildCustomerReminderQueue`         | Klar   |
| E-postutskick          | `ccoPatientCareOps.js` → `dispatchPatientVisitReminderEmails` | Klar   |
| SMS-anslutning 46elks  | `src/sms/smsConnector.js` → `send46elks`                      | Klar   |
| SMS i schemaläggaren   | `src/ops/scheduler.js` rad 675–715                            | Klar   |
| Dedup per kanal        | `patientCareStateStore.wasReminderSent` (72h-fönster)         | Klar   |
| Lead-time-konfig       | `src/ops/bookingReminderLeadTime.js`                          | Klar   |
| Spar-route             | `src/routes/ccoSettings.js` rad 64                            | Klar   |

Schemaläggarjobbet heter `cco_customer_reminders`, ligger i
`src/ops/scheduler.js` rad 4658 och kör var 6:e timme.

**SMS-pipen är alltså komplett.** Den är bara aldrig aktiv, av två skäl
som båda står nedan.

---

## Uppgift 1 — Slå på 46elks i produktion

`smsConnector.js` → `resolveProvider()` returnerar `'none'` om inga
env-variabler är satta, och `isConfigured()` blir då `false`. Rad 678 i
`scheduler.js` hoppar över hela SMS-blocket. Det är därför inget SMS går ut.

Sätts på Render (Fazli har kontot — **be honom sätta värdena, lägg dem
aldrig i repot**):

```
SMS_PROVIDER=46elks
ELKS_API_USERNAME=<från 46elks>
ELKS_API_PASSWORD=<från 46elks>
SMS_FROM_NUMBER=HairTP
```

`SMS_FROM_NUMBER` faller tillbaka på `'HairTP'` om den utelämnas
(`send46elks`, rad ~5 i funktionen). Alfanumeriskt avsändarnamn fungerar i
Sverige men kan inte ta emot svar — bekräfta med Fazli att det är önskat,
annars behövs ett riktigt nummer.

**Acceptans:** ett testutskick till ett eget nummer i staging, loggat i
`patientCareStateStore` med `channel: 'sms'`. Skicka **inte** testmeddelanden
mot riktiga kundnummer.

---

## Uppgift 2 — Lägg påminnelsetiden i Kalender-sektionen

Backend kan redan ta emot den. `ccoSettings.js` rad 64 sparar
`bookingReminderLeadTime.globalDefaultHours`. Det finns ingen yta som skickar
värdet.

Fil: `public/major-arcana-preview/cco-installningar-v3-2.html`,
Kalender-panelen börjar rad 1205.

Följ det befintliga mönstret i samma panel — varje kontroll är en `.row` med
`data-setting`, och insamlingen sker på rad 1877 via
`document.querySelectorAll('[data-setting]')`. Lägg till en rad efter
"Automatisk bokningsbekräftelse":

- Etikett: **Påminnelsetid**
- Beskrivning: hur långt före besöket påminnelsen går ut
- Kontroll: `<select data-setting="bookingReminderLeadTime.globalDefaultHours">`
  med 24, 48 och 72 timmar

Konfigformen har också `channelDefaults` med `online`, `physical` och
`default` (se `normalizeBookingReminderLeadTimeConfig`). **Bygg inte ut dem
nu** — global lead time först, per kanal när den fungerar.

Kontrollera att insamlingen på rad 1877 klarar punktnotation med två nivåer.
Idag hanteras `toggles.*` och `sidebarSections.*`; om den bara delar på
första punkten behöver den justeras. Läs koden innan du skriver.

**Acceptans:** ändra värdet i UI:t, ladda om sidan, värdet ligger kvar. Och
`GET` på settings-routen returnerar det sparade värdet.

---

## Uppgift 3 — Koppla reglaget som redan finns men inte gör något

`cco-installningar-v3-2.html` rad ~1237 har en switch
`data-setting="toggles.automaticBookingConfirmation"`, förvald påslagen.
Den enda träffen i backend är defaultvärdet i `ccoSettingsStore.js` rad 18.
**Ingen kod läser den.** Personalen kan alltså stänga av automatisk
bokningsbekräftelse och bekräftelser fortsätter gå ut.

Låt `bookingConfirmationDispatch.js` läsa flaggan och avstå när den är av.

**Acceptans:** ett test som slår av flaggan och verifierar att inget
utskick sker. Mutationstesta det — ta bort din kontroll och se att testet
blir rött. Blir det inte rött testar det ingenting.

---

## Uppgift 4 — Regressionstest på hela kedjan

Det finns idag inget test som går från bokning till skickat SMS.

Täck minst:

1. Kö byggs för besök inom lead time, inte för besök utanför
2. Saknat telefonnummer → `skipped`, inte krasch
3. Dedup: andra körningen inom 72h skickar inte om
4. `isConfigured() === false` → hela SMS-blocket hoppas över, e-post går ändå
5. Avslag från 46elks → `skipped`, körningen fortsätter för övriga i kön

Följ mönstret i `tests/ops/` — svenska testnamn, och en kommentar överst som
förklarar vilken verklig incident testet skyddar mot.

---

## Fällan — läs innan du börjar

`src/ops/bookingReminderScheduler.js` ser ut som rätt ställe. Det är det inte.
Filen är märkt `@deprecated 2026-05-28` och dess egen dokumentation räknar upp
varför:

- `bookingEngineStore.save` är inte exporterad → ingen persistens
- storen normaliserar bort `booking.reminders` vid load → dedup omöjlig efter
  omstart
- funktionen registrerades aldrig i schemaläggaren, sannolikt för att undvika
  dubbla mejl till samma kund

Den ligger kvar för att tester importerar den. **Anropa den inte, och registrera
den inte i schemaläggaren.** Allt arbete sker i `cco_customer_reminders`.

---

## Gränser

- Rör inte CMO. Det är ett annat repo och en annan tråd.
- Lägg inga hemligheter i repot. Env-variabler sätts på Render av Fazli.
- Bygg inte ut Twilio. 46elks är valt.
- Hitta inte på adresser eller telefonnummer till personal eller kunder.
- Skicka inga testmeddelanden mot riktiga kundnummer.
- En gren, en commit-serie, svenska commit-meddelanden som förklarar _varför_.

## Innan du säger klart

Kör hela sviten. Den har **7 röda tester sedan tidigare** som inte är dina:
`availabilityRules`, tre i merge-skriptet, `visit-segments` och två CTA-tester.
Blir det 8, är den åttonde din.
