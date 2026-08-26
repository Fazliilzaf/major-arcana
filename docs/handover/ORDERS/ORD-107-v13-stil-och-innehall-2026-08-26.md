# ORD-107 · V13 har skelett men varken hud eller kött

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main` (V13 är mergad och ligger ute)
**Föregås av:** ORD-106

---

## Vad jag såg när jag öppnade den

Jag öppnade ett riktigt kundkort i produktion med `?v13=on` —
`03c7a38d-e58d-4810-8fb0-496fbf66d6e7`, Abdirahman ismail — och läste
DOM och CSS ur den körande sidan.

**Det du byggde fungerar.** Flaggan tar, kortet får klassen
`patient-master-card v13-view-shell`, `data-v13-canon` finns, och alla
arton sektionerna renderar i rätt ordning:

```
s-hero  s-visit  s-warn  s4  s-resa  s-journal  s-foto  s-plan
s-dok   s-komm   s-eko   s-uppf  s-hist
s-next  s-insights  s-book  s-doc-latest  s-visits-hist
```

`s4` är Hälsa, kvar i huvudkolumnen. Bokningar och Insikter ligger i
högerspalten. Det är precis Fazlis fem beslut. Och `?v13=off` ger
`patient-master-card v11-rail` tillbaka — opt-in-gränsen håller.

**Men vyn är oläslig.** Ingen tvåkolumnslayout, inga kort, ingen
typografi, ingen padding. Allt ligger som naken HTML i en vänsterställd
textkolumn. Rubrik, brödtext och knappar har samma vikt. Det ser ut som
en punktlista, inte som ett kundkort.

Du skrev själv i din leverans: _"DOM-strukturen är verifierad, men ögat
är obekräftat (jag kan inte se bilder)."_ Det var rätt förbehåll. Här är
vad ögat ser.

---

## Orsak 1 — det finns ingen V13-stilmall

Räknat i den körande sidan: **noll** CSS-regler bland 33 stilmallar
nämner `v13`.

`cco-v13-render.js` sätter fyra layoutklasser:

```
.v13-view   .v13-view__grid   .v13-view__main   .v13-view__rail
```

Ingen av dem definieras någonstans. `ls public/major-arcana-preview/cco-v13*.css`
ger ingenting.

Sektionsklasserna `.sec`, `.sec-h`, `.sec-num`, `.sec-title` **finns** —
men scopeade under `.v12-canon`, rad 250 i `cco-v12-canon.css`. V13-shellen
har inte den klassen, så de faller bort. Uppmätt på `#s-warn` i den
körande sidan: `padding: 0px`, `background: rgba(0,0,0,0)`,
`border: 0px none`.

---

## Orsak 2 — och den är större: DOM:en är en skiss

Jag jämförde klass för klass mellan facit och renderaren.

|                                      | Antal   |
| ------------------------------------ | ------- |
| Klasser facit stylar                 | **186** |
| Klasser `cco-v13-render.js` sätter   | **21**  |
| Av dessa 21: finns inte i facit alls | **11**  |

De elva som inte finns i facit:

```
book-meta  book-title  empty-line  insight-row  next-row
photo-cell  photo-placeholder
v13-view  v13-view__grid  v13-view__main  v13-view__rail
```

Alla fyra layoutklasserna är egen uppfinning. **Facit heter något annat:**

```css
.workspace {
  max-width: 1280px;
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 24px;
  align-items: start;
}
.main {
  background: var(--shell-bg);
  border-radius: 28px;
  padding: 24px 28px 28px;
}
.rail {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rail-card {
  background: var(--vellum);
  border-radius: 18px;
  padding: 16px 18px;
}
```

Och 165 av facits klasser sätts aldrig av renderaren: `av-btn`,
`booking-row`, `comm-row`, `doc-row`, `eko-cell`, `badge`, `chip`,
`crumbs`, `btn-gold`, `empty-state` och så vidare.

Proportionerna säger samma sak:

| Fil                 | Rader          |
| ------------------- | -------------- |
| `cco-v12-canon.js`  | 2 527          |
| `cco-v13-render.js` | **261**        |
| `cco-v12-canon.css` | 2 565          |
| `cco-v13.css`       | **finns inte** |

Så V13 är ungefär en tiondel av V12 i omfång. Det som renderar är
sektionsramar med rå text i, inte de komponenter facit visar.

Det här är inte kritik av leveransen — ORD-106 uppgift 2 sa "bygg
strukturen", och strukturen är rätt. Men den som tror att V13 är klar
kommer bli besviken, och det ska stå i klartext innan nästa steg.

---

