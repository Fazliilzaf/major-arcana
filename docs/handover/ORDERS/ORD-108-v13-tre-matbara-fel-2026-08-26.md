# ORD-108 · V13 · tre mätbara fel efter ORD-107

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-107

---

## Först: det blev mycket bättre

Jag öppnade samma kund i produktion som förra gången —
`03c7a38d-e58d-4810-8fb0-496fbf66d6e7` — och renderade båda
facit-filerna bredvid i en egen flik. Sedan jämförde jag med ögat och
med mätvärden.

Vyn är inte längre naken HTML. Kort, typografi, guldknappar,
pill-badges, vellum-bakgrunder — allt det finns nu. 279 regler under
`.v13-view-shell` tar. `#s-warn` har padding. `?v13=off` ger fortfarande
V11. Uppgift 2 och 3 är levererade som beställt.

Tre saker är fel. Alla tre går att mäta, så du kan verifiera dem själv
utan att se bilder.

---

## Fel 1 — huvudkolumnen är smalare än högerspalten

Det här är din egen reservation, och den var befogad. Men den är värre
än "kan bli smalare".

Jag mätte båda:

|                    | Facit    | Produktion |
| ------------------ | -------- | ---------- |
| `.workspace` bredd | 1 280 px | **660 px** |
| `.main` bredd      | 896 px   | **276 px** |
| `.rail` bredd      | 360 px   | 360 px     |
| main ÷ rail        | **2,49** | **0,77**   |

Huvudkolumnen är 31 % av vad facit räknar med, och **smalare än
högerspalten**. Hero-kortet blir en remsa där avatar, namn och knappar
staplas på varsin rad i stället för att ligga sida vid sida. Facits
horisontella tidslinjer får inte plats.

Orsaken sitter inte i din CSS. Den sitter fyra nivåer upp:

```
.preview-workspace       grid  500px 1208px
  .customers-layout      grid  200px 834px 660px
    .customers-rail            max-width: 660px      ← taket
      .patient-master-card.v13-view-shell
        .workspace       grid  1fr 360px  →  276px + 360px
```

`.customers-rail` har `max-width: 660px`. Med `1fr 360px` blir
1fr = 276 px. Facit är byggt som en helsidesarbetsyta med
`margin: 24px auto 96px` och `max-width: 1280px` — det är inte en
högerspalt.

**Bygg ingenting förrän Fazli valt väg.** Tre alternativ:

- **A · Låt V13 ta hela bredden.** Kundkortet blir en helsidesvy i
  stället för spalt när `?v13=on`. Närmast facit. Rör
  `customers-layout` bakom flaggan, alltså inte V11.
- **B · Bryt till en kolumn under ~1 000 px.** `.workspace` blir
  `grid-template-columns: 1fr` och railens fem sektioner faller under
  huvudkolumnen. Behåller dagens skal. Huvudkolumnen får 660 px i
  stället för 276.
- **C · Vidga `.customers-rail`** från 660 till ~1 280 när V13 är på.

Skriv vad var och en kostar och vad den bryter. Genomför ingen.

---

## Fel 2 — railens `.sec` skriver över huvudkolumnens

Rad 195–205 i `cco-v13.css`:

```css
.v13-view-shell .sec {
  margin-top: 28px;
}
/* från HOGERSPALT — saknas i WORKSPACE-facit */
.v13-view-shell .sec {
  margin: 12px 12px 0;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--card-bg);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
}
```

Din kommentar säger "saknas i WORKSPACE-facit". Men det är inte en
regel som saknas — det är **samma klassnamn för två olika saker i två
olika sammanhang**. I WORKSPACE är `.sec` en naken sektion i
huvudkolumnen. I HOGERSPALT är `.sec` ett kort i spalten. Under ett
platt scope vinner den sista.

Följden, uppmätt i produktion: **alla elva sektionerna i
huvudkolumnen** — `s-hero`, `s-visit`, `s-warn`, `s4`, `s-resa`,
`s-journal`, `s-foto`, `s-plan`, `s-dok`, `s-komm`, `s-eko` — har fått
railens kortram: `padding: 11px 12px`, `border-radius: 12px`,
vellum-gradient, 12 px sidomarginal.

Facit gör inte så. Jag mätte `#s-warn` i facit-filen: **`padding: 0px`**.
Sektionerna i huvudkolumnen ligger direkt på `.main`-kortets bakgrund
utan egen ram. Nu ligger kort i kort.

Din verifiering skrev: _"#s-warn: padding 11px 12px (var 0),
vellum-gradient-bakgrund ✓"_. Du mätte att värdet **ändrades**, inte att
det ändrades till rätt sak. I facit ska det vara 0.

**Åtgärd:** scopa de två `.sec`-familjerna isär. `.v13-view-shell .main .sec`
tar WORKSPACE-varianten, `.v13-view-shell .rail .sec` tar
HOGERSPALT-varianten. Samma sak för varje annan klass som krockar —
gå igenom dem, det är inte bara `.sec`.

---

## Fel 3 — 71 av HOGERSPALTs 91 klasser kom aldrig med

`cco-v13.css` har 279 klassregler. Facit har 484 (253 + 231). Jag
jämförde klass för klass:

