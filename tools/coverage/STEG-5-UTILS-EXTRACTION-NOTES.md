# Steg 5 utils.js extraktion — försök 1 (rullad tillbaka)

*2026-05-08*

## Vad som hände

Försökte extrahera 8 pure utility-funktioner till `app/utils.js`:
- normalizeText, normalizeKey, slugifyMailboxId
- asArray, asText
- escapeHtml, createIdempotencyKey
- humanizeCode (67-rader stor mapping)

Replace med `const { ... } = window.__AppUtils;` på samma ställe i app.js
där originalen var (rad 2890+).

JS-syntax OK, pre-commit OK. **Coverage 76% → 51.6%** = visuell regression.

## Snabb rollback

```bash
git checkout -- public/major-arcana-preview/app.js public/major-arcana-preview/index.html
rm public/major-arcana-preview/app/utils.js
# Coverage tillbaka till 76% baseline
```

## Varför misslyckades det

**Hoisting-problem.** `function name() {}` declarations hoistas till TOP
av sin scope (IIFE). `const X = ...` declarations hoistas INTE — de
"finns" från sin position framåt.

Innan extraktion (allt är `function`):
```js
(() => {
  // function declarations hoistas till TOP — alla call sites har tillgång
  // till alla funktioner oavsett deklarationsordning.
  someFunctionUsingHumanizeCode();  // Works — humanizeCode hoisted
  function humanizeCode() { ... }   // declared lower in file
})();
```

Efter extraktion (humanizeCode är `const` från `window.__AppUtils`):
```js
(() => {
  someFunctionUsingHumanizeCode();  // ReferenceError? Maybe not — function decl hoisted
  const humanizeCode = window.__AppUtils.humanizeCode;  // declared lower
  function someFunctionUsingHumanizeCode() {
    return humanizeCode(...)  // ReferenceError when called BEFORE const init
  }
})();
```

I praktiken: vid IIFE-load körs alla `function`-deklarationer (hoistas)
men `const`-deklarationer initieras i ordning. Om någon `function`
körs i topp-IIFE-scope (t.ex. en `const X = createY()` på top-level)
INNAN `const humanizeCode = ...`-raden, kan den misslyckas.

App.js har många top-level `const X = createXxxRuntime()`-anrop som
kan hänvisa till humanizeCode indirekt.

## Lärdomar för framtida iterationer

1. **Pure-data-extraktion fungerar** (Steg 1: state-paths.js — pure data).
2. **Pure-leaf-funktion-extraktion fungerar** (Steg 4: render-components —
   funktioner kallas BARA via renderApp som kallas via scheduleRender,
   alltså långt efter IIFE-bootstrap).
3. **Utility-funktion-extraktion misslyckas** om utilities används i
   top-level IIFE-bootstrap-flow (som humanizeCode/asText/escapeHtml).

## Strategier för försök 2

a) **Behåll lokala kopior av utilities i app.js** men ALSO exponera dem
   som window.__AppUtils. Dvs duplicera istället för flytta. Andra moduler
   kan importera via window.__AppUtils. App.js använder sina egna lokala
   originals. **Net win:** 0 LOC bort, men andra moduler kan återanvända.

b) **Wrappa hela app.js IIFE i en async-bootstrap** som väntar på alla
   moduler innan top-level kod körs. Komplext, kräver bigger refactor.

c) **Definiera utilities innan ALL annan kod i IIFE** med `var` (function-
   hoisted som functions, inte const). Sen ersätt declarations med
   `var X = window.__AppUtils.X` på TOP av IIFE. var-deklarationer
   hoistas till top of scope (initieras till undefined), så top-level
   bootstrap-kod skulle få undefined för utilities → kraschar.

Inget av alternativen är trivialt. **Pragmatisk slutsats:** utility-
funktioner som används bredt i app.js IIFE bör STANNA där de är.
Modulrefactor levererar bäst värde för leaf-funktioner som körs efter
bootstrap (renderers, event-handlers).

## Status efter rollback

