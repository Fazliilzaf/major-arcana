# ORD-82 — Enpass-klassificering i `v2:lane_counts` (CCO inkorgs-frys)

| | |
|---|---|
| **Bas-commit** | `6c515494` (origin/main, 2026-07-26) |
| **Ägare** | Cowork |
| **GO** | Fazli, 2026-07-26 |
| **Föregångare** | ORD-81 (`630509bc`) — stängd och verifierad |
| **Ordernummer** | ORD-82. Högsta i `docs/handover/ORDERS/` = ORD-81. **Notion Order Inbox ej kontrollerad** (connector ej auktoriserad) — verifiera innan numret anses låst. |

## Problem

ORD-81 tog bort boot-frysen i signatursaneraren. Ommätningen visade att frysen
inte försvann — den **bytte ägare**.

Uppmätt i prod efter ORD-81, synlig flik, stilla server (30+ min uptime),
bundle `83e7647fc2`:

```
shell:flush_render   15 707 ms  @ 7 299 ms
  └─ v2:lane_counts  15 700 ms  @ 7 301 ms   threads: 532, lanes: 13
     v2:shell_render      5 ms  @ 23 001 ms
```

`v2:lane_counts` står för **99,96 %** av blocket. Själva målningen tar 5 ms.

Vad operatören upplever:

| Tid | Läge |
|---|---|
| 3,1 s | skalet syns, tomt |
| 3,8 s | 120 trådar |
| 7,3 s | 532 trådar, full inkorg |
| **7,3–23,0 s** | **fryst i 15,7 s** |

Total blockerad huvudtråd: 19,4 s av 42 s.

### Superlinjäriteten

Samma 532 trådar kostade **630 ms** vid 6 628 ms men **15 700 ms** vid 7 301 ms.
Antalet trådar var identiskt. Kostnaden per tråd växte.

Hypotes, att verifieras som första steg: mellan de två anropen anländer
brödtexterna. Lane-predikaten läser textfält som är tomma i det första anropet
och fyllda i det andra. Kostnaden följer alltså **nyttolast per tråd**, inte
antal trådar — samma form som ORD-81, annan funktion.

## Rotorsak

`app.js:40614` räknar 13 lanes genom att anropa `getQueueLaneThreads` en gång
per lane:

```js
const lanes = __ccoPerf.time("v2:lane_counts", () =>
  CONVERSATIONS_V2_LANES.map((lane) => ({
    ...lane,
    count: getQueueLaneThreads(lane.id, scoped).length,
  })),
  { threads: scoped.length, lanes: CONVERSATIONS_V2_LANES.length }
);
```

`getQueueLaneThreads` (`app.js:15626`) filtrerar **först hela listan** med
`isHandledRuntimeThread`, sedan per lane:

| Lane-id | Predikat |
|---|---|
| `all` | *(inget — returnerar hela den ohanterade listan)* |
| `commercial` | `isCommercialRuntimeThread(thread)` |
| `operation` | `isOperationRuntimeThread(thread)` |
| övriga 10 | `getThreadPrimaryLaneId(thread) === laneId` |

Med 532 trådar och 13 lanes ger det:

- **~6 900 anrop** till `isHandledRuntimeThread` — 13 identiska pass över samma lista
- **~5 300 anrop** till `getThreadPrimaryLaneId` (`app.js:10409`), en kedja av
  tio predikat

Två av predikaten i kedjan — `isCommercialRuntimeThread` (`app.js:10350`) och
`isConsultationRuntimeThread` (`app.js:10369`) — bygger varje gång en
sammanfogad sträng av **sex fält** (`bodyPreview`, `preview`, `raw.bodyPreview`,
`raw.textPreview`, `raw.subject`, `subject`) och `normalizeKey`:ar den. Per
tråd, per anrop, från grunden.

## Ändring

**Ett pass över trådlistan i stället för tretton.**

Gå igenom `scoped` en gång och beräkna per tråd:

```
{ handled, isCommercial, isOperation, primaryLaneId }
```

Tallya sedan de tretton räknarna ur den enda passeringen.

### Korrekthetskrav (icke förhandlingsbart)

**`commercial` och `operation` är inte `primaryLaneId`-utfall.** De två lanes
använder sina egna predikat direkt i `getQueueLaneThreads`, medan
`getThreadPrimaryLaneId` kan returnera `"commercial"` eller `"operation"` för en
tråd som *också* matchar ett tidigare predikat i kedjan (t.ex. `review`).

En tråd kan därför räknas i `commercial` **och** i `review` samtidigt — det är
befintligt beteende och ska bevaras exakt. Tallya de tre sakerna oberoende:

1. `all` = antal ohanterade
2. `commercial` / `operation` = predikatet, oberoende av primärlane
3. övriga 10 = likhet mot `primaryLaneId`

En implementation som tallyar allt ur `primaryLaneId` ger **fel siffror** och
ska inte passera granskning.

### Övriga krav

- **Ingen cache.** Återanvändning sker inom samma render, i samma passering.
  Ingenting överlever anropet.
- **Inga ändrade lane-regler.** Predikaten, deras inbördes ordning och
  `getThreadPrimaryLaneId`-kedjan är orörda. Detta är en omstrukturering av
  *hur många gånger* klassificeringen körs, inte av *vad* den svarar.
- `getQueueLaneThreads` behålls oförändrad — den har andra anropare
  (`getFilteredRuntimeThreads`, `app.js:15642`, och `window.__ccoGetVisibleQueueThreads`).
  Enpass-räkningen är ett tillägg vid `app.js:40614`, inte en omskrivning av
  den delade hjälparen.

