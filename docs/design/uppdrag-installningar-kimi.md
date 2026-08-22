# Uppdrag: koppla in inställningssidan

**System:** CCO · repot `major-arcana` · prod `arcana.hairtpclinic.com`
**Skrivet:** 2026-08-22 · underlag verifierat mot `origin/main` `77fdaf69`

---

## Kort version

Backend för inställningar är färdig sedan länge. Frontend är en attrapp.
Din uppgift är att koppla ihop dem. Bygg ingen ny sida.

---

## Vad som redan finns (rör inte)

`src/routes/ccoSettings.js` (109 rader), monterad i `server.js` rad ~12259 under `/api/v1`:

| Metod | Väg                                           | Roll         | Svar                            |
| ----- | --------------------------------------------- | ------------ | ------------------------------- |
| GET   | `/api/v1/cco/settings`                        | OWNER, STAFF | `{ settings }`                  |
| PUT   | `/api/v1/cco/settings`                        | OWNER, STAFF | `{ ok, settings }`              |
| POST  | `/api/v1/cco/settings/request-delete-account` | OWNER, STAFF | `202 { ok, deleteRequestedAt }` |

Verifierat mot prod utan token: **båda ger 401.** Rutten är skyddad.
Varje läsning och skrivning auditloggas redan (`cco.settings.read`, `cco.settings.update`).
PUT skickar dessutom `settings.bookingPolicy` vidare till bokningsmotorn.

Store: `src/ops/ccoSettingsStore.js`. Tester finns i `tests/ops/ccoSettingsStore.test.js`.

Dokumentet som GET returnerar:

```
theme                    'mist'
density                  'compact'
sidebarSections          lista, 6 poster {id, label, enabled, order}
profileName              'Ditt namn'
profileEmail             'din.email@hairtp.com'
toggles                  objekt, 24 booleaner
mailFoundation           objekt {defaults, customMailboxes}
bookingReminderLeadTime  objekt {globalDefaultHours, channelDefaults, serviceOverrides, resourceOverrides}
bookingPolicy            objekt {globalDefaults, serviceOverrides}
deleteRequestedAt        null
updatedAt                ISO-tid
```

De 24 nycklarna i `toggles`:

```
googleCalendarSync            outlookIntegration           automaticBookingConfirmation
paymentReminders              stripeIntegration            swishPayments
emailSignature                readReceipts                 outOfOfficeAutoReplies
weeklySummary                 customerBehaviorTracking     exportToExcel
smartReplySuggestions         automaticPrioritization      churnPrediction
desktopNotifications          soundAlerts                  slaAlerts
teamMentions                  twoFactorAuth                activityLogging
compactConversationView       colorCodedPriorities         advancedFilters
```

---

## Vad som är trasigt

`public/major-arcana-preview/cco-installningar-v3-2.html`, 1595 rader.

Sidan nås i produkten via `/admin#cco` → **Mer** → **Inställningar**.
`public/admin/cco-subnav.js` rad 74 byter iframens `src` till den här filen.

Jag har gått igenom alla interaktiva element i filen:

|                                                  | antal |
| ------------------------------------------------ | ----- |
| interaktiva kontroller totalt                    | 46    |
| med `fetch()` eller XHR mot ett API              | **0** |
| som skriver till `localStorage`                  | **0** |
| helt utan handler                                | 35    |
| med enbart visuell effekt (togglar en CSS-klass) | 11    |

Filen innehåller noll `fetch(`, noll `XMLHttpRequest`, noll `<form>`, noll `localStorage`.
De två enda `addEventListener` (rad 1568 och 1581) byter bara `aria-pressed`
respektive `is-active` i DOM.

**Inget element har `id` eller `name`.** Kontrollerna går bara att hitta via
`aria-label` eller synlig text. Det är det första du behöver ändra på.

---

## Uppgiften

Koppla de 46 kontrollerna till API:et som redan finns.

### 1. Ge kontrollerna fasta krokar

Lägg `data-setting="<nyckel>"` på varje kontroll. Matcha inte på etikettext —
den ändras när någon skriver om en rubrik, och då slutar sidan spara utan att
något test går sönder.

Mappningen är ett-till-ett och redan bestämd av storen:

- 24 switchar → `toggles.<nyckel>` enligt listan ovan
- 6 switchar under **Sidofält-sektioner** → `sidebarSections[].enabled`, matcha på
  `id`: `ai-prediction`, `metrics`, `templates`, `scheduling`, `upsell`, `assignment`
- 3 knappar under **Utseende → tema** → `theme`
- 3 knappar under **Utseende → täthet** → `density`
- **Redigera profil** → `profileName`, `profileEmail`
- **Radera konto** → `POST /cco/settings/request-delete-account`