- Steg 1 (state-paths.js): ✅ live
- Steg 4 (render-components.js): ✅ live
- Steg 5 (utils.js): ❌ rullad tillbaka

App.js är ~26945 rader. Inga utilities flyttade — humanizeCode och
asText/asArray/etc. lever vidare i app.js där de hoistas korrekt.

---

## 2026-05-10 — formell DEFERRAL av Steg 2/3/5

Efter tre rollback (försök 1, försök 2, samt Steg 2+3-försök i #58)
markeras modulrefactor av app.js-monoliten som **DEFERRED tills annan
strategi finns**.

### Varför vi stannar

1. **Tre olika försök, samma rotorsak:** hoisting-asymmetri mellan
   `function`-deklarationer (hoistas) och `const = window.__X.Y`
   (initieras i ordning). Top-level IIFE-bootstrap-kod refererar
   till utilities innan const-init.
2. **Coverage-regression:** 76% → 51.6% efter försök 1. Mätbart
   visuellt fel utan klar diagnostik per regel.
3. **Kostnad/nytta:** app.js är 21k+ rader men FUNGERAR. Modulrefactor
   är arkitekturell skuld, inte funktionell skuld. Ingen användare
   ser den. Skadan att försöka och misslyckas är högre än värdet.

### Vad som krävs för att fortsätta

**Inte fler manuella attempts.** Behöver fundamentalt ny tooling:

a) **esbuild/rollup-pipeline** — bundla moduler till EN fil i build-tid.
   IIFE-scope bevaras, hoisting fungerar som monolit. Kostnad: introducera
   build-step (idag är det rena statiska filer som serveras direkt).

b) **AST-transform** — använd babel/jscodeshift att automatiskt
   identifiera dependency-graf och flytta utilities till en initial
   "utils-block" överst i IIFE som körs FÖRE alla `const X = createY()`.
   Kostnad: skriva transformer + verifiera per body-state.

c) **Stegvis micro-extraktion av leaf-funktioner** — bara funktioner
   som BEVISLIGT körs efter bootstrap (event-handlers, click-handlers).
   Coverage-runner mäter exakt vilka funktioner som triggas i bootstrap-
   tid vs senare. Risk: små batchar (5-10 funktioner) ger lite värde
   per insats.

### Rekommendation

**Prioritera inte modulrefactor utan bundler.** App.js fungerar. Ny
features bygger vi i `app/`-mappen som separata moduler. När en bundler
introduceras (för bundle-size-optimering, treeshaking osv), då kan vi
parallellt göra en stor extraktion med esbuild som validerar.

### Mätbart värde av att låta vara

- Inga rollback-cyklar (~2h per försök)
- Ingen risk för coverage-regression
- Ingen blockering av feature-utveckling
- Klar exit-kriterie dokumenterad ovan

---

## 2026-05-10 (samma dag) — concat-bundler installerad, hoisting-problem KVARSTÅR

Bundler-pipeline installerad (commit 504557d/6304e6b):
- bin/build-bundle.js + bin/inject-bundle.js
- 53 → 14 HTTP-requests (-74%)
- 2.4 MB → 1.37 MB minified (-43.7%)
- esbuild --minify (INTE --bundle)

**MEN:** denna concat-bundler löser inte modulrefactor-problemet.
Den konkatenerar IIFE-filer i ordning — varje fil är fortfarande sin
egen scope. Hoisting inom app.js-IIFE är oförändrat.

För riktig modulrefactor krävs fortfarande:
1. Konvertera app.js till ESM (`import { humanizeCode } from './utils.js'`)
2. Använda `esbuild --bundle` (inte bara `--minify`) som löser ESM imports
3. Risk: 27k-rader app.js har många `function`-deklarationer som inte
   hoistas korrekt om de wrappas som ESM-export. Behöver AST-transform
   eller manuell konvertering med smoke-test per batch.

Concat-bundlern är ett **förkrav** för modulrefactor (vi har nu en
build-step), men inte en **lösning**. Modulrefactor-task förblir
deferred tills vidare med samma exit-kriterier.
