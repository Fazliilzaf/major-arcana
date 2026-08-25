# ORD-104 · Tillägg — identitetsvägen håller inte

**Granskningsanteckning · 2026-08-25 · till DeepSeek**
**Gäller:** `ORD-104-sms-paminnelse-resolva-primaryphone.md`
**Status:** ORD-104 är rätt i sak. Men uppslagsnyckeln den väljer räcker inte,
och det syns inte förrän i produktion.

---

## Kort version

ORD-104 vill slå upp `primaryPhone` via `patientMasterStore` med
`reminder.patientId`. Problemet är att `patientId` ofta är tomt **med flit**.

Slå upp på `customerEmail` i stället. Den är obligatorisk på varje bokning i
`bookingEngineStore` — utan den skapas ingen bokning alls.

---

## Varför `patientId` inte duger

`ccoBookingsPatientIdResolution.test.js` säger det rakt ut i sin egen rubrik:

> _"Samma princip som för Cliento-bokningarna: tvetydig identitet ger null,
> aldrig en gissning. Det är grunden för att `/calendar-bundle?patientId`
> inte ska läcka en patient till en annan."_

Det är alltså inte en bugg. Det är ett medvetet skydd, och det ska stå kvar.
Men konsekvensen är att `reminder.patientId` är tomt för varje bokning där
identiteten inte gick att fastställa entydigt — och för dem hittar ORD-104:s
uppslag ingenting.

Sex separata testfiler i `tests/ops/` handlar om patientId-upplösning
(`ccoBookingStorePatientId`, `ccoBookingsPatientIdResolution`,
`ccoKunderBookingCasePatientId`, `ccoPatientIdKrock`,
`ccoPatientIdentityProjection`, `clinicCalendarViewPatientId`). När ett fält
kräver sex testfiler är det inte ett fält man bygger en enda uppslagsväg på.

---

## Vad som INTE fungerar — läs innan du börjar

Vid granskningen föreslogs först att propagera telefonen från bokningsraden.
**Det går inte, och det är värt att veta varför så du inte provar.**

```
grep -ci "phone" src/ops/ccoBookingEngineStore.js
→ 0
```

Noll. Bokningarna som `listUpcomingBookings` läser har inget telefonfält
över huvud taget. Det är inte något som tappas bort i kön — det har aldrig
funnits där.

Cliento-bokningarna _har_ telefon (`clientoBookingStore.js` rad 150,
normaliserad), men det är en **annan store**. Påminnelsekön läser
`bookingEngineStore`, inte `clientoBookingStore`. Att koppla ihop dem är ett
eget arbete och ingår inte här.

---

## Vad som ska göras i stället

### `customerEmail` är den nyckel som alltid finns

`ccoBookingEngineStore.js` rad 1074–1076:

```js
const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
if (!tenantId || !conversationId || !customerEmail || !slot) return null;
```

Ingen e-post → ingen bokning. Fältet är garanterat satt på varje rad kön
någonsin ser.

### Uppslagsordning i `dispatchPatientVisitReminderSms`

1. `reminder.patientId` → `patientMasterStore.getPatient` → `primaryPhone`
   _(behåll den, den är snabbast när id:t finns)_
2. Faller den → slå upp på `reminder.customerEmail`
3. Hittar ingen av dem ett nummer → `skipped`, som idag

Uppslaget sker i dispatchen, inte i kön — den delen av ORD-104 är rätt och
ska stå kvar.

### E-postuppslaget ska ärva samma försiktighet

`ccoPatientMasterStore.js` har redan strukturen. `listPatientMatchDirectory`
(rad 984) ger patienter med `emails[]` och `phones[]`, och
`buildPipedrivePatientLookup` (rad 254) bygger `byEmail` som en Map från
e-post till en **array** av patienter — just för att flera kan dela adress.

**Matchar e-posten fler än en patient: hoppa över.** Skicka inte till den
första i listan. Ett SMS till fel person om någon annans besök är en
patientdataincident, inte ett buggat testfall. Samma princip som
patientId-upplösningen redan följer: tvetydigt ger null, aldrig en gissning.

Kliniken har dessutom en känd historik av dubbletter — ORD-101 städade
24 842 cross-tenant-dubbletter så sent som den 13 augusti. Delade och
dubblerade adresser är inte hypotetiska här.

---

## Tester som ska läggas till utöver ORD-104:s fyra

1. `patientId` tomt, e-post matchar en patient med telefon → **SMS skickas**
   _(det här är fallet ORD-104 som den ser ut nu missar helt)_
2. `patientId` tomt, e-post matchar **två** patienter → `skipped`, inget skickat
3. `patientId` satt men patienten saknar telefon, e-post ger en med telefon
   → skickas
4. Varken id eller e-post ger träff → `skipped`, kön fortsätter med nästa

Mutationstesta punkt 2 särskilt: ta bort tvetydighetskontrollen och se att
testet blir rött. Blir det inte rött skyddar det ingenting, och det är just
det testet som står mellan er och ett SMS till fel patient.

---

## Kvar som förut

Gränserna i ORD-104 gäller oförändrat: ingen CMO, inga hemligheter i repo,
inga riktiga nummer i test, ingen Twilio, rör inte `bookingReminderScheduler.js`.

Och sviten har **7 kända röda sedan tidigare** — `availabilityRules`, tre i
merge-skriptet, `visit-segments` och två CTA-tester. Blir det 8, är den
åttonde din.
