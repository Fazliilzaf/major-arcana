# ORDER #NNN · {Kort titel}

**Created:** YYYY-MM-DD
**Assignee:** cursor | claude | kimi | both
**Priority:** P0 | P1 | P2 | P3
**Status:** pending | cursor-in-progress | awaiting-fazli | done | blocked
**Notion:** https://app.notion.com/p/{row-id}

---

## Bas och observation (obligatoriskt — fylls INNAN något påstående görs)

**Bas-commit:** {hash} ({gren}) · verifiera med `git rev-parse --short HEAD`
**Kodmiljö:** {prod-URL | lokal port | worktree — ange om `npm ci` kördes och om `.env` fanns}
**Flikens `visibilityState`:** {`visible` | `hidden`} — obligatoriskt för alla runtime-mätningar.

> En dold flik är inte ett långsamt system, det är ett **pausat**. `requestAnimationFrame`
> körs inte medan `document.visibilityState === "hidden"`, så allt som schemaläggs via rAF
> väntar — rendering, montering, mätpunkter. Mätningar i en bakgrundsflik (vanligt när
> fliken skapas eller navigeras via CDP/automation utan fokus) visar uteblivna renderingar
> som ser ut som buggar. Kontrollera med `document.visibilityState` **i samma körning** som
> mätningen, inte efteråt.

#### `visibilityState` räcker inte i en iframe

Operatörsytan ligger i en **iframe** under `/admin#cco`. Iframens
`document.visibilityState` kan rapportera `visible` medan toppdokumentets säger
`hidden` — observerat 2026-07-28. Läser man bara iframens värde tror man att fönstret
är giltigt när det är pausat.

**Mät frekvensen i stället för att lita på flaggan.** Räkna `requestAnimationFrame` i
det fönster där mätningen ska ske, i samma realm:

```js
// ~60/s = renderar, mätningen är giltig. <20/s = pausat, mät inte.
const w = document.querySelector('iframe').contentWindow;
let n = 0;
const t0 = w.performance.now();
await new Promise((r) => {
  const tick = () => {
    n++;
    w.performance.now() - t0 < 2000 ? w.requestAnimationFrame(tick) : r();
  };
  w.requestAnimationFrame(tick);
});
const rafPerSekund = n / ((w.performance.now() - t0) / 1000);
```

Skriv in den uppmätta frekvensen i tabellen nedan, inte bara `visible`.

#### Minifierad prod: closure-scope är onåbart, egenskapsnamn är det inte

Prod serverar `app.bundle.*.min.js`. Lokala variabel- och funktionsnamn är manglade och
modulfunktioner ligger i closures — de går varken att haka i eller känna igen i en
stacktrace. **Egenskapsnamn manglas däremot inte.**

Bär en memo eller cache i en `WeakMap`/`Map` går den att mäta utifrån: instrumentera
`WeakMap.prototype.get/set` **i rätt realm** (iframens, inte toppdokumentets), tagga
varje karta med ett icke-uppräkningsbart id, och räkna unika nycklar per karta.
`set`-antal lika med antal unika nycklar = memon håller.

##### Krav — bindande, inte rekommendationer

**1. Uttryckligt ägar-GO innan prototypen muteras i prod.**
Att städa upp efter sig räcker inte som grund för att göra ingreppet. En
prototypmutation på en levande operatörsyta är ett eget beslut och ska begäras för sig,
även när mätningen i övrigt är godkänd.

**2. Patchen ligger i `try`, återställningen i `finally`. Utan undantag.**
Ett kast mellan patch och återställning lämnar prod med en muterad `WeakMap.prototype`
för **alla** operatörer, på obestämd tid. Första oväntade felet i probe-koden blir då ett
produktionsfel som ingen kan härleda till en mätning.

Det är samma disciplin som `withMailboxScopePass` (ORD-83) och `readCache.wrap` (ORD-85)
bygger på — passet respektive in-flight-posten rivs i `finally`, aldrig på lyckospår. Ett
mätverktyg får inte hålla lägre standard än koden det mäter.

```js
const WM = w.WeakMap.prototype;
const origGet = WM.get,
  origSet = WM.set;
const återställ = () => {
  WM.get = origGet;
  WM.set = origSet;
};
try {
  WM.get = function (k) {
    /* … räkna … */ return origGet.call(this, k);
  };
  WM.set = function (k, v) {
    /* … räkna … */ return origSet.call(this, k, v);
  };
  // … framtvinga passet, läs av …
} finally {
  återställ();
}
// Bekräfta i utdatan att återställningen skedde — påstå den inte.
```

**3. Verifiera mot en oberoende siffra** att det är rätt karta du mätt. Vid ORD-84 visade
UI:ts egen köräknare 625 — samma tal som antalet unika nycklar. Utan den kontrollen vet
du att _en_ WeakMap betedde sig som en memo, inte att det var memon du sökte.

