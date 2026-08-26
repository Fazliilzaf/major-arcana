# ORD-110 · Mallarna och aftercare-jobben ligger på fel disk

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Bakgrund:** din rapport om `followup_fue_4m` / `_8m`

---

## Din analys var rätt. Mekanismen var fel.

Du hittade rätt sak: mallarna saknas, och 1m/3m/6m/12m krockar med
4/8/12. Du löste det genom att skriva i `data/cco-templates.json` och
`data/cco-aftercare-jobs.json`, och du flaggade själv att `data/` är
gitignorerad.

Två saker till om det, båda kontrollerade:

**Du rörde inga riktiga patienter.** Jobben du skrev om tillhör
`cust_anna`. Övriga kunder i filen heter "B", "BL", "F" och "P". Rena
fixturer. Det var det första jag kollade.

**Men ändringen når inte produktion, och det beror inte på gitignore.**

---

## Vad jag mätte

Jag frågade produktion:

```
GET /api/v1/cco-aftercare/jobs   →   200,  count: 0
```

**Produktion har noll aftercare-jobb.** Inte fel jobb — inga alls.
Endpointen filtrerar inte som standard.

Sedan bad jag om statusmanifestet:

```
GET /api/v1/ops/state/manifest   →   13 stores
```

Alla tretton ligger på `/var/data`: `auth`, `templates`, `tenantConfig`,
`memory`, `ccoHistory`, `ccoNotes`, `ccoFollowUps`, `ccoWorkspacePrefs`,
`ccoPortal`, `secretRotation`, `patientSignals`, `sloTickets`,
`releaseGovernance`.

**Varken `cco-templates.json` eller `cco-aftercare-jobs.json` finns
bland dem.**

---

## Orsaken

```js
// server.js:6469
filePath: path.join(__dirname, 'data', 'cco-templates.json');

// server.js:5805
filePath: path.join(__dirname, 'data', 'cco-aftercare-jobs.json');
```

Render monterar den beständiga disken på `/var/data`
(`render.yaml:33`, 450 GB) och sätter `ARCANA_STATE_ROOT=/var/data`.
Startkommandot är `npm start` → `node server.js` rakt från projektkatalogen.

`__dirname/data` är alltså **containerns filsystem**, inte disken. Det
nollställs vid varje deploy. Det förklarar de noll jobben.

Sex stores har env-styrd sökväg i `render.yaml`:
`ARCANA_CCO_BOOKING_STORE_PATH`, `_BOOKING_ENGINE_`, `_PATIENT_ASSETS_`,
`_ASSET_IMPORT_RUNS_`, `_ASSET_REVIEW_QUEUE_`, `ARCANA_MIGRATION_INDEX_PATH`.
Mallarna och aftercare har ingen.

**Buggklassen är redan känd i repot.** `src/config.js:506`:

> _Tidigare hårdkodade som `path.join(__dirname, 'data', ...)` i
> server.js, vilket gjorde dem oåtkomliga för `ARCANA_STATE_ROOT` — en
> lokal körning skrev alltid in i repots `data/`._

Någon har fixat en handfull. De här två blev kvar.

**Och en rättelse av mig:** jag skrev tidigare att systemet mailar vid
1/3/6/12. Det stämmer för den lokala fixturfilen. I produktion mailar
det inte alls, eftersom det inte finns några jobb. Jag generaliserade
från lokal data utan att fråga produktion. Räkna inte med den
formuleringen.

---

## Uppgift 1 — flytta de två sökvägarna

Gör exakt som `ccoBookingEngineStorePath` (`src/config.js:501`):

```js
ccoTemplateRegistryPath: resolveStatePath({
  explicitPath: process.env.ARCANA_CCO_TEMPLATE_REGISTRY_PATH,
  stateRoot,
  fileName: 'cco-templates.json',
}),
ccoAftercareJobsPath: resolveStatePath({
  explicitPath: process.env.ARCANA_CCO_AFTERCARE_JOBS_PATH,
  stateRoot,
  fileName: 'cco-aftercare-jobs.json',
}),
```

Byt de två `path.join`-anropen i `server.js` mot `config.*`, och lägg
till två env-poster i `render.yaml` bredvid de sex befintliga:

```yaml
- key: ARCANA_CCO_TEMPLATE_REGISTRY_PATH
  value: /var/data/cco-templates.json
- key: ARCANA_CCO_AFTERCARE_JOBS_PATH
  value: /var/data/cco-aftercare-jobs.json
```

