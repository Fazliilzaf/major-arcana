# ORD-115 · Fullvyn tar — men den står i högerkanten

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-114 (`6578df0`)

Alla tre felen är lagade. Jag har mätt om dem i produktion och de
stämmer. Ett fel återstår, och det syns bara med ögat.

---

## Vad som nu stämmer

Mätt i produktion på `03c7a38d-…`, `?v13=on`:

|                             | Facit    | Produktion |
| --------------------------- | -------- | ---------- |
| `.workspace` bredd          | 1 280 px | **1 280**  |
| `.main`                     | 896 px   | **896**    |
| `.rail`                     | 360 px   | **360**    |
| kvot main ÷ rail            | 2,49     | **2,49**   |
| `.customers-rail` max-width | none     | **none**   |
| Segmentmeny + lista gömda   | ja       | **ja**     |
| Sektioner main / rail       | 12 / 5   | **12 / 5** |

Och tillbaka-knappen håller. Rutnätet återgår till
`200px 2584.02px 360px`, spaltens tak till `424px`, listan och
segmentmenyn syns igen, lilla vyn har sina 17 sektioner.

Det är ren leverans på alla tre punkterna i ORD-114.

---

## Felet som är kvar

**Arbetsytan står klistrad mot högerkanten.**

```
viewport        3200
.workspace      x 1908 → 3188
tomt till vänster   1896 px
tomt till höger        0 px
```

På en bred skärm är alltså mer än halva ytan tom på vänster sida, och
arbetsytan ligger i kanten. Facit är en fristående sida på 1 280 px —
den ska stå mitt i ytan, inte i ena hörnet.

### Orsaken

Din regel gör rätt. `grid-template-columns: 1fr !important`
(`cco-v13-workspace.css:1742`) matchar och vinner — jag kontrollerade
selektorn med `layout.matches()`, den träffar.

Problemet ligger på barnet:

```
getComputedStyle(document.querySelector('.customers-rail')).gridColumn
→ "3"
```

**`.customers-rail` är explicit placerad i kolumn 3.** När ett
grid-barn pekas ut till kolumn 3 skapar webbläsaren implicita kolumner
fram till dess, oavsett vad mallen säger. Därför blir den faktiska
kolumnlistan `1864.02px 0px 1280px` i stället för en enda kolumn — och
spalten hamnar sist, alltså längst till höger.

Det syns på att `grid-template-columns` inte biter ens som inline
`!important`. Jag testade: värdet ändras inte. Det är inte en
specificitetsfråga den här gången.

### Fixen — en deklaration

Neutralisera placeringen i fullvy, i samma starka kedja som redan sätter
`max-width: none` på `.customers-rail` (rad 1760–1782):

```css
grid-column: 1 !important;
```

Jag provade den live i produktion innan jag skrev den här ordern:

|              | Före                   | Efter            |
| ------------ | ---------------------- | ---------------- |
| Kolumnlista  | `1864.02px 0px 1280px` | **`3176.02px`**  |
| `.workspace` | x 1908 → 3188          | **x 960 → 2240** |
| Tomt vänster | 1 896 px               | **948 px**       |
| Tomt höger   | 0 px                   | **948 px**       |
| Bredd        | 1 280                  | **1 280**        |
| kvot         | 2,49                   | **2,49**         |

948 på var sida. Centrerad. Bredden och proportionen är orörda —
`max-width: 1280px; margin: 0 auto` gör resten så fort kolumnen är hel.

---

## Gränser

- **Rör inte de tre reglerna från ORD-114.** De är rätt. Det här är ett
  tillägg i samma block, inte en omskrivning.
- `?v13=off` ska fortsätta ge `patient-master-card v11-rail`.
- Tillbaka-knappen måste fortsätta återställa **allt**, nu även
  `grid-column`. Kontrollera det, inte bara framåtvägen.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion, inte i harness:

```js
const layout = document.querySelector('.customers-layout');
document.querySelector('[data-v13-open-full]').click();
await new Promise((r) => setTimeout(r, 800));

const ws = document.querySelector('.workspace');
const lr = layout.getBoundingClientRect();
const wr = ws.getBoundingClientRect();
({
  grid: getComputedStyle(layout).gridTemplateColumns, //  en kolumn
  railGridColumn: getComputedStyle(document.querySelector('.customers-rail'))
    .gridColumn, //  1
  bredd: Math.round(wr.width), //  1280
  tomtVanster: Math.round(wr.left - lr.left), //  ~948
  tomtHoger: Math.round(lr.right - wr.right), //  ~948
});
```

Skillnaden mellan vänster och höger ska vara noll, inte 1 896.

Klicka sedan tillbaka och kontrollera `200px … 424px` och
`gridColumn: "3"` igen.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Du rapporterade 7 239 pass / 0 fail. Rapportera det verkliga talet igen.

---

## En sak som inte är ditt fel

I fullvyn står **"Smart nästa steg: 0 — inga smarta nästa steg just nu"**
samtidigt som **Kritiska varningar visar två rader** (hälsodeklaration
saknas, journal saknas). Det ser ut som en V13-bugg. Det är det inte.

Signalmotorn var avstängd i produktion — `ENABLE_AUTOMATION_RUNNER` fanns
inte bland de 190 env-nycklarna i Render. Jag har lagt in flaggan i
`render.yaml` (`4e471a95`); den slår på vid nästa deploy. Varningarna
kommer från kkx-logiklagret i klienten, som fungerar utan motorn.

**Rör inget i V13 på grund av den tomma rutan.** Kolla den efter deployen
i stället.
