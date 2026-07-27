# ORD-84 — Journey-strukturen en gång per tråd och pass (fjärde lagret)

| | |
|---|---|
| **Bas-commit** | `a7aeaec3` (origin/main, 2026-07-27) |
| **Ägare** | Cowork |
| **GO** | Fazli, 2026-07-27 |
| **Föregångare** | ORD-81 `630509bc` · ORD-82 `a2053cc5` · ORD-83 `3dbf12b4` |
| **Ordernummer** | ORD-84. Högsta i `docs/handover/ORDERS/` = ORD-83. **Notion Order Inbox ej kontrollerad** — verifiera innan numret anses låst. |

## Problem

ORD-83 tog bort scope-omräkningen per tråd. Ommätningen visar en verklig vinst
som ändå inte når kraven — och avvikelsen mellan de två måtten pekar ut nästa
lager exakt.

Uppmätt i prod, framtvingat `v2:lane_counts`-anrop, före mot efter ORD-83:

| | Före | Efter | Faktor |
|---|---|---|---|
| `toLowerCase` per tråd | 144 334 | 15 119 | **9,5×** |
| Tid per tråd | — | — | **2,1×** |

**Strängoperationerna föll 9,5× men tiden bara 2,1×.** Den kvarvarande
kostnaden är alltså inte strängar. Den är objektallokering.

Absoluta tal efter ORD-83 (407 trådar, 6/9 brevlådor):

```
v2:lane_counts        2 443 ms   krav < 300      ✗
shell:flush_render    2 597 ms   krav < 600      ✗
blockerad huvudtråd   7 382 ms   krav < 2 000    ✗
toLowerCase           6 153 393  krav < 500 000  ✗
```

## Rotorsak (hypotes — mät före du bygger)

`getThreadJourneyActiveModuleId(thread)` (`app.js:10341`) anropar
`getPreviewPatient360JourneyForThread` (`app.js:19287`), som bygger **två
kompletta strukturer från grunden**:

```js
function getPreviewPatient360JourneyForThread(thread, focusReadState = {}) {
  const backbone = buildPreviewPatient360Backbone(thread, focusReadState);
  return { backbone, journey: buildPreviewPatient360Journey(backbone) };
}
```

Ingen memoisering. Tre anropsställen, alla i predikatkedjan:

| Rad | Predikat |
|---|---|
| `app.js:10352` | `isCommercialRuntimeThread` |
| `app.js:10371` | `isConsultationRuntimeThread` |
| `app.js:10400` | `isOperationRuntimeThread` |

### Nästlingen gör det värre än tre

`isOperationRuntimeThread` (`app.js:10394`) anropar de andra två **först**:

```js
if (
  isAftercareRuntimeThread(thread) ||
  isConsultationRuntimeThread(thread) ||   // ← bygger journey
  isCommercialRuntimeThread(thread)        // ← bygger journey
)
  return false;
if (getThreadJourneyActiveModuleId(thread) === "operation") return true;  // ← bygger journey
```

`getThreadPrimaryLaneId` kör kedjan i följd för samma tråd:

```
isConsultationRuntimeThread   → journey  (1)
isCommercialRuntimeThread     → journey  (2)
isOperationRuntimeThread
  ├─ isConsultationRuntimeThread → journey  (3)
  ├─ isCommercialRuntimeThread   → journey  (4)
  └─ getThreadJourneyActiveModuleId → journey  (5)
```

**Upp till fem kompletta journey-strukturer per tråd**, alla identiska, alla
kastade direkt. Med 407 trådar är det ~2 000 backbone- plus
journey-konstruktioner per `lane_counts`-anrop.

Samma felform som de tre föregående ordrarna: en invariant som räknas om inne i
en loop. Här är invarianten trådens egen journey, och loopen är predikatkedjan.

## Steg 1 — Mät hypotesen. Bygg ingenting förrän den håller.

Räkna anrop till `buildPreviewPatient360Backbone` per `v2:lane_counts`-anrop,
och dividera med trådantalet.

| Utfall | Slutsats |
|---|---|
| ~3–5× trådantalet | Hypotesen bekräftad — gå till steg 2 |
| ~1× trådantalet | Hypotesen **falsifierad** — kostnaden ligger någon annanstans, skriv om ordern |

Rapportera siffran oavsett utfall. Ett falsifierat steg 1 är ett giltigt
resultat och ska inte tystas för att ordern redan är skriven.

## Steg 2 — Ändringen

Beräkna journeyn **en gång per tråd inom passet**.

Mekaniken finns redan: `withMailboxScopePass` (`app.js`, ORD-83) öppnar ett pass
och stänger det i `finally`. Utöka passobjektet med en `Map` från tråd till
journey.

### Korrekthetskrav (icke förhandlingsbart)

**Memot får aldrig överleva passet.** Trådarnas innehåll ändras under laddningen
— previews och journey-data anländer — och en journey som låg kvar skulle
klassificera tråden på gammalt underlag. Samma `finally`-stängning och samma
test som ORD-83: byt state mellan två pass och kräv att det andra ser det nya.

