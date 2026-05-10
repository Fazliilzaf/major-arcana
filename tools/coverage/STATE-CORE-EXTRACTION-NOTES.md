# state-core.js extraktion — försök 1 (rullad tillbaka)

*2026-05-08*

## Vad som hände

Försökte extrahera ~919 rader (state-blocket från `__stateMutationStats`
till slutet av window-helper-deklarationerna) ur app.js till
`app/state-core.js`. Wrap som IIFE, exporterar via `window.__AppCore`.

JS-syntaxchecks passerade. Pre-commit OK. Coverage runner körde.

**REGRESSION**: styles.css coverage gick från **76.0% → 51.6%**. Det
betyder appen renderar bara hälften av de regler den brukade. Massiv
visuell regression.

## Snabb rollback

```bash
cp /tmp/app.js.before-state-core public/major-arcana-preview/app.js
rm public/major-arcana-preview/app/state-core.js
sed -i '' '/state-core\.js/d' public/major-arcana-preview/index.html
# Coverage tillbaka till 76% baseline
```

## Misstänkta orsaker

1. **Hoisting-skillnader i IIFE**: när blocket flyttas till en separat fil
   med egen IIFE, ändras hoisting-ordningen. Funktioner som tidigare
   hoistades till app.js IIFE:s top-of-scope hoistas nu bara till
   state-core.js IIFE-scope. Calls från app.js till funktioner som
   `renderMoreMenu`, `renderApp` kanske inte längre fungerar.

2. **Race-condition mellan moduler**: state-core.js IIFE kör vid
   `<script>`-load. App.js IIFE läser `window.__AppCore` vid sin egen load.
   Om något inom state-core.js kraschar tyst (innan window.__AppCore
   exponeras), kraschar app.js senare med "window.__AppCore saknas".

3. **Duplicate const-deklarationer** i state-core.js (header + originalblock
   båda hade `const __UI_KEY_PATHS = ...`). Fixades men kanske inte alla
   duplikat.

4. **__stateRefs.proxy = state**: assignment efter state-Proxy skapas.
   Om denna körs i fel ordning är __writeUiPath:s top-level writes
   trasiga.

5. **`window.__getStateStats` etc. exponeras INSIDE state-block** —
   maybe rörde dessa app.js's egna `window.__X`-bindings.

## Arbetsplan för försök 2

För att lyckas med Steg 2+3 behövs:

1. **Inkrementell extraktion**: extrahera EN sak åt gången, verify Coverage
   efter varje. Inte hela 919 rader på en gång.
2. **Body-content + IIFE wrapper-test**: skriv en minimal test som
   verifierar att den extraherade IIFE:n verkligen slutförs utan tysta
   fel (try/catch + console.log före och efter).
3. **Order-of-operations**: säkerställ att window.__AppCore-exponeringen
   sker EFTER alla deklarationer + state-Proxy är fully wired upp.
4. **Devtools-headed-test**: kör coverage-runner med `headless: false`
   så vi ser eventuella errors i Chrome devtools-konsolen.

## Vad som finns kvar på main

- `app/state-paths.js` (Steg 1) ✓ — fortsatt fungerande, 76% coverage
- Ingen `app/state-core.js` — extraktionen rullades tillbaka
- `tools/coverage/extract-state-core.py` — skriptet sparat för framtida
  iteration

## Lärdom

919 rader är för stor extraktion för en session utan dedikerad debug-tid.
Per APP-JS-MODULE-PLAN.md borde Steg 2+3 delas upp ytterligare:
- Steg 2a: bara view-Proxyerna (lite ~200 rader)
- Steg 2b: bara state-Proxy + scheduler (~150 rader)
- Steg 2c: bara renderApp + component-renderers (~150 rader)
- Steg 2d: bara `__stateInternal` (~550 rader pure data)

Varje med Coverage-verifiering mellan.
