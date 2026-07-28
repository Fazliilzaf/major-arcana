# ORD-85 — Bokningsindexet byggs om per kundkort (driftkritiskt)

| | |
|---|---|
| **Bas-commit** | `3b95629f` (origin/main, 2026-07-28) |
| **Ägare** | Cowork |
| **GO** | Fazli |
| **Prioritet** | **P0 — tar ner prod för alla, reproducerat** |
| **Ordernummer** | ORD-85. Högsta i `docs/handover/ORDERS/` = ORD-84. **Notion Order Inbox ej kontrollerad** — verifiera innan numret anses låst. |

## Problem

**Tre sekventiella öppningar av olika kundkort tog ner produktionsinstansen.**

Reproducerat 2026-07-27 kl. 23:40 UTC mot stilla server:

```
FÖRE        uptime 1 307 s, stabil, samma startedAt
ny kund 1   502 efter 58,8 s     ← hängde nästan en minut
ny kund 2   502 på 0,19 s        ← redan död
ny kund 3   502 på 0,26 s
EFTER       /healthz svarar HTML — nere

Render-logg  23:40:24  ==> Instance srv-…-drrp4 restarted
```

**Ingen deploy.** Senaste merge till `main` var `3b95629f` kl. 23:11:53 UTC — 28 minuter tidigare. Verifierat oberoende mot git.

**Ingen OOM-rad i Node.** Ingen `JavaScript heap out of memory`, ingen `SIGKILL`, ingen `FATAL`. Loggfönstret 23:38:00–23:40:23 innehåller bara normala request-rader med `responseTimeMS=1–40`. Processen slutade svara utan att hinna säga något. `--max-old-space-size=6144`, uppstart landar på 419 MB.

Kvarstående hypoteser, som mätningen i steg 1 ska skilja åt: **event-loop-svält** (synkront arbete blockerar så länge att Renders health-check timeoutar) eller **container-OOM** (kärnans OOM-killer tar processen innan Node hinner logga).

### Tidsprofilen

Mätt mot stilla server, `startedAt` kontrollerad före och efter:

| Anrop | Tid | Storlek |
|---|---|---|
| Kall, kund A | 8,46 s | 76 kB |
| Varm, kund A igen | 1,34 s | 76 kB |
| `includeJournal=0&includeDriveFiles=0` | 1,39 s | 62 kB |
| `/patient/summary` | 1,46 s | 76 kB |
| **Ny kund efter varm** | **hängde 58,8 s → 502** | — |

**Två hypoteser föll och ska inte återupplivas:**

- `includeJournal=0` sparar 14 kB men **noll tid**. Journal och Drive är inte kostnaden.
- `/patient/summary` är varken snabbare eller mindre — 76 kB, samma som fullvägen. Att peka klienten dit ger ingenting.

## Rotorsak

`buildPatientPayload` (`src/routes/ccoPatientMaster.js:977`) anropar för **en enda patient**:

```js
const bookingIndex = await loadKunderBookingIndex(config, actor.tenantId, [patient]);
```

`loadKunderBookingIndex` (`src/ops/ccoKunderBookingEnrichment.js:1265`) memoiserar **bara lagren** i `bookingStoresPromise` — inte datan. Vid varje anrop görs:

```js
listBookingsForEnrichment(tid)                            // alla bokningar för tenant
listCasesForEnrichment({ tenantId: tid, limit: 5000 })
listEncountersForEnrichment(tid)
listServices({})
clientoStore.listAllBookings({ tenantId: tid, limit: 0 })  // limit 0 = obegränsat
clientoStore.listAllBookings({ tenantId: '',  limit: 0 })  // ALLA tenants
loadClientoLinkSidecarLedgerEvents(config)
```

**Hela bokningsuniverset läses, materialiseras och indexeras om vid varje kundkortsöppning — för att berika en patient.**

Två detaljer som förvärrar:

