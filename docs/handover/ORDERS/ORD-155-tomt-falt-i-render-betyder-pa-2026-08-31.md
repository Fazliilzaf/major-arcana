# ORD-155 · Tomt fält i Render betyder "på"

**Arbetsorder · 2026-08-31**
**Bas:** `main` (`3d503d74`)
**Föregås av:** ORD-74 (render.yaml), ORD-86 (bas-URL-blindheten), ORD-153 §6 (sändgrinden), `.cursor/rules/website-booking-policy.mdc`
**Grind:** `CCO_SEND_LIVE` orörd · inga produktionsvärden ändras av den här ordern

---

## Vad som hände

Under granskningen av ORD-154:s deploy läste jag `_diag/env` två gånger samma dag:

```
11:34 (41101345)   publicWebBookingEnabled = False   availability → 503
18:38 (3d503d74)   publicWebBookingEnabled = True    availability → 200, bokningsbara tider
```

Den publika webbokningen stod öppen i prod i knappt sju timmar, mot en policy som
säger att den ska vara av tills CCO-bokningen är godkänd. Fazli, tillfrågad:

> **"ne den ska inte på bokkningen det är fortfarande cliento som ska ha hand om
> bokingen våran kalender segment är inte redo för bokningar"**

**Ingen kod orsakade det.** `git log 41101345..3d503d74 -- render.yaml src/config.js`
är tom.

### Skadan blev noll — men av tur, inte konstruktion

`hairtpclinic.com/boka` laddar Clientos egen widget:

```
script:  https://cliento.com/widget-v3/cliento.js
element: ClientoBookingWidget
träffar på "arcana" / "/api/" / "booking-engine":  0
```

Hemsidan pratar direkt med Cliento och rör aldrig Arcana. Noll bokningsfall
skapades i Arcana under fönstret. Men `/api/public/booking-engine/reservations`
låg öppet för vem som helst som kände till adressen, och den skapar riktiga
reservationer och skickar bekräftelsemail i klinikens namn. Att ingen hittade dit
är inte en spärr.

---

## Mekanismen

```js
src/config.js:5    const RENDER_RUNTIME_DEFAULTS = Object.freeze({ … })
src/config.js:45   function applyRenderRuntimeDefaults() {
src/config.js:49     if (!asNonEmptyString(process.env[key])) {
src/config.js:50       process.env[key] = value;      // ← appen skriver in sitt eget värde
```

Saknas nyckeln i Render skriver appen in tabellens värde vid uppstart. För
booking-flaggan är det värdet `'true'` (rad 28). **Tomt fält betyder alltså inte
"osatt" — det betyder "på".**

Det står i motsättning till både policyn och deploy-filen:

```yaml
render.yaml:178-179
  - key: ARCANA_PUBLIC_WEB_BOOKING_ENABLED
    value: "false"
```

Och kodbasen är inte ens överens med sig själv:

```js
src/config.js:980              asBool(process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED, true)   // öppen
src/infra/publicWebBooking.js:8  String(process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED || 'false')  // stängd
```

Två moduler, samma flagga, motsatta defaults. Vilken som gäller beror på vem som
frågar.

---

## Det större problemet: tabellen failar åt olika håll

Just nu är **samtliga 29 nycklar** i tabellen tillämpade i prod — dashboarden
saknar värde för alla. Det är inte en flagga som glidit, det är hela
konfigurationen som vilar på kod-defaults.

Vissa av dem stänger, som de ska:

```
ARCANA_GRAPH_READ_ENABLED           'false'
ARCANA_GRAPH_SEND_ENABLED           'false'
ARCANA_MAIL_SHADOW_SEND             'false'
ARCANA_CLIENTO_INTEGRATION_ENABLED  'false'
```

Andra öppnar:

```
ARCANA_PUBLIC_WEB_BOOKING_ENABLED   'true'    ← incidenten
ARCANA_STAFF_JOURNAL_OPEN_ACCESS    'true'    (config.js:1025 defaultar också true)
ARCANA_AUTH_OWNER_MFA_REQUIRED      'false'   ← av = MFA krävs inte
ARCANA_MARKETING_CONNECTORS_ENABLED 'true'
ARCANA_MARKETING_CONNECTORS_MODE    'live'
ARCANA_MARKETING_CONNECTORS_LIVE_FETCH 'true'
ARCANA_MARKETING_{GOOGLE_ADS,META,LINKEDIN}_ENABLED  'true'
```

En glömd nyckel öppnar alltså patientbokning, journalåtkomst och tre
marknadsföringskopplingar i live-läge, men stänger aldrig något. Det är fel håll
för ett system som hanterar patientdata under en pågående frys.

---

## Uppgiften

