# ORD-109 · V13 är två vyer, inte en — kursändring

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Ersätter:** ORD-108 fel 1. Övriga punkter i ORD-108 ändras, se sist.

---

## Först: felet är mitt

ORD-107 uppgift 2 sa åt dig att byta renderarens klassnamn till
`.workspace`, `.main` och `.rail`. Du gjorde precis det. Det var fel
instruktion.

Jag läste de två facit-filerna som _huvudkolumn och högerspalt i samma
vy_. De är inte det. **De är två separata vyer.** Du byggde det jag bad
om; jag bad om fel sak.

Fazli såg det direkt: _"det ser ut som att den V13, den stora, håller på
att implementeras där V13, den lilla, ska vara."_ Han har rätt.

---

## Produktmodellen — Fazlis ord, i två steg

1. Man går in på **Kunder**. Kundvyn syns **inte alls**. Bara listan.
2. Man klickar på en kund → **den lilla V13** fälls upp i högerspalten.
   Den ger en sammanfattning.
3. Man klickar i den lilla → **den stora V13** öppnas, med bättre
   överblick och alla detaljer.

| Steg      | Fil                                     | Vad det är                    |
| --------- | --------------------------------------- | ----------------------------- |
| Lilla V13 | `V13-HOGERSPALT-2026-08-24.html`        | Kompakt spalt, sammanfattning |
| Stora V13 | `V13-WORKSPACE-CONTENT-2026-08-24.html` | Full arbetsyta, alla detaljer |

---

## Beviset, ur filerna

**HOGERSPALT — den lilla.** Toppnivån är en enda kolumn:

```html
<div class="shell" id="v13-rail"></div>
```

```css
.shell {
  width: 340px;
  flex: none;
  border-radius: 24px;
  padding: 0 12px 16px;
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
```

Jag räknade i filen:

| Klass        | Antal regler i HOGERSPALT |
| ------------ | ------------------------- |
| `.workspace` | **0**                     |
| `.main`      | **0**                     |
| `.rail`      | **0**                     |
| `.rail-card` | **0**                     |

Noll. Den lilla V13 har **inte** de klasserna. De är WORKSPACE-facits.

**WORKSPACE — den stora.** Toppnivån är ett tvåkolumnsraster:

```html
<div class="workspace">
  <!-- rad 1879 -->
  <main class="main">
    <!-- rad 1883 -->
    <aside class="rail"><!-- rad 2684 --></aside>
  </main>
</div>
```

**Facit säger det själv,** i HOGERSPALT-filens egen ingress:

> Kompakt rail-vy · **nuet + lite bakåt** · syskon till
> `V13-WORKSPACE-CONTENT-2026-08-24.html`. Sektions-IDn + ordning +
> chip-familj + stripe-borders är **identiska** med workspace-facit
> **så klick i railen kan öppna eller scrolla till motsvarande
> V12-sektion**. […] Bredd 340px, sticky höger, egen scroll-yta.

Där står hela mekaniken. Den lilla är "nuet + lite bakåt". Den stora är
hela relationen. Samma sektions-id i båda, så ett klick i den lilla kan
öppna rätt plats i den stora.

**Och sektionsordningen skiljer sig** — det är inte samma vy med olika
bredd:

```
Lilla:  s-hero  s-visit  s-warn  s-next  s-book  s-resa  s-visits-hist
        s-doc-latest  s-plan  s-dok  s-foto  s-journal  s-komm  s-eko
        s-uppf  s-hist  s-insights

Stora:  s-hero  s-visit  s-warn  s-resa  s-journal  s-foto  s-plan
        s-dok  s-komm  s-eko  s-uppf  s-hist
```

Den lilla lyfter varningar, nästa steg och bokningar högt — det brådskande
först. Den stora följer kundresans ordning. Två olika syften.

---

## Vad som byggts, och var det hamnade

`cco-v13-render.js` rad 256–259:

```js
var right = '<aside class="rail" …>' + … + '</aside>';
return (
  '<div class="v13-view" data-v13-canon="1">' +
  C.header(profile, patientId) +
  '<div class="workspace">' + main + right + …
```

Det är **WORKSPACE-strukturen**, och den renderas i högerspaltens plats.
Därav mätvärdena i ORD-108: `.workspace` fick 660 px, `.main` klämdes
till 276 och blev smalare än sin egen `.rail`.

Det var aldrig ett breddproblem. Det var fel vy på fel plats.

---

## Uppgift 1 — den lilla V13 i spalten

Bygg om `cco-v13-render.js` så den producerar HOGERSPALT-strukturen när
kortet renderas i spalten:

```html
<div class="shell" id="v13-rail">
  <div class="dhead" id="s-hero">…</div>
  <div class="active-visit" id="s-visit">…</div>
  <div class="sec" id="s-warn">…</div>
  …
</div>
```

Sjutton sektioner, i HOGERSPALTs ordning, inte WORKSPACEs.

Behåll `data-v13-canon` — `patient-master-ui.js` letar efter den.
Behåll `data-v9-section-link` och `data-v12-open-module` /
`data-v12-scroll-module` som facit sätter. **De attributen har redan
hanterare** — jag hittade dem i sex filer, bland annat
`patient-master-ui.js` rad 1521 och 2298. Du bygger alltså inte
klickmekaniken från noll.

Om bredden: facit säger 340 px, spalten är 660. Rendera i 100 % av
spalten och låt facitens inre mått gälla — skriv i leveransen vad som
ser tveksamt ut vid 660 så avgör Fazli. **Ändra inte
`--v11-rk-live-rail-width`.** Den är V11:s och delas.