## Den goda nyheten: mycket finns redan

`cco-v12-canon.css` är enligt sin egen header en **verbatim-port av
V12-facit**, scopead under `.v12-canon`. Den definierar exakt de
variabler V13-facit använder — samma namn, samma designspråk:

```
--ink  --ink-soft  --ink-mute  --hair  --bg-page  --vellum  --shell-bg
--card-shadow  --shell-shadow  --gold  --red  --green  --amber  --lila
--info  --vip-grad  --vip-ink  --amber-stripe  --pulse-amber  …
```

Alla 32 finns redan, bara under fel scope. Du bygger alltså inte 1 799
rader från noll.

---

## Uppgift 1 — `cco-v13.css`, verbatim-port

Gör exakt som V12 gjorde. Samma mönster, samma disciplin.

Skapa `public/major-arcana-preview/cco-v13.css`, scopead under
`.v13-view-shell`, med samma slags header som `cco-v12-canon.css` har:
vilket facit den är port av, och varför den är scopead.

Källa är `<style>`-blocken i facit:

| Fil                                                    | Rader CSS | Klassregler |
| ------------------------------------------------------ | --------- | ----------- |
| `docs/facit/v13/V13-WORKSPACE-CONTENT-2026-08-24.html` | 1 799     | 253         |
| `docs/facit/v13/V13-HOGERSPALT-2026-08-24.html`        | 1 630     | 231         |

**Verbatim betyder verbatim.** Kopiera värdena, ändra dem inte. Om två
regler krockar mellan filerna — skriv vilken du valde och varför, i en
kommentar på plats. Gissa inte.

Koppla in den i `index.html` bredvid de andra, med versionsquery som de
andra har.

---

## Uppgift 2 — byt renderarens klassnamn till facits

`.v13-view__grid` → `.workspace`, `.v13-view__main` → `.main`,
`.v13-view__rail` → `.rail`, och likadant för de sju övriga i listan
ovan. Behåll `.v13-view` som yttre shell om du vill ha ett scope-ankare,
men då ska den vara **tom av stil** och bara bära scopet.

Anledningen är inte estetisk. Så länge renderaren och facit har olika
namn på samma sak måste varje framtida ändring översättas i huvudet på
den som gör den, och den översättningen är där fel uppstår.

`data-v13-canon` behåller du — `patient-master-ui.js` letar efter den.

---

## Uppgift 3 — lista gapet, bygg inte igen det

De 165 klasser facit stylar men renderaren inte sätter är inte 165
buggar. Många hör till komponenter som ska komma senare.

Leverera en tabell i `docs/handover/`:

| Facitklass | Vilken sektion | Finns adapter? | Bedömning |
| ---------- | -------------- | -------------- | --------- |

Kolumn 3 svarar med funktionsnamn ur `CcoV11RailAdapters` — där finns 25
`build*`, och V11-railen matar dem med riktig data idag. Kolumn 4 säger
"trivial", "kräver ny adapter" eller "ingen data finns".

**Skriv ingen kod i uppgift 3.** Fazli bestämmer vad som byggs härnäst.

---

## Verifiering — och den här gången med ögat

Efter uppgift 1 och 2:

1. Öppna facit-HTML:en i en webbläsare. Den renderar fristående.
2. Öppna produktion med `?v13=on` på samma kund som jag använde.
3. **Ta skärmbilder av båda** och lägg dem i leveransen.

Du kan inte se bilder. Det betyder att du inte kan avsluta uppgift 1
själv — lämna den till mig eller Fazli för det sista steget, och skriv
ut det i leveransen istället för att skriva "verifierad".

Mät det som går att mäta programmatiskt:

```js
getComputedStyle(document.querySelector('#s-warn'));
```

ska ge padding och bakgrund som inte är noll. Idag ger den `0px` och
`rgba(0,0,0,0)`.

---

## Gränser

- **Rör inte V11 eller V12.** `?v13=off` ska fortsätta ge
  `patient-master-card v11-rail`. Jag kontrollerade att den gör det idag;
  den ska göra det efteråt också.
- Scopa allt under `.v13-view-shell`. Ingen global CSS. Ingen
  `.v12-canon` på V13-shellen — att låna V12:s scope ger snabb vinst och
  långsam skuld, och ORD-106 varnade redan för att blanda generationerna.
- Ingen CMO-kod. Inga hemligheter i repo. En gren. Svenska
  commit-meddelanden som förklarar _varför_.
- Inga påhittade namn, nummer eller adresser.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Sviten är grön sedan 2026-08-25 och var grön när V13 mergades. Blir något
rött nu är det ditt.
