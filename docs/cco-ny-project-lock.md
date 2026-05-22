# CCO-Ny Project Lock

Senast uppdaterad: 2026-03-29

## Projekt
- Namn: `CCO-Ny`
- Bas: nya CCO-ytan i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview)
- Status: intern alpha-staging med live mailbox-stöd för `kons@hairtpclinic.com`

## Snabbstart
- Offline preview: [http://localhost:3100/major-arcana-preview/](http://localhost:3100/major-arcana-preview/)
- Live preview: [http://localhost:3200/major-arcana-preview/](http://localhost:3200/major-arcana-preview/)
- Primär mailbox just nu: `kons@hairtpclinic.com`
- Lokal upstream-arkivkopia: [`/Users/fazlikrasniqi/Desktop/Arcana-archive/cconext-upstream-20260329`](/Users/fazlikrasniqi/Desktop/Arcana-archive/cconext-upstream-20260329)

## Låsta beslut
- `/cco-next` ska inte bytas ut ännu.
- `/cco` ska lämnas orörd.
- Nya CCO byggs additivt i `major-arcana-preview` tills ytan är helt stabil.
- `Historik` är en delad entry point mellan arbetskö, fokusyta och kundintelligens.
- `Nytt mejl` ska använda `Svarstudio` i compose-läge, inte ett separat compose-system.
- Topbaren har global compose-entry.
- Fokusytan har kontextuell compose-entry: `Nytt mejl till kunden`.

## Det som är färdigt
- Trekolumnsytan fungerar i staging:
  - `ARBETSKÖ`
  - `FOKUSYTA`
  - `KUNDINTELLIGENS`
- Actionbubblor är tillbaka och renderas i alla tre kolumnerna.
- `Svarstudio`, `Smart anteckning`, `Schemalägg uppföljning` och `Svara senare` finns i fungerande staging-flöde.
- `Klar`, `Radera` och `Senare` är genomgångna i live operator sweep.
- `Historik` och `Kundhistorik` är separerade semantiskt.
- `kons@hairtpclinic.com` är backfillad i live-läget och används som första riktiga mailbox.
- `Nytt mejl` i topbaren öppnar compose-läge i `Svarstudio`.
- `Nytt mejl till kunden` finns i fokusytan och öppnar samma compose-läge med kundkontext.

## Viktiga filer
- UI shell och runtime:
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/index.html](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/index.html)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/styles.css](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/styles.css)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-config.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-config.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-action-engine.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-action-engine.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-dom-live-composition.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-dom-live-composition.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-overlay-renderers.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-overlay-renderers.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-async-orchestration.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-async-orchestration.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-queue-renderers.js](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-queue-renderers.js)

- Backend och live-stöd:
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/capabilities/executionService.js](/Users/fazlikrasniqi/Desktop/Arcana/src/capabilities/executionService.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphReadConnector.js](/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphReadConnector.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphSendConnector.js](/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphSendConnector.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/routes/capabilities.js](/Users/fazlikrasniqi/Desktop/Arcana/src/routes/capabilities.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoWorkspace.js](/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoWorkspace.js)

- Stores:
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoNoteStore.js](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoNoteStore.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoFollowUpStore.js](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoFollowUpStore.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js)
  - [/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoWorkspacePrefsStore.js](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoWorkspacePrefsStore.js)

## Hur man återupptar snabbt
1. Starta offline:
   - `npm run dev:offline`
2. Starta live:
   - `PORT=3200 npm run cco:live`
3. Gå till:
   - offline: `http://localhost:3100/major-arcana-preview/`
   - live: `http://localhost:3200/major-arcana-preview/`
4. Verifiera först:
   - arbetskö syns
   - fokusyta syns
   - kundintelligens syns
   - `Nytt mejl` finns i topbaren
   - `Nytt mejl till kunden` finns i fokusytan

## Valideringskommandon
- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

## Nästa rekommenderade steg
- Fortsätt arbeta operativt i `Kons` live och ta nästa konkreta friktion direkt från verklig användning.
- När `Kons` känns stabil i vardagsanvändning: ta in nästa mailbox på samma sätt.
- Först därefter: fortsätt med `migration prep pass 2` mot `/cco-next`, fortfarande utan att byta skalet.

## Viktigt att inte tappa
- Compose ska fortsätta använda samma `Svarstudio`.
- Actionbubblor ska finnas i alla tre kolumnerna.
- Historikchips i vänster inline-historik ska ligga inne i korten.
- Bubble-roller får justeras visuellt, men inte byggas om semantiskt utan uttryckligt beslut.
- `vendor/cconext-upstream` har flyttats ur arbetsrepot till lokal arkivmapp på Mac Studio för att minska repo-belastning. Hämta tillbaka därifrån vid behov, inte från minnet eller chatten.
