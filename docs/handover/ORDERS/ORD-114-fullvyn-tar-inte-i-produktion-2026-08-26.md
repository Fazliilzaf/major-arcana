# ORD-114 · Fullvyn tar inte i produktion

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-113

Bygget är rätt. Det tar bara inte.

---

## Vad jag mätte i produktion

Jag klickade på "Öppna fullvy →" på kunden `03c7a38d-…`:

|                    | Facit    | Produktion |
| ------------------ | -------- | ---------- |
| `.workspace` bredd | 1 280 px | **360 px** |
| `.main`            | 896 px   | **57 px**  |
| `.rail`            | 360 px   | 360 px     |
| kvot main ÷ rail   | 2,49     | **0,16**   |
| Listan gömd        | ja       | **nej**    |

Det som **fungerar**: `data-v13-fullview="on"` sätts på
`.customers-layout`. `.workspace` finns. 13 sektioner i main, 5 i rail.
`max-width: 1280px` är satt. Tillbaka-knappen finns och heter rätt.
Lilla vyn är orörd — 17 sektioner, öppna-knappen på plats.

Din harness mätte 896 + 360 och kvot 2,49. Där finns inte appens CSS,
så där stämde det.

---

## Fel 1 — grid-regeln förlorar mot `!important`

Tre regler sätter `grid-template-columns` på `.customers-layout`, och
alla tre matchar elementet:

| Fil                          | Värde                               | `!important` |
| ---------------------------- | ----------------------------------- | ------------ |
| `cco-polish.css`             | `minmax(220px,260px) minmax(0,1fr)` | nej          |
| **`cco-v10-skin.css:1342`**  | **`200px minmax(0,1fr) 424px`**     | **ja**       |
| `cco-v13-workspace.css:1730` | `1fr`                               | nej          |

V10 vinner. Selektorn är dessutom fem nivåer lång:

```css
html[data-v9-enabled='on'][data-v10-kundkort-facit='on']:not(
    [data-cco-mobile-shell='on']
  )
  .preview-canvas[data-app-shell-view='customers']
  .customers-layout[data-v10-facit-app-grid] {
  grid-template-columns: 200px minmax(0, 1fr) 424px !important;
}
```

Din regel är `.customers-layout[data-v13-fullview="on"]`. Den matchar —
jag kontrollerade med `layout.matches()` — men den skrivs över.

**Åtgärd:** fullview-regeln måste vinna. Antingen samma selektorkedja
plus `[data-v13-fullview="on"]`, eller `!important`. Jag lutar åt det
förra — det håller specificiteten synlig i stället för att starta en
`!important`-kapplöpning i en fil som redan har flera.

---

## Fel 2 — `.customers-list` är fel element

```css
.customers-layout[data-v13-fullview='on'] .customers-list {
  display: none;
}
```

`.customers-list` **finns** i dokumentet, men den är inte barn till
`.customers-layout`. Rutnätets fyra barn är:

```
aside.customers-v9-segment-sidebar   200px    (segmentmenyn)
div.customers-center-shell          2584px    ← listan sitter här
main.customers-workspace               0px
aside.customers-rail                 360px    (kundkortet)
```

Selektorn matchar alltså inget som ligger i rutnätet. Segmentmenyn på
200 px göms inte heller.

**Åtgärd:** göm `.customers-center-shell` och
`.customers-v9-segment-sidebar` — eller enklare, låt rutnätet bli
`grid-template-columns: 1fr` och dölj de tre första barnen. Kolla vad
`.customers-workspace` på 0 px är innan du rör den.

---

## Fel 3 — spaltens tak sitter kvar

`.customers-rail` har `max-width: 424px` (uppmätt). Även när rutnätet
släpper taget håller spalten kvar bredden, och `.workspace` ärver den —
`max-width: 1280px` blir verkningslös eftersom containern aldrig blir
bredare.

Kedjan i produktion just nu:

```
customers-rail                    [360px]  ← max-width 424px
 └ patient-master-card
    .v13-workspace-shell          [360px]
     └ v13-workspace-scroll       [360px]
        └ v13-workspace-view      [360px]
           └ .workspace           [360px]
```

**Åtgärd:** släpp `max-width` på `.customers-rail` när
`data-v13-fullview="on"` är satt. Samma specificitetsproblem gäller —
V10 sätter 424 px och `cco-v11-rk.css:1393` sätter
`max-width: var(--v11-rk-live-rail-width) !important`. Kontrollera
vilken som vinner innan du skriver regeln.

---

## Gränser

- **`?v13=off` ska fortsätta ge `patient-master-card v11-rail`.** Det
  har hållit genom åtta ordrar.
- **Lilla vyn får inte försämras.** 17 sektioner, `#v13-rail`,
  öppna-knappen. Verifierat i produktion före den här ordern.
- **Rör inte V10:s eller V11:s regler.** Lägg fullview-reglerna vid
  sidan av, aktiverade av attributet. Tas attributet bort ska allt vara
  som förut.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

Kör i produktion, inte i harness. Det är hela poängen med den här
ordern — harnessen saknar appens CSS och kan därför inte se felet.

```js
// före klick
const layout = document.querySelector('.customers-layout');
const före = getComputedStyle(layout).gridTemplateColumns;

document.querySelector('[data-v13-open-full]').click();
await new Promise((r) => setTimeout(r, 800));

const ws = document.querySelector('.workspace');
const main = document.querySelector('.workspace .main');
const rail = document.querySelector('.workspace .rail');
({
  gridFöre: före, //  200px … 424px
  gridEfter: getComputedStyle(layout).gridTemplateColumns, //  ska bli 1fr
  wsBredd: Math.round(ws.getBoundingClientRect().width), //  ska bli 1280
  kvot: (main.offsetWidth / rail.offsetWidth).toFixed(2), //  ska bli ~2.49
  railMaxWidth: getComputedStyle(document.querySelector('.customers-rail'))
    .maxWidth,
});
```

Idag ger det `360`, `0.16` och `424px`.

Klicka sedan **tillbaka** och kontrollera att rutnätet återgår till
`200px … 424px` och att listan syns igen. En fullvy som inte går att
stänga är värre än ingen fullvy.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Rapportera det verkliga testtalet. Senast jag körde sviten själv:
**7 240 pass / 0 fail**.