|                                                          | Antal  |
| -------------------------------------------------------- | ------ |
| Klasser HOGERSPALT-facit stylar                          | 91     |
| Av dem som saknas i `cco-v13.css`                        | **71** |
| Klasser som används i kortet utan v13-regel              | **49** |
| Av dem som finns i annat scope (`.v11-rk`, `.v12-canon`) | 46     |
| Helt ostylade                                            | 3      |

De 71 innehåller hela `av-*`-familjen (aktivt besök: `av-head`,
`av-timeline`, `av-tnode`, `av-treatment`, `av-collapse` …), `book-*`,
`comm-*`, `j-*`, `eko-grid`, `hist-row`, `insight-row`, `avatar`,
`btn-action`, `empty-line`.

### Ett synligt exempel du kan testa direkt

`.sec-label` och `.count` finns **inte** i `cco-v13.css`. De enda
reglerna i den körande sidan är `.v11-rk .sec-label` — fel scope.

Markup i produktion:

```html
<div class="sec-label">
  <span>Smart nästa steg</span><span class="count warn">0</span>
</div>
```

`.sec-label` får `display: block` i stället för facits
`display: flex; justify-content: space-between`. Siffran klistrar sig
i rubriken. På skärmen står det:

```
Smart nästa steg0
Insikter · topp 20
Besök · tillfällen1
```

Det ska vara rubriken till vänster och siffran till höger. Regeln finns
i HOGERSPALT-facit på rad 232:

```css
.sec-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
```

Den kom aldrig med. Troligen tappades den när `.sec`-krocken löstes —
blocket omkring gick förlorat.

**Åtgärd:** porta HOGERSPALT-facit färdigt. Gå igenom listan på 71 och
avgör per klass om den används av renderaren idag. Används den → porta.
Används den inte → skriv det, porta ändå (verbatim betyder hela filen),
men flagga den i gaptabellen.

---

## Fel 4 — hero och två sektioner bär fortfarande V11:s klassnamn

Uppgift 2 bytte fyra layoutklasser och några till. Men hero-kortet
renderar med V11:s namn:

| Facit         | Produktion  |
| ------------- | ----------- |
| `hero`        | `s1-hero`   |
| `hero-name`   | `s1-name`   |
| `hero-body`   | `s1-body`   |
| `hero-kicker` | `s1-status` |
| `hero-meta`   | `s1-id`     |
| `avatar-xl`   | —           |

`cco-v13.css` har regler för `hero`, `hero-body`, `hero-name`,
`hero-kicker`, `hero-meta`, `avatar-xl` — men renderaren sätter aldrig
de klasserna, så de sitter oanvända. Samma sak för `s4-grid` (Hälsa) och
`s5-progress` (Kundresa): **noll** regler i `cco-v13.css`, klasserna
används ändå.

**Åtgärd:** byt `s1-*` → facits `hero*` i `cco-v13-render.js`, som du
gjorde med de fyra layoutklasserna. Porta `s4-grid` och `s5-progress`
eller byt dem mot facits namn — kolla vilket facit faktiskt använder
innan du väljer.

---

## Så här verifierar du utan att se bilder

Kör i konsolen på ett öppet kundkort med `?v13=on`:

```js
const ws = document.querySelector('.workspace');
const main = document.querySelector('.main');
const rail = document.querySelector('.rail');
const lbl = document.querySelector('.rail .sec-label');
({
  kvot: (main.offsetWidth / rail.offsetWidth).toFixed(2), // ska ≈ 2.49
  mainSecPadding: getComputedStyle(document.querySelector('.main .sec'))
    .padding, // ska vara 0px
  labelDisplay: getComputedStyle(lbl).display, // ska vara flex
  labelJustify: getComputedStyle(lbl).justifyContent, // ska vara space-between
});
```

Facits värden, mätta av mig idag i `V13-WORKSPACE-CONTENT-2026-08-24.html`
respektive `V13-HOGERSPALT-2026-08-24.html`:

```
kvot            2.49
#s-warn padding 0px
sec-label       display: flex · justify-content: space-between
```

Du kan rendera facit lokalt utan webbläsarfönster:

```
cd docs/facit/v13 && python3 -m http.server 8899
```

och läsa värdena med samma skript.

---

## Ordning

Fel 2 och 3 och 4 är dina att laga. **Fel 1 är Fazlis beslut** — skriv
alternativen, bygg inte.

Gör 2 först. Den är liten och den är orsaken till att 3 uppstod.

---

## Gränser

- Rör inte V11 eller V12. `?v13=off` ska ge
  `patient-master-card v11-rail`. Verifierat att den gör det idag.
- Allt scopat under `.v13-view-shell`. Ingen global CSS.
- Ingen CMO-kod. Inga hemligheter i repo. En gren. Svenska
  commit-meddelanden som förklarar _varför_.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

De tre röda du rapporterade (PR16/PR40 toast-embedded) — skriv ut vilka
de är i nästa leverans. "Förbefintliga" ska gå att kontrollera, inte tas
på ditt ord. Om de var röda före `cco-v13.css` går det att visa med
`git stash` och en körning.