- `limit: 0` betyder obegränsat, inte noll.
- `tenantId: ''` i shadow-anropet hämtar **över alla tenants**, inte bara den inloggades.

### Varför tidsprofilen ser ut som den gör

| Observation | Förklaring |
|---|---|
| Kall 8,46 s | Filerna läses och parsas första gången |
| Varm samma kund 1,34 s | `bookingStoresPromise` är memoiserad — filerna läses inte om |
| **Ny kund 8,5 s → hängning** | **Indexet byggs om från grunden ändå. Lagren är cachade, arbetet är det inte.** |
| Tre i följd → död | Minnestopp plus långt synkront arbete |

Det är samma felform som ORD-81 till ORD-84 — en invariant som räknas om inne i en loop — men här är loopen operatörens klickande och konsekvensen är att servern dör.

## Steg 1 — Skilj svält från OOM. Mät, bygg inte.

Kör **lokalt**, aldrig mot prod. Prod har redan tagits ner en gång av den här sonderingen och en reproduktion till tillför ingenting.

1. Starta servern lokalt med produktionslik datamängd.
2. Anropa `/api/v1/cco-patient-master/patient` för tre olika patienter i följd.
3. Mät per anrop: `process.memoryUsage().heapUsed`, längsta synkrona block, och antal materialiserade objekt ur `listAllBookings`.

| Utfall | Diagnos |
|---|---|
| Heap växer monotont och närmar sig taket | Container-OOM — payloaden är för stor |
| Heap stabil men synkrona block på flera sekunder | Event-loop-svält — arbetet måste brytas upp |

Båda kan gälla samtidigt. Rapportera bägge mätvärdena oavsett.

## Steg 2 — Ändringen

Tre åtgärder, i stigande risk. **Mät efter varje, inte efter alla tre.**

### 2a. Ta bort cross-tenant-hämtningen

`listAllBookings({ tenantId: '', limit: 0 })` hämtar över alla tenants. Scope den till den inloggades tenant.

Detta är också en **isolationsfråga**, inte bara prestanda: en förfrågan för en tenant materialiserar en annan tenants bokningar i minnet. Verifiera vad `historicalShadowLedgerEvents` faktiskt behöver innan du ändrar — om shadow-länkarna kräver cross-tenant-data ska det vara ett medvetet, dokumenterat undantag och inte en bieffekt av `tenantId: ''`.

### 2b. Sätt tak på de obegränsade hämtningarna

`limit: 0` är obegränsat. Ge det ett tak, och **logga när taket träffas** — en tyst avkortning ser ut som "det fanns inte mer".

### 2c. Memoisera indexet per tenant, inte bara lagren

Det är den verkliga fixen. `bookingStoresPromise` cachar filhandtagen; indexet byggs ändå om.

**Korrekthetskrav:** ett memoiserat bokningsindex blir inaktuellt när en bokning skapas eller ändras. Cachen måste invalideras vid skrivning, eller ha en kort TTL. En operatör som bokar och sedan öppnar kundkortet **ska se bokningen**. Ett index som ligger kvar är en felvisning, inte bara en gammal siffra.

Samma fråga som fällt varje cache-order idag: *finns det ett tillstånd där en post kan skrivas som är fel att läsa senare?*

## Scope-vakt

**Endast bokningsindexet i denna sväng.**

Rörs inte:

- `journalStore.listEntries`, `treatmentEncounterStore.listByPatient({ limit: 5000 })`,
  `buildDocumentBundlePayload` — alla i samma payload, alla värda en titt, men att ändra
  dem samtidigt gör mätningen otolkbar.
- `apply:truth_payload` (ORD-84:s utanför-scope).
- Klientens val av endpoint — `/patient/summary` är mätt och ger ingenting.

## Mätprotokoll

**Miljöblock obligatoriskt** (`docs/handover/ORDER-TEMPLATE.md`): bas-commit, bundle-hash, server-uptime, `npm ci` ja/nej, `.env` ja/nej, flikens `visibilityState` där det gäller.

