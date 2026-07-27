# ORD-83 — Lyft mailbox-scopet ur per-tråd-loopen (CCO inkorgs-frys, sista lagret)

| | |
|---|---|
| **Bas-commit** | `d6a24e7e` (origin/main, 2026-07-26) |
| **Ägare** | Cowork |
| **GO** | Fazli, 2026-07-26 |
| **Föregångare** | ORD-81 (`630509bc`) och ORD-82 (`a2053cc5`) — båda mergade och verifierade |
| **Ordernummer** | ORD-83. Högsta i `docs/handover/ORDERS/` = ORD-82. **Notion Order Inbox ej kontrollerad** (connector ej auktoriserad) — verifiera innan numret anses låst. |

## Bas och observation

**Kodmiljö:** worktree, `npm ci` kört, `.env` inlänkad.
**Runtime:** prod `arcana.hairtpclinic.com`, bundle `227cbddaf7`, `main` `d6a24e7e`, server stilla >10 min, viewport 1527×793.
**Flikens `visibilityState`:** `visible` genom hela fönstret — bevisat av att `shell:flush_render` kördes vid 328 ms, vilket kräver att rAF gick. Ingen `visibilitychange` i loggen.

### Observationsfönster per påstående

| Påstående | Fönster | Stabilt? | Belägg |
|---|---|---|---|
| Alla sju `v2:lane_counts`-anrop vid boot | 329–3 553 ms, flik `visible` | **ja** | `__ccoPerf.timeline()` |
| 78,7 M `toLowerCase` i ett anrop | ETT framtvingat anrop efter boot | händelsemätning | primitivräknare med snapshot före/efter via wrappad `__ccoPerf.time` |
| Anropskedjan `iv → hw → sf → Hc → Cs → normalizeKey` | samma framtvingade anrop | **ja** | stack-sampling var 250 000:e `toLowerCase`, 69 % av 314 samplar |
| `state.aftercare.queue` tom | efter förloppet, ej under | **NEJ** — läst i efterhand | `__ccoWorkspace.getState()` |

## Vad ORD-82 gav, och vad som blev kvar

ORD-82 var rätt åtgärd. Mätt före/efter, synlig flik:

| Nyckeltal | Före ORD-82 | Efter ORD-82 | Krav | |
|---|---|---|---|---|
| Tid till `#cco-conv-v2-root` | 3 129 ms | **328 ms** | får ej försämras | ✅ |
| Tid till full inkorg (536 trådar) | 23 000 ms | **3 511 ms** | < 8 000 | ✅ |
| `v2:lane_counts`, största | 15 700 ms | **3 244 ms** | < 500 | ❌ |
| `shell:flush_render`, största | 15 707 ms | **3 252 ms** | < 600 | ❌ |
| Total blockerad huvudtråd | 19 407 ms | **5 837 ms** | < 2 000 | ❌ |

**De tre missade kriterierna var inte fel ordning.** Enpass-räkningen tog bort 4,8× och satt ovanpå något större. Utan den hade det här fyndet varit svårare att se: de tretton passen dolde att kostnaden låg **per tråd**, inte per pass.

### Superlinjäriteten kvarstår, oförändrad i form

Alla sju anrop vid boot:

| start | ms | trådar |
|---|---|---|
| 329 · 340 · 2342 · 2357 | 0 | 0 |
| 2382 | 195 | 120 |
| **3386** | **125** | **536** |
| **3553** | **3 244** | **536** |

Identiskt trådantal, 167 ms isär, faktor 26. Före ORD-82 var kvoten 630 → 15 700 ms, faktor 25.

## Rotorsak

Ett framtvingat `v2:lane_counts` med 545 trådar tog 6 969 ms. Primitivnedbrytning:

| Primitiv | Anrop | Per tråd |
|---|---|---|
| **`String.toLowerCase`** | **78 661 929** | **144 334** |
| `RegExp.exec` | 3 960 638 | 7 267 |
| `String.normalize` / `String.replace` | 3 946 890 | 7 242 |
| `Array.find` (snittlängd 8,4, max 545) | 134 649 | 247 |
| `Array.join`, 6 element | 13 532 | 25 |

Stack-sampling ger kedjan:

```
iv   journey-moduler (modules, latestEvent, attention, bodyPreview)
 └─ hw   historik-events (historyEvents, conversationId, flatMap, sort)
     └─ sf   filtrerar trådar på customerEmail / customerName
         └─ Hc   getMailboxScopedRuntimeThreads
             └─ Cs   getMailboxIdentityTokens (email, label, split)
                 └─ normalizeKey → toLowerCase
```

**Kostnaden ligger inte i att bygga journey-strukturen.** Den ligger i att
journey-byggaren, per tråd, gör en kundtrådsslagning som räknar om **hela
mailbox-scopet från grunden** — ett fullt pass över alla trådar × alla
brevlådor × tokennormalisering.

545 × 545 × ~250 ≈ 74 M. Uppmätt 78,7 M. Storleksordningen stämmer.

Det förklarar också kvoten: vid anrop A hade journey-datan inte anlänt, så
`getThreadJourneyActiveModuleId` returnerade tidigt och per-tråd-kostnaden var
noll. Vid anrop B fanns den, och varje tråd drog igång en full scope-omräkning.
Kvoten är inte textmängd — den är O(1) som blir O(n) per tråd, alltså O(n²).

**Samma form som ORD-81 och ORD-82: en invariant som räknas om inne i en loop.
Tredje gången.**

## Ändring

**Beräkna mailbox-scopet en gång per render och skicka ner det.**