### 1 · Öppnande defaults vänds till stängande

```
ARCANA_PUBLIC_WEB_BOOKING_ENABLED   'true'  →  'false'
ARCANA_AUTH_OWNER_MFA_REQUIRED      'false' →  'true'
ARCANA_MARKETING_CONNECTORS_MODE    'live'  →  'mock'
ARCANA_MARKETING_CONNECTORS_LIVE_FETCH 'true' → 'false'
ARCANA_MARKETING_{GOOGLE_ADS,META,LINKEDIN}_ENABLED  'true' → 'false'
```

Regeln: **en glömd nyckel får aldrig öppna något.** Att slå på kräver ett
uttryckligt värde i Render — ett beslut någon fattat, inte ett tomt fält.

`ARCANA_STAFF_JOURNAL_OPEN_ACCESS` lämnar jag utanför: den styr personalens
åtkomst till journaler i den dagliga driften, och att vända den blint kan låsa
ute kliniken mitt i en arbetsdag. Utred vad `false` faktiskt innebär för
personalytan och **föreslå** — bygg inte.

### 2 · En flagga, en default

`config.js:980` och `infra/publicWebBooking.js:8` ska läsa samma sanning. Gör som
`ccoSendLiveGate` (ORD-153 §6): **en modul äger avläsningen**, alla andra
importerar den. Sök efter fler flaggor som läses på två ställen med olika
fallback och rapportera vad du hittar, även det du låter vara.

### 3 · Uppstarten skriker om en öppnande flagga kom från default

```
[config] VARNING: ARCANA_PUBLIC_WEB_BOOKING_ENABLED saknas i miljön
         — kör på kod-default. Sätt ett explicit värde i Render.
```

Bara för flaggorna i punkt 1. En rad per flagga, vid boot. Tystnad var det som
lät sju timmar gå.

### 4 · `_diag/env` visar varifrån värdet kom

`renderDefaultsApplied` finns redan, men den är en lista man måste veta att man
ska korsläsa. Lägg källan bredvid värdet:

```json
"publicWebBookingEnabled": { "value": false, "source": "render" | "code-default" }
```

Det var precis den kopplingen jag fick göra för hand för att förstå vad som hänt.

---

## Fällan

**Rör inga produktionsvärden i den här ordern.**

Punkt 1 ändrar vad som händer när en nyckel saknas. Sätts samtidigt värden i
Render, eller vänds en flagga som något i drift förlitar sig på, går det inte
längre att avgöra vad som orsakade nästa symtom.

```
kod-defaults          →  den här ordern
värden i Render       →  Fazli, separat, med lista
ARCANA_STAFF_JOURNAL_OPEN_ACCESS  →  utreds, föreslås, byggs inte
```

Efter punkt 1 gäller dessutom: den som deployar **måste** ha satt
`ARCANA_PUBLIC_WEB_BOOKING_ENABLED` explicit i Render innan nästa omstart, annars
stängs bokningsvägen av den nya defaulten. Det är önskat läge i dag — men det ska
stå i rapporten, inte upptäckas.

---

## Godkänt när

1. Ingen flagga i `RENDER_RUNTIME_DEFAULTS` öppnar något när den saknas. Ett test
   som kör `applyRenderRuntimeDefaults` med tom `process.env` och asserterar att
   varje flagga i punkt 1 blir stängd.
2. `config.js` och `infra/publicWebBooking.js` läser samma funktion. Ett test som
   visar att båda ger samma svar för `''`, `'off'`, `'true'`, osatt.
3. Boot-varning per öppnande flagga som kom från default. Ett test på utskriften.
4. `_diag/env` bär `source` per flagga. Ett test för `render` och för
   `code-default`.
5. **Inget produktionsvärde ändrat.** `render.yaml` orörd i den här ordern.
6. Mutationstesta punkt 1: sätt tillbaka `'true'` för booking-flaggan och visa att
   testet i punkt 1 blir rött.
7. `CCO_SEND_LIVE` orörd.
8. Rapporten listar vilka flaggor som vändes, vilka som lämnades och varför.

---

## Tillägg 2026-08-31, efter mätning mot Render-API:t

Tre av frågorna nedan är nu besvarade, och svaren gör ordern allvarligare.

### Tjänsten har två miljövariabler. Totalt.

```
srv-d8b3i3tckfvc73clgeng
  ARCANA_OWNER_EMAIL
  ARCANA_OWNER_PASSWORD
```

Inget annat. Ingen av de ~29 nycklar `render.yaml` deklarerar finns i tjänsten.
Det var alltså aldrig ett värde som **försvann** mellan 11:34 och 18:38 — miljön
fylldes sannolikt aldrig. `render.yaml` är en Blueprint som inte är synkad:
dokumentation utan verkan, inklusive kommentaren från 2026-08-08 som påstår att
booking-flaggan "redan är explicit false i Dashboard". Den var det inte.