### 2. Läs in vid öppning

`GET /api/v1/cco/settings` när sidan laddas, sätt varje kontroll efter svaret.
Idag visar sidan hårdkodade lägen — `googleCalendarSync` står som påslagen i
markupen oavsett vad som faktiskt är sparat.

### 3. Spara vid ändring

`PUT /api/v1/cco/settings`. Skicka hela dokumentet du läste in, med din ändring
applicerad — inte bara det fält som ändrades. Storen skriver över det den får.

Visa att det sparats. En ändring som tyst försvinner vid omladdning är värre än
en knapp som inte går att trycka på.

### 4. Hantera 401

Sidan körs i en iframe under `/admin#cco`. Får du 401, visa det — rendera inte
en sida full av avstängda switchar som ser ut som sparade inställningar.

### 5. Radera konto måste fråga först

Knappen finns redan och heter `btn--danger`. Endpointen flaggar hela tenanten.
Bekräftelsedialog krävs.

---

## Det viktigaste: ljug inte i gränssnittet

Att en switch sparar en boolean betyder **inte** att funktionen bakom finns.

Jag har sökt igenom `src/` och `server.js` efter var de 24 nycklarna faktiskt
läses. Resultat: **`swishPayments` läses av `src/ops/ccoPatientPaymentHistory.js`.
De övriga 23 lagras och läses av ingen.**

`stripeIntegration: true` betyder alltså inte att Stripe är igång. `twoFactorAuth`
slår inte på tvåfaktor. `churnPrediction` förutsäger ingenting.

Om du kopplar in alla 24 utan att säga det får personalen en panel som ser ut att
styra kliniken men bara sparar kryss i en fil. Det är sämre än dagens attrapp,
för attrappen ljuger åtminstone uppenbart.

**Så gör i stället:** märk varje switch vars nyckel inte läses någonstans. En
diskret rad räcker — "sparas, men styr inget än". Vi tar bort märkningen i takt
med att funktionerna byggs.

Vill du hellre dölja de 23 helt och bara visa `swishPayments` plus tema, täthet,
sidofält och profil — säg till, det är också ett rimligt svar. Men de får inte
stå omärkta.

---

## Två saker som inte går ihop

1. **`theme` är `'mist'` i storen.** Sidan erbjuder Ljust / Mörkt / Auto. Ingen av
   dem är `mist`. Ta reda på vilka värden storen accepterar innan du kopplar
   knapparna — annars skriver första klicket över ett giltigt värde med ett ogiltigt.

2. **`mailFoundation`, `bookingReminderLeadTime` och `bookingPolicy`** finns i
   dokumentet men har ingen motsvarighet på sidan. Rör dem inte i den här
   omgången, men se till att din PUT skickar tillbaka dem oförändrade. Tappar du
   dem nollställer du bokningsreglerna.

---

## Bygg inget nytt

Sidan finns. Designen är godkänd. Uppgiften är att koppla in den, inte att rita om den.

Det finns också en React-bundle, `public/major-arcana-preview/app.bundle.js`, som
innehåller strängarna för samma 24 nycklar och anropar `/api/v1/cco/settings`.
**Källkoden till den finns inte i repot** — bara den byggda filen. Du kan alltså
inte redigera den komponenten. HTML-sidan är ytan som gäller.

---

## Praktiskt

- Gren från senaste `origin/main`
- Lokalt: port **3199**
- Prod: `arcana.hairtpclinic.com` — **`.com`, inte `.se`**
- Jobba mot CCO, inte mot test
- Kör `npm run check:syntax`, `npm run lint:no-bypass`, `npm run test:unit`

---

## Acceptanskriterier

Jag har kontrollerat att inget av det här redan är uppfyllt.

1. Sidan gör ett `GET /api/v1/cco/settings` vid laddning och sätter kontrollerna
   efter svaret. _(Idag: noll fetch i filen.)_
2. En ändrad switch ger ett `PUT` och överlever en omladdning. _(Idag: ingenting sparas.)_
3. Varje kontroll bär `data-setting`. _(Idag: inga id, name eller data-attribut alls.)_
4. PUT skickar tillbaka `mailFoundation`, `bookingReminderLeadTime` och
   `bookingPolicy` oförändrade — visa det med ett test som läser, sparar en
   temaändring, läser igen och jämför att bokningsreglerna är identiska.
5. 401 syns för användaren.
6. Radera konto kräver bekräftelse.
7. De 23 nycklar som ingen läser är märkta, eller dolda efter överenskommelse.
8. Nytt test under `tests/public/`. Mutationstesta det: ändra en sak i koden som
   testet ska fånga, bekräfta att det failar, ställ tillbaka.

Punkt 4 och 8 är de som gör skillnad. Resten är hantverk.