**Nyckeln får inte vara enbart tråd-id.** Om `Map`:en nycklas på id och samma id
klassificeras igen efter att innehållet ändrats inom samma pass, serveras fel
journey. Inom ett synkront pass ändras inget — men skriv ned varför det gäller,
så nästa person inte flyttar passet till en asynkron väg och tar med sig
antagandet.

**`withMailboxScopePass` är synkron-bara.** Det står redan i koden sedan
`69fc4fcd`. Journey-memot ärver samma begränsning.

### Övriga krav

- `getPreviewPatient360JourneyForThread` lämnas orörd. Den har andra anropare
  (`getJourneyPrimaryActionConfig`, `app.js:19296`). Lägg till en passväg,
  migrera inte anroparna.
- Predikaten, deras inbördes ordning och nästlingen i
  `isOperationRuntimeThread` ändras **inte**. Detta är en ändring av hur många
  gånger journeyn byggs, inte av vad predikaten svarar.
- Ingen cache som överlever passet.

## Scope-vakt

**Endast journey-konstruktionen i denna sväng.**

Rörs inte, trots att de är kända:

- **`apply:truth_payload`** — 1 333 ms och 471 525 `toLowerCase` i en **egen
  fas** bredvid lane-räkningen. Egen order.
- Nästlingen i `isOperationRuntimeThread`. Att kedjan anropar sina syskon är
  slösaktigt även med memo, men att röra den samtidigt gör mätningen otolkbar.
- `classifyRuntimeRowFamily` (`app.js:7070`).

## Mätprotokoll

Instrument: `?ccoPerf=1` (`__ccoPerf`) plus räknare på
`buildPreviewPatient360Backbone`.

**Miljöblock obligatoriskt** (`docs/handover/ORDER-TEMPLATE.md`): bas-commit,
bundle-hash, server-uptime, `npm ci` ja/nej, `.env` ja/nej, och flikens
`visibilityState` loggad genom hela fönstret.

Stilla server — minst 10 minuters oförändrad `startedAt`. Mät inte under deploy.

| Nyckeltal | Efter ORD-83 | Krav |
|---|---|---|
| `buildPreviewPatient360Backbone` per tråd | *mäts i steg 1* | **1** |
| `v2:lane_counts`, största anrop | 2 443 ms | < 300 ms |
| `shell:flush_render`, största block | 2 597 ms | < 600 ms |
| Total blockerad huvudtråd | 7 382 ms | < 2 000 ms |
| `toLowerCase` totalt | 6 153 393 | < 500 000 |

### Om jämförbarheten — läs detta före rapporten

ORD-83:s mätning hade tre förbehåll som begränsade hur starkt den fick läsas:

1. **Trådantalet skilde sig** — 545 före mot 407 efter, olika brevlådescope
   (8/9 mot 6/9). Jämförelsen **per tråd** höll; de absoluta talen var svagare.
2. **Bara ett `lane_counts`-anrop fångades**, så kvoten mellan två anrop på
   samma trådlista gick inte att beräkna. Kvoten var ORD-83:s huvudmått.
3. **Fliken var dold när passet armerades** och blev synlig mitt i.

**Samma brister får inte upprepas här.** Kör med samma brevlådeval före och
efter, fånga **varje** `lane_counts`-anrop, och håll fliken synlig från första
millisekunden.

## Acceptanskriterier

1. `buildPreviewPatient360Backbone` anropas **en gång per tråd och pass**.
2. Nyckeltalen ovan uppnådda, uppmätta i prod, synlig flik, stilla server.
3. **Identiska lane-siffror före och efter.** Klassificeringen får inte ändras —
   test som kör gammal och ny väg på samma trådlista och jämför lane för lane.
4. Memot överlever aldrig passet (täcks av test, samma form som ORD-83).
5. Ett kast inuti passet lämnar inget memo kvar (`finally`).
6. Mutationskontroll: tas `finally`-återställningen bort ska de tester som
   skyddar mot läckage falla. Ett test som inte bevisligen faller på fel
   implementation är dekoration.
7. Befintlig svit grön, `check:syntax` grön, `arcana-ci` grön före deploy —
   **dispatchas manuellt om auto-triggern inte täcker grenen.**

## Kontext — de fyra lagren

| | Vad räknades om i en loop | Blocket efter |
|---|---|---|
| ORD-81 | Signatur-HTML sanerades 26 192 ggr | 62 597 → 19 668 ms |
| ORD-82 | Trådlistan gicks igenom 13 ggr, en per lane | 15 700 ms |
| ORD-83 | Mailbox-scopet härleddes per tråd | 3 244 → 2 443 ms |
| **ORD-84** | **Journeyn byggs upp till 5 ggr per tråd** | *mäts* |

Operatörens läge före ORD-81: blank sida i 40–163 sekunder. Efter ORD-83:
skalet på 328 ms, full inkorg på 3,5 sekunder.