Det förklarar också varför booking-flaggan kunde skifta mellan två avläsningar
samma dag utan att någon rörde något: värdet har hela tiden kommit från
kod-defaulten, och det enda som ändrades var vilken kod som kördes.

### Den enda satta nyckeln är ett lösenord i klartext

`ARCANA_OWNER_PASSWORD` är ägarkontots lösenord, i klartext i Render-env:t, och
det lästes ut via API:t under undersökningen — det ligger nu i ett
sessionstranskript. **Det ska roteras.**

Kombinationen är det verkliga problemet:

```
ARCANA_OWNER_PASSWORD             satt, klartext, exponerat
ARCANA_AUTH_OWNER_MFA_REQUIRED    saknas  →  kod-default 'false'  →  MFA krävs inte
```

Ägarkontot till ett system med patientjournaler har alltså ett exponerat lösenord
och ingen andra faktor — och avsaknaden av andra faktor kommer från precis den
mekanism den här ordern finns för att rätta. Punkt 1:s vändning av
`ARCANA_AUTH_OWNER_MFA_REQUIRED` till `'true'` är därmed inte kosmetisk
konsistens; den är ordens viktigaste rad.

**Rotationen är Fazlis och görs i Render, inte här.** Ordern rör den inte.

### `ARCANA_STAFF_JOURNAL_OPEN_ACCESS` ska inte vändas — den är en no-op i prod

```js
authMiddleware.js:216-219
const previewAllowed = !(config.isProduction ?? process.env.NODE_ENV === 'production');
const staffOpenAccess = previewAllowed && shouldUseStaffJournalOpenAccess(req, config);
```

All preview- och open-access-elevation är hårt gatead till non-production.
Farhågan i punkt 1 om att låsa ute kliniken var ogrundad.

Verifierat utifrån, inte bara läst — eftersom hela gaten hänger på att
`NODE_ENV === 'production'`, och `NODE_ENV` är inte en av de två satta nycklarna:

```
401  /cco-patient-master/patients     {"error":"Inloggning krävs."}
401  /cco-commercial/patient-case     {"error":"Inloggning krävs."}
401  /cco-bookings/cases              {"error":"Inloggning krävs."}
401  /cco-journal/entries             {"error":"Inloggning krävs."}
401  Bearer __preview_local__         {"error":"Sessionen är ogiltig…"}
```

Grinden håller. Flaggan får gärna bli `'false'` som kod-default för konsistens,
men den har noll prod-effekt och ska inte prioriteras som säkerhetsåtgärd.

---

## Vad jag inte avgjort

**Vem eller vad som lämnade miljön tom.** Render-API:t saknar audit-yta; svaret
finns i Dashboardens Events-logg och kräver någon med den åtkomsten. Frågan är
inte akademisk: om en deploy-process kan tömma env-värden är det ett större
problem än defaulterna, och då räcker det inte att fylla på listan en gång.

**Om render.yaml ska rättas eller tas bort.** Nu vet vi att den inte styr något.
En Blueprint som ingen synkar är värre än ingen Blueprint — den ser ut som
sanning. Antingen kopplas den på (och blir sanning), eller så tas den bort och
ersätts av en checklista som är ärlig om att värdena sätts för hand. Det är ett
driftbeslut, inte ett kodbeslut.

**Om render.yaml alls styr tjänsten.** _(Besvarad ovan: nej.)_ Filen säger
`"false"`, prod körde `true`. Antingen är tjänsten dashboard-styrd och
`render.yaml` är dokumentation utan verkan, eller så synkas den inte. Det avgör
om filen ska rättas eller tas bort —
och det går inte att svara på härifrån. Ta reda på det och **rapportera**, ändra
inget.

**Varför värdet försvann mellan 11:34 och 18:38.** Jag kan visa att det fanns och
sedan inte fanns. Vem eller vad som tog bort det vet jag inte. Render har
audit-logg — värt att titta i, för om något raderar env-värden vid deploy är det
ett större problem än defaulterna.

**Om `ARCANA_CLIENTO_INTEGRATION_ENABLED` ska vara `true`.** Den står `false` och
stänger Arcanas interna Cliento-vyer (`publicClinic.js:104`,
`ccoBookings.js:1904`, `:2068` → `503 cliento_booking_disabled`). Kunderna berörs
inte — de bokar i Clientos egen widget. Men om personalen förväntat sig se
Cliento-tider inne i Arcana är det en egen fråga. Utred, föreslå, bygg inte.