**Migrering:** vid uppstart, om målfilen saknas men `__dirname/data`-filen
finns — kopiera över en gång och logga det. Annars tappar en befintlig
miljö sitt innehåll vid övergången. Skriv aldrig tillbaka åt andra hållet.

`render.yaml` har en varning på rad 26 om att diskstorleken måste matcha
live exakt, annars failar hela blueprint-syncen tyst. **Rör inte
`sizeGB`.**

---

## Uppgift 2 — skapa mallarna via API:t, inte i filen

`POST /api/v1/cco-templates` finns, owner-only (`server.js:6515`).
Registret bär revisionshistorik (`makeRevision`, `ccoTemplateRegistry.js:82`)
— den historiken uppstår bara när mallen går genom API:t.

Skapa `followup_fue_4m` och `followup_fue_8m` den vägen. Ditt innehåll
från `followup_fue_6m` är rätt utgångspunkt; texterna du skrev
("tidig återväxt" / "återväxten tar form") låter rimliga, men låt Fazli
läsa dem innan de går ut till kund.

**Efter uppgift 1, inte före.** Skapas de innan sökvägen flyttats
försvinner de vid nästa deploy.

Rulla tillbaka dina lokala filändringar när uppgift 1 är klar —
backuperna ligger i `/tmp/cco-*.bak`. `data/` ska inte innehålla
handredigerad state.

---

## Uppgift 3 — utred de övriga, bygg inget

`server.js` har **29** förekomster av `path.join(__dirname, 'data', ...)`.
Bland dem:

```
cco-customers.json          cco-treatment-plans.json
cco-photo-consents.json     cco-users.json
cco-portal-links.json       cco-dsr.json
cco-incident-log.json       cco-booking-cases.json
```

Några av dem ser ut som beständig state som borde ligga på disken.
`cco-dsr.json` är registerutdrag enligt GDPR. `cco-photo-consents.json`
är samtycken.

**Men dra inga slutsatser av namnen.** Kundregistret på 7 548 personer
ligger till exempel **inte** i `cco-customers.json` utan i
`ccoPatientMasterStore` → `/var/data/cco-patient-master.json`
(`src/config.js:576`), och det är därför det överlever. Jag höll själv
på att påstå motsatsen.

En sak till som behöver redas ut: `ccoCustomerStorePath` finns i
`src/config.js:568` och används på `server.js:11304` — men `server.js:412`
skapar en **andra** instans av samma filnamn med hårdkodad sökväg. Två
stores, samma fil, olika platser.

Leverera en tabell i `docs/handover/`:

| Fil | Rad i server.js | Beständig state? | Finns config-post? | Bedömning |

Kolumn 3 svarar på om innehållet måste överleva en deploy. Kolumn 5
säger "flytta", "får vara lokal" eller "oklart, fråga".

**Skriv ingen kod i uppgift 3.** Det här är 29 filer och en felflytt kan
tappa data. Fazli väljer vad som flyttas.

---

## Om servern

Du frågade om du ska starta om. Den lokala utvecklingsservern kan du
starta om fritt, men den ändringen når inte produktion och nästa deploy
raderar filerna ändå. Starta inte om produktion.

Och nej — leta inte efter en Meridiq-seedkälla. Problemet är inte att
mallarna saknar seed. Problemet är att de ligger på en yta som inte
överlever.

---

## Gränser

- Rör inte `sizeGB` i `render.yaml`.
- Skriv inte i `data/` för hand. Allt som ska överleva går via API eller
  store.
- Ingen CMO-kod. Inga hemligheter i repo. En gren. Svenska
  commit-meddelanden som förklarar _varför_.

## Verifiering

Efter uppgift 1, mot produktion:

```
GET /api/v1/ops/state/manifest
```

ska innehålla `cco-templates.json` och `cco-aftercare-jobs.json` under
`/var/data`. Det är beviset — inte att filen finns lokalt.

Efter uppgift 2:

```
GET /api/v1/cco-templates    →    followup_fue_4m, followup_fue_8m
```

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Sviten är **7 230 gröna, noll röda** sedan uppföljningsändringen
mergades. De tre du rapporterade som förbefintliga (PR16/PR40) är gröna
nu. Blir något rött är det ditt.