---

## Gräns i facit — dokumentationsblocket ska aldrig portas

Båda facit-filerna inleds med ett block som **beskriver** facit. Rubrik,
ingress, chip-lista över sektionerna, och en ruta med "DIFF MOT …". Det
är anteckningar till den som läser filen. **Det är inte design och ska
aldrig följa med in i produkten.**

| Fil        | Block                        | Storlek      |
| ---------- | ---------------------------- | ------------ |
| HOGERSPALT | `<div class="context-note">` | 3 323 tecken |
| WORKSPACE  | `<div class="spec-note">`    | 3 121 tecken |

Klasser som lever **enbart** i de blocken — porta ingen av dem, bygg
ingen adapter för dem:

```
context-note   spec-note   crumbs   diff   diff-l   meta   toc
```

Det här är värt att säga rakt ut: i din gaptabell står `spec-note` som
en av två klasser som **"kräver ny adapter"**. Den kräver ingen adapter.
Den är en anteckning om att facit finns. Samma sak med `crumbs`, som jag
själv listade i ORD-107 som en av de 165 oporterade klasserna — också
fel av mig.

Designen börjar vid `#v13-rail` respektive `.workspace`. Allt före det i
`<body>` är kommentar.

---

## Uppgift 2 — dela stilmallen i två

`cco-v13.css` är idag en platt sammanslagning av två vyer under ett
scope. Det är därför `.sec` krockar med sig själv på rad 195 och 199.
Sammanslagningen var min instruktion och den var fel.

Dela upp:

| Fil                     | Scope                  | Källa                  |
| ----------------------- | ---------------------- | ---------------------- |
| `cco-v13-rail.css`      | `.v13-view-shell`      | HOGERSPALT-facit, hela |
| `cco-v13-workspace.css` | `.v13-workspace-shell` | WORKSPACE-facit, hela  |

Två scope, ingen krock, ingen sista-vinner. `.sec` betyder olika saker i
de två filerna och ska få göra det.

Verbatim, båda. HOGERSPALT har 91 klasser — i dagens `cco-v13.css`
saknas 71 av dem, bland annat `.sec-label` och `.count`. Det är därför
det står `Smart nästa steg0` i spalten just nu. Porta hela filen den här
gången.

---

## Uppgift 3 — den stora V13, som egen vy

**Bygg den inte än.** Utred och skriv.

Idag finns ingen helsidesvy för kundkortet. `data-v9-dossier-open`
växlar bara spaltens bredd (`patient-master-ui.js` rad 6333).

Svara på:

1. Hur öppnas den stora V13 från den lilla? Egen route, modal, eller ett
   läge som gömmer listan? Vad kostar var och en.
2. Vilket klick i den lilla öppnar den? Facit sätter
   `data-v12-scroll-module="s-hero"` på "Ändra profil" och
   `data-v12-open-module` på sektionerna — räcker de, eller behövs en
   egen "öppna fullvy"-knapp?
3. Ska den stora ärva `?v13=on` eller ha egen flagga?
4. Var får den 1 280 px ifrån utan att slå sönder `customers-layout`?

Ett dokument i `docs/handover/`. Fazli väljer.

---

## Vad som ändras i ORD-108

| Punkt                                   | Status                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fel 1 · huvudkolumnen smalare än railen | **Utgår.** Symptom på fel vy, inte breddfel. Vidga ingenting.                                                                                                                                    |
| Fel 2 · `.sec` krockar                  | **Kvar, ny lösning.** Två filer i stället för två selektorer.                                                                                                                                    |
| Fel 3 · 71 klasser saknas               | **Kvar, större.** Hela HOGERSPALT ska porteras nu.                                                                                                                                               |
| Fel 4 · hero bär `s1-*`                 | **Ändras.** Den lilla V13:s hero heter `.dhead` med `.avatar`, `.head-body`, `.kicker`, `.name`, `.contact`, `.tags`, `.head-badges` — inte `hero*` och inte `s1-*`. `hero*` hör till den stora. |

---

## Gränser

- Rör inte V11 eller V12. `?v13=off` ska ge
  `patient-master-card v11-rail`. Verifierat att den gör det idag.
- Rör inte `--v11-rk-live-rail-width`. Den är V11:s och V13 ärver den.
- Ingen CMO-kod. Inga hemligheter i repo. En gren. Svenska
  commit-meddelanden som förklarar _varför_.

## Verifiering

Efter uppgift 1 och 2, kör på ett öppet kundkort med `?v13=on`:

```js
({
  shell: !!document.querySelector('#v13-rail'), // ska vara true
  workspaceFinns: !!document.querySelector('.workspace'), // ska vara false i spalten
  labelDisplay: getComputedStyle(document.querySelector('.sec-label')).display, // flex
  labelJustify: getComputedStyle(document.querySelector('.sec-label'))
    .justifyContent, // space-between
  antalSektioner: document.querySelectorAll('#v13-rail [id^=s-]').length, // 17
});
```

Facit renderar fristående:

```
cd docs/facit/v13 && python3 -m http.server 8899
```

Du kan inte se bilder. Mät det mätbara, skriv vad du inte kunde
kontrollera, och lämna ögat till mig eller Fazli.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

De tre röda du rapporterade som förbefintliga (PR16/PR40 toast-embedded)
— namnge dem och visa med `git stash` att de var röda före
`cco-v13.css`. Det ska gå att kontrollera, inte tas på ditt ord.