## Scope-vakt

**Endast räkningen vid `app.js:40614` i denna sväng.**

Följande är kända och rörs **inte**, annars går det inte att avgöra vad som gav
vinsten:

- Memoisering per tråd av lane-klassificeringen. Se *Nästa steg*.
- `classifyRuntimeRowFamily` (`app.js:7070`) — sedan tidigare eget spår.
- Fältsammanfogningen inuti `isCommercialRuntimeThread` /
  `isConsultationRuntimeThread`. Den är dyr, men att röra den samtidigt gör
  mätningen otolkbar.

## Mätprotokoll

Instrument: `?ccoPerf=1` (`__ccoPerf`).

URL: `https://arcana.hairtpclinic.com/major-arcana-preview/?embed=admin&conversations=v2&view=conversations&ccoPerf=1`

**Miljöblock — obligatoriskt i rapporten** (`docs/handover/ORDER-TEMPLATE.md`):
bas-commit, bundle-hash, server-uptime, `npm ci` kört ja/nej, `.env` fanns
ja/nej, och **flikens `visibilityState` loggad genom hela fönstret**.

Mät inte under en pågående deploy. Vänta ut minst 10 minuters oförändrad
`startedAt` — en omstart nollställer cachen och byter bundle-hash mitt i
laddningen, vilket gjorde två av dagens mätningar ojämförbara.

| Nyckeltal | Före (uppmätt) | Efter (krav) |
|---|---|---|
| `v2:lane_counts`, största enskilda anrop | 15 700 ms | **< 500 ms** |
| `shell:flush_render`, största block | 15 707 ms | < 600 ms |
| Total blockerad huvudtråd, hela laddningen | 19,4 s | < 2 s |
| Tid till full inkorg synlig (532 trådar) | 23,0 s | **< 8 s** |
| Tid till `#cco-conv-v2-root` monterad | 3 129 ms | oförändrad (får inte försämras) |

Rapportera **varje anrop** till `v2:lane_counts` i tidslinjen, inte bara det
största. Superlinjäriteten syns bara i jämförelsen mellan anropen.

## Acceptanskriterier

1. Nyckeltalen ovan uppnådda, uppmätta i prod efter deploy, i **synlig flik** på
   stilla server.
2. **Identiska lane-siffror före och efter.** Nytt test som kör gammal och ny
   räkning på samma trådlista och jämför lane för lane, inklusive minst ett fall
   där en tråd matchar `commercial` men har en annan `primaryLaneId`.
3. Ett fall med tomma previews och ett med fyllda brödtexter — samma siffror i
   båda, för att låsa fast att omstruktureringen inte gjort klassificeringen
   nyttolastberoende på ett nytt sätt.
4. Befintlig testsvit grön. `check:syntax` grön.
5. `arcana-ci` grön före deploy.
6. Ingen cache införd (granskningsbart i diffen).

## Nästa steg — först efter ommätning

Memoisering per tråd är **inte** godkänd i denna order. Om mätningen efter
enpass-ändringen visar att den behövs skrivs den som egen order, och då gäller
ORD-81:s lärdom:

**Nyckeln får inte vara enbart tråd-id.** Innehållet ändras under laddningen
(previews anländer), så en cache på id skulle servera klassificeringen från när
brödtexten var tom. Nyckeln måste inkludera något som ändras när innehållet gör
det. Frågan att besvara i den ordern är densamma som fällde ORD-81 nästan:
*finns det ett tillstånd där en post kan skrivas som är fel att läsa senare?*

## Bakgrund — vad ORD-81 faktiskt gav

Verifierat, synlig flik, stilla server:

| Nyckeltal | Före | Efter |
|---|---|---|
| Tid till V2 monterad | 40–163 s | **3 129 ms** |
| Anrop till saneraren | 26 192 | **0** |
| DOM-nodbesök i saneraren | 1 807 248 | **0** |
| `DOMContentLoaded` | 47 397 ms | 3 845 ms |

ORD-81 är stängd. Saneraren förekommer inte längre i tidslinjen.

## Indragna påståenden från mätomgången

Dessa var mätfel, inte produktfel, och ska inte föras vidare:

- *"Hundra `app/*.js` laddas över 45 sekunder"* — deploy-inducerat. Mätningen
  gjordes under en serie om tre merges där bundle-hashen byttes mitt i
  laddningen. På stilla server: `DOMContentLoaded` 2,3 s.
- *"Blank sida, ingen montering, permanent wedge"* — mätartefakt. Fliken var
  `hidden`; `requestAnimationFrame` skjuts upp av webbläsaren i dold flik.
  Monteringen skedde så snart fliken blev synlig. Grinden i
  `scheduleRuntimeConversationShell` (`app.js:3021`) är korrekt:
  `__runtimeShellRaf = 0` är första satsen i
  `flushScheduledRuntimeConversationShell` (`app.js:3034`), så ett fel senare i
  flushen kan inte låsa den.
- *"Servern startar om fyra gånger på sex minuter"* — två av tre omstarter
  mappar exakt mot merges till `main`, med 82 sekunders fördröjning. Det var
  deploy-serien, inte instabilitet. Den tredje (10:11:12) är oförklarad och
  påstås ingenting om.

**Gemensam nämnare:** observation av ett tidsvarierande system rapporterad som
ett tillståndspåstående. `visibilityState` är nu obligatoriskt i miljöblocket av
precis det skälet.