**Två regler som skrivs in efter dagens misstag:**

1. **Kontrollera `startedAt` före och efter varje prod-mätning.** Tre av dagens fynd var deployfönster som såg ut som produktfel.
2. **Mät aldrig inom fem minuter efter en egen merge.** Kl. 23:17 mergades och mättes i samma andetag; slutsatsen blev fel.

| Nyckeltal | Nu | Krav |
|---|---|---|
| Kall öppning, kund A | 8,46 s | < 2 s |
| Ny kund efter varm | **hänger 58,8 s → 502** | < 1,5 s |
| Tre olika kunder i följd | **instansen dör** | **alla tre svarar 200** |
| `heapUsed` efter tre anrop | *mäts i steg 1* | ingen monoton tillväxt |

## Acceptanskriterier

1. Tre sekventiella öppningar av **olika** kundkort mot en frisk instans ger tre `200`. Detta är orderns huvudkriterium.
2. Nyckeltalen ovan uppnådda.
3. **Bokningsdata är korrekt efter skrivning.** Test: skapa en bokning, öppna kundkortet, bokningen syns. Utan detta test är memoiseringen inte granskningsbar.
4. Ingen cross-tenant-materialisering kvar, eller ett dokumenterat undantag med skäl.
5. Avkortning vid tak loggas.
6. Befintlig svit grön, `check:syntax` grön, `arcana-ci` grön före deploy.
7. **Verifiering sker lokalt.** Prod-mätning först efter deploy, med `startedAt` kontrollerad.

---

## RÄTTELSE 2026-07-28 — rotorsaken höll inte, fyra kandidater friade

Steg 1 gjorde precis det steget fanns till för: **det falsifierade ordernas egen
rotorsak.** Hade steget inte stått här hade vi memoiserat ett bokningsindex som
kostar 30 ms och sedan undrat varför servern fortsatte dö.

### Falsifierat: loadKunderBookingIndex

Mätt lokalt mot syntetisk prod-skala (28 974 Cliento-bokningar, 5 000 cases):

| patient | tid | heapUsed | längsta synkblock |
|---|---|---|---|
| 1 | 62 ms | 44,9 MB | 12 ms |
| 2 | 30 ms | 70,9 MB | 5 ms |
| 3 | 31 ms | 70,0 MB | 10 ms |

Varken OOM eller event-loop-svält. Heapen planar ut. **30–62 ms, inte sekunder.**

**Förbehåll, ordagrant:** de syntetiska bokningarna är enklare än prods — färre
fält, inga nästlade objekt — och harnessen fyller inte journal, Drive-index,
assets eller Pipedrive-dokument. Skalan stämmer, formen inte helt.

**Kvarstår som städning, inte P0:** 21 732 materialiserade bokningar per anrop,
och `listAllBookings({ tenantId: '' })` som läser över alla tenants.
Isolationsinvändningen är riktig oavsett kostnad.

### Tre kandidater till, alla mätta och friade

| Kandidat | Uppmätt | Utfall |
|---|---|---|
| Första laddningen av asset-lagret (22 283 poster, 8,6 MB) | 17,35 ms | friad |
| `listAssetsForPatient`-svepet, 3× per kundkort | 3,5 ms | friad |
| `logAudit` → `fs.appendFileSync`, synkron disk, 3× per kundkort | ~0 ms lokalt | friad* |

\* `appendFileSync` skalar linjärt med skrivlatens: 1 ms → 11,9 ms, 5 ms →
25,0 ms, 20 ms → 76,9 ms för tre anrop. Renders disk är nätverksmonterad. Det är
illa oavsett, men det tog inte ner servern — det krävs ~2 s skrivlatens för att
nå 8,46 s, och då är disken sjuk, inte koden. **Eget spår.**

## Bekräftad rotorsak — hela patientregistret per kundkort, utan stampede-skydd

`ccoPatientMaster.js:1084`, för EN patient:

