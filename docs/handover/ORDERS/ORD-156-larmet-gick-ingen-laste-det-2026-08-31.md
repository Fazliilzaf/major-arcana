# ORD-156 · Larmet gick, ingen läste det

**Arbetsorder · 2026-08-31**
**Bas:** `main` (`a64f9a5c`)
**Föregås av:** ORD-155 (kod-defaults öppnar), ORD-74 (render.yaml)
**Grind:** `CCO_SEND_LIVE` orörd · ordern ändrar **inga** produktionsvärden
**Prioritet:** P1 — kontrollen finns, den är bara inte kopplad till en människa

---

## Vad som hände

Prod tappade sin miljökonfiguration någon gång under 2026-08-31.

```
11:34   publicWebBookingEnabled = False      → nyckeln FANNS
18:38   publicWebBookingEnabled = True       → nyckeln var borta, kod-defaulten tog över
```

Kod-defaulten är `'true'` (`config.js:28`), så `False` kl 11:34 är bara möjligt om
ett explicit värde fanns då. Det försvann alltså under dagen — miljön var inte
tom hela tiden.

Resultatet: den publika webbokningen stod öppen i prod i sju timmar mot
`website-booking-policy.mdc`. Skadan blev noll, men av tur — hemsidan bokar via
Clientos egen widget och rör aldrig Arcana.

### Skalan

```
render.yaml deklarerar     122 env-nycklar
tjänsten har                 2   (ARCANA_OWNER_EMAIL, ARCANA_OWNER_PASSWORD)
```

Samtliga 29 nycklar i `RENDER_RUNTIME_DEFAULTS` rapporteras som tillämpade i
`_diag/env` — appen skrev in sina egna värden för allihop, vilket bara sker när
miljön saknar dem.

Och en del går inte att återställa ur repot:

```yaml
render.yaml:107-114
  ARCANA_GRAPH_TENANT_ID      sync: false
  ARCANA_GRAPH_CLIENT_ID      sync: false
  ARCANA_GRAPH_CLIENT_SECRET  sync: false
  ARCANA_GRAPH_USER_ID        sync: false
```

`sync: false` betyder att Blueprinten aldrig bär värdet. Graph-credentials,
Resend-nyckeln och Cliento-nyckeln är borta och finns ingenstans i koden. Det
förklarar varför ingen märkte något: utan credentials var mail- och Graph-vägarna
redan döda, så de tystnade utan att fela.

Kvar står **ägarkontots lösenord i klartext** — den enda satta nyckeln.

---

## Mekanismen står i vår egen kod

```
scripts/restore-render-env-from-blueprint.sh:3
  "Render PUT /env-vars ERSÄTTER hela listan — detta skript mergar säkert."
```

Ett anrop som skickar två variabler raderar de andra hundratjugo. Elva
`apply-*-prod`-skript gör `PUT` mot den endpointen. Alla ser ut att hämta hela
listan först — men marginalen är noll, och en enda partiell `GET` räcker.

---

## Larmet gick faktiskt. Det landade bara ingenstans.

Det här är orderns kärna, och den obehagliga delen:

```yaml
.github/workflows/post-deploy-prod-heal.yml
on: push: branches: [main]          ← kör vid VARJE push

rad 121-123
  - name: Verify Render env count
    if: env.RENDER_API_KEY != ''    ← ingen continue-on-error
    run: node ./scripts/verify-render-env-count.js
```

```js
scripts/verify-render-env-count.js:10
  const minCount = Number(process.env.RENDER_ENV_MIN_COUNT || '25');
```

Med två nycklar mot ett golv på 25 har det steget **failat vid varje push till
main hela dagen** — inklusive pushar gjorda under själva undersökningen av
incidenten. Ingen tittade.

Vi hade alltså inte en saknad kontroll. Vi hade en kontroll som skrek i sju
timmar utan mottagare.

### Och återställningen är låst

```yaml
rad 86-93
  - name: Restore Render env from blueprint
    if: >-
      github.event_name == 'workflow_dispatch' &&
      inputs.restore_env_from_blueprint == 'true'
```

Vid push skrivs `"Env restore hoppas över (säkerhetslås)."` Låset är rimligt — en
automatisk `PUT` mot prod-env vid varje push vore värre än problemet. Men
kombinationen "upptäcker automatiskt, åtgärdar aldrig, larmar till ingen" ger
sämsta möjliga utfall.

### Deployen gick dessutom förbi hela kedjan

Kvällens deploy kördes som `render deploys create srv-… --confirm` direkt från
CLI:n, inte via `deploy-cloud-safe.yml`. Så länge den vägen är öppen spelar det
ingen roll hur bra grindarna i workflowen är.

---

## Uppgiften

### 1 · Larmet ska nå en människa

`verify-render-env-count.js` failar redan korrekt. Det som saknas är att någon
får veta det.

- Steget som failar ska skicka en avisering — mail till ägaren räcker, det ska
  inte kräva att någon öppnar Actions-fliken.
- Meddelandet ska säga **vad** som är fel och **vad man gör**: antal nycklar,
  förväntat golv, och länken till heal-workflowen med `restore_env_from_blueprint`.

Ett rött kryss i ett gränssnitt ingen tittar på är inte en kontroll.