### Krav 1 — rör inte den delade hjälparen

`getMailboxScopedRuntimeThreads` (`app.js:15364`) har **21 träffar** i tre filer:

| Fil | Träffar |
|---|---|
| `app.js` | 11 (inkl. definitionen) |
| `runtime-dom-live-composition.js` | 4 |
| `runtime-queue-renderers.js` | 6 |

Att ändra dess signatur träffar alla. Samma disciplin som ORD-82: **lämna den
oförändrad** och lägg till en väg som tar scopet som argument. Anroparna
migreras inte i denna sväng — bara den heta vägen.

### Krav 2 — `demoThreads` beräknas ovillkorligt

Överst i funktionen:

```js
const demoThreads = asArray(state.runtime?.threads).filter(
  (thread) =>
    String(thread?.worklistSource || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") === "demo"
);
const shouldPreferDemoThreads =
  !state.runtime?.authRequired &&
  !availableMailboxes.length &&
  demoThreads.length > 1 && ...
```

Ett fullt pass över alla trådar med tre strängoperationer per tråd, **varje
anrop**, trots att resultatet bara används om `!availableMailboxes.length` —
falskt i normalfallet med nio brevlådor.

Flytta beräkningen bakom villkorets billiga delar så att den inte körs alls i
normalfallet. **Egen commit, egen mätning** — den är liten, isolerad och
mätbar för sig, och ska inte blandas ihop med scope-lyftet.

### Krav 3 — ingen beteendeförändring

Scopet som skickas ner måste vara **exakt** det `getMailboxScopedRuntimeThreads()`
hade returnerat vid samma tidpunkt. Ingen ny filtrering, inga ändrade tokens,
ingen ändrad ordning. Detta är en flytt av *när* något beräknas, inte av *vad*
det svarar.

### Krav 4 — ingen cache som överlever renderingen

Scopet får bara leva inom en render. Trådlistan och brevlådevalet ändras under
laddningen; ett scope som överlever tvären skulle servera ett gammalt urval.
Samma lärdom som ORD-81:s osanerade returväg — *finns det ett tillstånd där en
post kan skrivas som är fel att läsa senare?*

## Scope-vakt

Endast scope-lyftet i den heta vägen, plus `demoThreads`-villkoret som egen
commit. Följande är kända och rörs **inte**:

- Memoisering av journey per tråd. Behandlar symptomet; blir onödig om
  orsaken tas bort. Egen order om ommätningen visar att den behövs.
- Fältsammanfogningen i `isCommercialRuntimeThread` / `isConsultationRuntimeThread`
  (ORD-82:s ursprungliga hypotes). Verifierad som marginell: 13 532
  sexelement-joins mot 78,7 M `toLowerCase`. 0,02 %.
- `classifyRuntimeRowFamily` (`app.js:7070`).
- Migrering av de 21 anroparna.

## Mätprotokoll

URL: `https://arcana.hairtpclinic.com/major-arcana-preview/?embed=admin&conversations=v2&view=conversations&ccoPerf=1`

Miljöblocket enligt `docs/handover/ORDER-TEMPLATE.md` är obligatoriskt, inklusive
`visibilityState` loggad genom hela fönstret. Mät inte under deploy — vänta ut
minst 10 minuters oförändrad `startedAt`.

**Rapportera varje `v2:lane_counts`-anrop**, inte bara det största. Kvoten
mellan de två 536-tråds-anropen är måttet på om orsaken faktiskt är borta.

| Nyckeltal | Efter ORD-82 | Krav |
|---|---|---|
| `v2:lane_counts`, största | 3 244 ms | **< 300 ms** |
| Kvot mellan de två 536-tråds-anropen | 26× | **< 3×** |
| `shell:flush_render`, största | 3 252 ms | < 600 ms |
| Total blockerad huvudtråd | 5 837 ms | < 2 000 ms |
| Tid till `#cco-conv-v2-root` | 328 ms | får ej försämras |
| `toLowerCase` per lane_counts-anrop | 78 661 929 | < 500 000 |

Kvoten är det viktigaste måttet. Sjunker största anropet men kvoten består är
orsaken inte borta, bara mindre — och det ska sägas rakt ut.

## Acceptanskriterier

1. Nyckeltalen ovan, uppmätta i prod, synlig flik, stilla server.
2. **Identiska lane-siffror före och efter**, samma paritetsansats som ORD-82:
   gammal väg mot ny på samma trådlista, lane för lane.
3. Test som visar att scopet beräknas **en gång per render**, inte per tråd.
4. `demoThreads`-ändringen mätt separat.
5. Befintlig testsvit grön. `check:syntax` grön. `arcana-ci` grön.

## Förbehåll i underlaget

Dessa står kvar med avsikt. De begränsar hur starkt fyndet får formuleras.

- **Anrop A och B mättes inte direkt.** Injektionen landar ~10 s in; A och B
  sker vid 3 386 och 3 553 ms. Primitivnedbrytningen kommer från en
  **framtvingad** körning efter boot. Slutsatsen att A var billig för att
  journey-datan saknades är en **inferens**, inte en mätning.
- **`state.aftercare.queue` lästes efter förloppet**, inte under. Den var tom
  (0) med 545 trådar i state, vilket falsifierar kandidat 1 — men läsningen
  skedde i efterhand och utesluter inte formellt att kön var fylld vid 3 553 ms.
- Bundle-till-källa-mappningen (`iv`, `hw`, `sf`, `Hc`, `Cs`) är gjord genom
  identifierarextraktion ur den minifierade bundlen, inte via source maps.
  Namnen är sannolika, inte bevisade.