```js
patientMasterStore.listPatients({ tenantId, limit: 20000, offset: 0 })
```

Bakom `readCache.wrap` med **300 000 ms TTL — exakt fem minuter**. Den ligger
inte bakom `includeJournal` eller `includeDriveFiles`, vilket är varför
`includeJournal=0` sparade noll tid.

Och `wrap` (`src/infra/ccoReadCache.js:96`) saknar stampede-skydd:

```js
const cached = await get(key);
if (cached != null) return { value: cached, cacheHit: true };
const value = await fn();      // ← ingen in-flight-dedupliering
await set(key, value, ttlMs);
```

Nyckeln är per **tenant**, inte per patient. Missar cachen och första anropet
hinner inte fram till `set()`, ser varje följande anrop också en miss och startar
sin **egen** fulla registerladdning.

### Mätt med realistisk poststorlek (~70 kB per patient, 500 MB register)

| | tid | heap | loader-anrop |
|---|---|---|---|
| ETT `listPatients({limit:20000})` | 332 ms | **+517 MB** | 1 |
| **3 överlappande `wrap()`** | 1 041 ms | **+1 516 MB** (rss +1 565 MB) | **3 av 3** |
| samma med in-flight-dedupliering | 376 ms | +517 MB | 1 av 3 |

**Ett kundkort materialiserar en halv gigabyte. Tre samtidiga gör 1,5 GB.**

Det förklarar nedtagningen på ett sätt ingen tidigare hypotes gjorde: Node dog
inte av heap-överskridning — därför ingen `out of memory`, ingen `SIGKILL` i
apploggen, bara `Instance restarted`. Processen svällde tills containern tog den.

Det förklarar också hela mätserien: kall 8,46 s (cachen tom), varm 1,34 s
(träff), `includeJournal=0` ingen skillnad (ligger utanför flaggan), och tre nya
patienter tjugo minuter senare — cachen förfallen, tre samtidiga fulla
laddningar, död.

**Förbehåll:** 70 kB per patient är extrapolerat från detaljsvarets storlek
(76 kB för en patient), inte uppmätt på prods `patient-master.json`. Är den
verkliga posten mindre skalar allt ner proportionellt — men
**stampede-multiplikatorn står oavsett storlek.**

## Fixen — två delar, den andra är den viktiga

**1. Gör laddningen billigare.** Ett kundkort behöver inte hela patientregistret,
och absolut inte varje patients fullständiga post. Egen ändring, egen mätning.

**2. Stampede-skydd i `wrap`.** En `Map` från nyckel till pågående löfte, så
samtidiga missar delar ett anrop. Utan den har **varje** dyr laddare bakom den
cachen samma felläge, och `wrap` används på tre ställen.

Punkt 1 gör problemet mindre. **Punkt 2 gör det omöjligt.**

### Korrekthetskrav för punkt 2

- Löftet måste tas bort ur kartan i `finally`, annars fastnar en misslyckad
  laddning som permanent svar. Samma form som ORD-83:s och ORD-84:s passmemo.
- Ett kast ska nå **alla** väntande anropare, inte bara den första.
- Dedupliceringen får aldrig överleva anropet — den är in-flight, inte en cache
  ovanpå cachen.

## Kontext — dagens kedja

| | Vad räknades om i en loop | Konsekvens |
|---|---|---|
| ORD-81 | Signatur-HTML sanerad 26 192 ggr | 62 s frusen huvudtråd |
| ORD-82 | Trådlistan gicks igenom 13 ggr | 15,7 s |
| ORD-83 | Mailbox-scopet härlett per tråd | 3,2 s |
| ORD-84 | Journeyn byggd 13 ggr per tråd | *mäts* |
| **ORD-85** | **Bokningsuniverset indexerat per kundkort** | **servern dör** |

De fyra första var prestandaproblem i webbläsaren. Det här är ett driftproblem i servern, och det är den enda av dem som kan släcka CCO för alla samtidigt.