### 2 · Golvet ska spegla verkligheten

`RENDER_ENV_MIN_COUNT` är `25`. `render.yaml` deklarerar `122`. Ett golv på 25
hade passerat med 100 saknade nycklar.

Sätt golvet ur Blueprinten i stället för ur en gissning: räkna nycklarna i
`render.yaml` och kräv minst antalet icke-`sync: false`. Driver någon in en ny
nyckel följer golvet med, utan att någon minns att höja en siffra.

### 3 · Hemligheterna ska bevakas separat

Antalet säger ingenting om `ARCANA_GRAPH_CLIENT_SECRET`. `verify-render-env-count.js`
har redan en `CRITICAL`-lista med fyra Graph-nycklar — utöka den med Resend,
Cliento och de övriga `sync: false`-nycklarna, och rapportera dem **för sig**:

```
env-nycklar: 118/122          OK
hemligheter: 6/9 satta        FAIL — saknar RESEND_API_KEY, CLIENTO_API_KEY, …
```

En grön räkning får aldrig dölja en tom hemlighet.

### 4 · Deploy får inte gå förbi grinden

`render deploys create` rakt från CLI:n kringgår `deploy-cloud-safe.yml`. Antingen
stängs den vägen (Render deploy-nyckeln flyttas till CI och tas ur människors
händer), eller så körs samma env-räkning som ett **pre-deploy**-steg som vägrar
deploya mot en tom miljö.

Jag lutar åt det senare: det är svårare att gå förbi en kontroll som sitter i
vägen än en som sitter efteråt.

### 5 · Blueprinten ska antingen gälla eller bort

`render.yaml` styr ingenting i dag — den är dokumentation som ser ut som sanning,
inklusive kommentaren från 2026-08-08 som påstår att booking-flaggan "redan är
explicit false i Dashboard". Det var fel när det skrevs.

Antingen kopplas Blueprinten på och blir källan, eller så tas den bort och
ersätts av en ärlig checklista. Det är ett driftbeslut — **föreslå, bygg inte.**

---

## Fällan

**Återställning ger inte tillbaka hemligheterna.**

`restore-render-env-from-blueprint.sh` mergar in de icke-hemliga värdena ur
`render.yaml`. Efter den körningen ser antalet friskt ut medan Graph, Resend och
Cliento fortfarande är tomma — och `sync: false`-nycklarna finns inte i något
repo. De måste in för hand, ur en lösenordshanterare.

```
antal nycklar återställt   →  ser grönt ut
hemligheter                →  fortfarande borta
```

Det är precis den falska tryggheten punkt 3 finns för att förhindra. Bygg punkt 3
**före** någon frestas att lita på en grön räkning.

**Rör inga produktionsvärden i den här ordern.** Återställningen är drift och
görs av Fazli i Render. Ordern bygger bevakningen, inte innehållet.

---

## Godkänt när

1. Ett failat env-count-steg skickar avisering till ägaren, med antal, golv och
   åtgärdslänk. Testat genom att köra mot ett påhittat golv som garanterat failar.
2. Golvet härleds ur `render.yaml`, inte ur en hårdkodad siffra. Ett test som
   lägger till en nyckel i en fixtur och visar att golvet följer med.
3. Hemligheter rapporteras separat från antal. Ett test där antalet är fullt men
   en hemlighet saknas — utfallet ska vara FAIL, inte grönt.
4. En deploy mot en miljö under golvet stoppas **före** deploy. Ett test på
   pre-deploy-steget.
5. `render deploys create` går inte längre förbi grinden, eller så finns en
   dokumenterad motivering till varför vägen står kvar.
6. Mutationstesta punkt 3: fyll listan med värden, töm en hemlighet, visa att
   testet blir rött.
7. **Inget produktionsvärde ändrat av ordern.**
8. Rapporten anger vilka `sync: false`-nycklar som finns, så Fazli vet exakt vad
   som måste fyllas i för hand.

---

## Vad jag inte avgjort

**Vem eller vad som tömde miljön.** Render-API:t har ingen audit-yta; svaret finns
i Dashboardens Events-logg och kräver den åtkomsten. Frågan är inte akademisk: om
en deploy-process kan tömma env-värden räcker det inte att fylla på listan en
gång. Titta i loggen mellan 11:34 och 18:38.

**Om något av de elva `apply-*-prod`-skripten är boven.** Alla hämtar listan före
`PUT`, men en partiell `GET` — pagineringsfel, timeout, tyst tom lista — räcker
för att radera resten. Att granska dem alla mot `scripts/lib/renderEnvApi.js`
(paginerad, fail-hard) är en egen liten order, och den bör skrivas oavsett vad
Events-loggen säger.

**Ägarlösenordet.** Det ligger i klartext i Render-env:t och lästes ut via API:t
under undersökningen — det finns nu i ett sessionstranskript. Rotationen är
Fazlis och görs i Render. Ordern rör den inte, men den ska inte glömmas bort för
att den inte är en kodändring. I kombination med att
`ARCANA_AUTH_OWNER_MFA_REQUIRED` saknas — och därmed kod-defaultar till `false`
(ORD-155 §1) — har ägarkontot till ett journalsystem varken skyddat lösenord
eller andra faktor.