**4. Bekräfta återställningen i utdatan**, i samma körning. Skriv ut att
`WeakMap.prototype.get` är identisk med originalet och att proben är borttagen.

> **Historik:** ORD-84:s ommätning 2026-07-28 gjordes utan punkt 1 och utan `finally`.
> Prototypen återställdes och verifierades, men på lyckospår — inget kastade. Kravet
> skrevs in efter Codex invändning, inte före mätningen.

### Regel: ett stickprov är inte ett tillstånd

Felen som kostat oss mest tid har alla haft samma form — någon rapporterade ett
stickprov som ett tillstånd. Två axlar:

- **Stickprov i kod** — läst fel bas, eller antagit orsak utan att mäta.
  Motmedel: bas-commit ovan.
- **Stickprov i tid** — mätt mitt i boot, mitt i ett blockerande pass, eller
  före att data hunnit fram. Motmedel: observationsfönstret nedan.

> En observation av ett tidsvarierande system är inte ett tillståndspåstående
> förrän man vet att systemet var stabilt när man tittade.

Det räcker alltså inte att ange _när_ man mätte. Skriv ut _fönstret_ och om
systemet var stabilt i det.

### Runtime-observationer (en rad per påstående)

| Påstående                            | Fönster (från–till efter load)                | Stabilt?                         | Belägg                          |
| ------------------------------------ | --------------------------------------------- | -------------------------------- | ------------------------------- |
| _ex:_ `#cco-conv-v2-root` saknas     | 8–40 s, flik `visible`                        | **NEJ** — boot + longtask pågick | indraget, felaktigt             |
| _ex:_ V2 monterar aldrig, blank sida | 0–161 s, flik **`hidden`**                    | **NEJ** — rAF pausad             | indraget, var mätuppställningen |
| _ex:_ V2 monterad, äger ytan         | 163,5 s, efter sista longtask, flik `visible` | ja                               | mount-recorder + DOM-kedja      |

**Stabilt = NEJ** om något av detta pågick i fönstret: boot, en longtask, en
inflight-fetch som påverkar ytan, **eller att fliken var `hidden`**. Vid NEJ får
observationen inte formuleras som ett tillstånd — den får formuleras som "vid
tidpunkt X, under villkor Z, gällde Y".

## Uppdrag

{En mening}

## Scope (får röras)

- paths

## Förbjudet (rörs ej)

- server.js (om ej explicit i order)
- Nytt kundkort-skUI utanför `.kkref` (v11-rail som default, nya staff-flikar i referens-läge, parallell render-path)
- `switchDetailTab` som enda journal/antecknings-CTA i referens — använd KKX / `data-sek`

---

## Kundkort UX (obligatoriskt om ordern rör kundkort / staff kunder)

Facit: **ORD-47 referens** — samma UI som live (`.kkref .doss`). Se `.cursor/rules/kundkort-referens-ux.mdc`.

### Tre frågor (fylls innan kod)

1. **Visuell förebild:** Vilken befintlig sektion? (t.ex. "Journaler · personal", "Besök", `.kkref-active-visit`)
2. **Vy-nivå:** sektion (scroll) | storvy (`#kkx-ov` / KKX) | aktivt besök | slide-over (ORD-26)
3. **CTA → landning:** Scroll till `data-sek=…` / `mountKkxJournalBig` / `journeyHandlers` — **inte** ny modal eller flik

**Screenshot-krav:** Prod eller lokal referens — nytt ska se ut som **samma kort**, inte ny layout.

### PR-checklista (kundkort)

- [ ] Vy-nivå + förebild dokumenterad ovan
- [ ] Markup i `cco-kundkort-referens.js` (eller parity endast om aktivt besök/v11 opt-in)
- [ ] CSS under `.kkref` / `kkref-*` i `cco-kundkort-referens.css` eller scoped i `cco-v9-customers.css`
- [ ] `data-sek` + `orderDossierHtml` om ny sektion
- [ ] Handlers via `bindKkxReferensPanel` / `journeyHandlers` — inte parallell bind
- [ ] `node scripts/verify-v11-paritet.js` PASS
- [ ] Prod-screenshot bifogad i rapport

---

## Gates

```bash
npm run check:syntax
npm run lint:no-bypass
npm run test:unit
node scripts/verify-v11-paritet.js
# Kundkort:
npm run verify:ord47-prod-sticks
# Journal-yta om relevant:
npm run verify:kkx-journal-workspace-prod
```

## Rapport (fylls av Cursor)

- filer ändrade
- gates PASS/FAIL
- kundkort: vy-nivå, förebild-sektion, screenshot (om UI)
- nästa beslut
