# Mock-API empiriska fynd

*2026-05-08, verify-mock-api.js körd mot lokal preview*

## Vad testet visar

```
Mock-API anrop interceptade: 4
  - aktiveringsmeddelande
  - /api/v1/cco/runtime/status        → 200 {ok:true,items:[],rows:[]}
  - /api/v1/cco/runtime/history       → 200 {ok:true,items:[],rows:[]}
  - /api/v1/cco/runtime/history/search → 200 {ok:true,items:[],rows:[]}

Efter bootstrap:
  state.runtime.authRequired: null   (= aldrig satt — mock-API funkar)
  state.runtime.threads.length: 0    (!)
  cards i DOM: 1
  cards med data-v8-version="warm-r8": 1   (= FIX14:s injection)
```

## Slutsats

**Mock-API kompletterar FIX14, ersätter inte.**

- ✅ Mock-API förhindrar `auth_required`-state (genom att returnera 200 istället för 401)
- ❌ Mock-API gör INTE FIX14 redundant — state.runtime.threads förblir
  tomt eftersom catch-all returnerar `{rows:[]}`, så renderern har inget
  att rendera, så FIX14 fyller tomrummet

## Vad som krävs för att eliminera FIX14

Mock-API:t måste returnera demo-data **formatterad i exakt wire-format**
som riktig worklist API. Det kräver:

1. Reverse-engineering av den riktiga API:ts response-shape
2. Bygga en payload som inkluderar alla fält app.js förväntar sig
3. Testa att state.runtime.threads populeras korrekt
4. Testa att lane-routing, owner-detection, sentiment-flagging fungerar

Det är 4-6h dedikerat arbete med risk för subtila format-fel.

## Värde av mock-API som det är

Trots att FIX14 inte tas bort:
- Mock-API förhindrar `[error] 401 Unauthorized`-spam i devtools-konsolen
- Mock-API förhindrar `state.runtime.authRequired = true` så att UI inte
  visar "Session krävs"-banners
- Mock-API ger en grund att bygga vidare på i framtida iteration

## Rekommendation

Behåll mock-worklist-api.js + behåll FIX12+14 som de är. När någon vill
eliminera FIX14 helt:

1. Inspektera nätverks-tab i prod-browser (med inloggad token) för att se
   verklig worklist response-shape
2. Uppdatera mock-worklist-api.js att returnera demo-fixtures i samma shape
3. Kör verify-mock-api.js för att bekräfta state.runtime.threads.length === 6
4. Ta bort FIX14 från demo-fixture
5. Testa att demo-kort fortsatt klickas/öppnas korrekt

Tills dess: mock-API + FIX14 lever sida vid sida. Båda fungerar.
