# CCO Next Migration Prep

## Scope
Det här dokumentet beskriver hur stagingytan i `public/major-arcana-preview/` kan lyftas över till `/cco-next` senare utan att vi byter skalet nu.

## Vad som är isolerat i första passet
Följande definitioner är nu flyttade till en egen stagingmodul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-config.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-config.js):

- queue lane-order och lane-labels
- pill-/bubble-ikoner
- actionmanifest för arbetskö, fokusyta och kundintelligens
- note-mode-presets
- labels för prioritet och synlighet
- workspace-defaults och minimigränser

Det här är medvetet den del av stagingkoden som är mest återanvändbar i ett framtida `/cco-next`-lyft och minst riskabel att modulera först.

## Vad som är isolerat i andra passet
Följande delade trådoperationer ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-thread-ops.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-thread-ops.js):

- `updateRuntimeThread`
- `patchStudioThreadAfterSend`
- `patchStudioThreadAfterReplyLater`
- `patchStudioThreadAfterHandled`
- `isHandledRuntimeThread`
- `suggestHandledOutcome`

Det här är stagingytans första riktiga state-/actionkärna som nu kan återanvändas utan att dra med hela renderlagret i `app.js`.

## Vad som är isolerat i tredje passet
Följande delade actionrouting ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-action-engine.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-action-engine.js):

- runtime-openers för `studio`, `anteckning` och `schemaläggning`
- shared quick action-dispatch för:
  - `studio`
  - `customer_history`
  - `history`
  - `delete`
  - `handled`
  - `later_feed`
  - `sent_feed`
  - `later`
  - `schedule`
  - `readout`

Det betyder att stagingytans delade navigation, overlay-entry points och snabbactions nu är separerade från själva DOM-wireupen i `app.js`.

## Vad som är isolerat i fjärde passet
Följande workspace source-of-truth ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-workspace-state.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-workspace-state.js):

- app-view
- aktiv fokussektion
- vald tråd
- aktiv lane
- valt mailboxscope
- vald ägare
- kontextens collapse-state
- konversationens history-expanded-state
- overlay-state för `studio`, `anteckning`, `anteckningsläge`, `schemaläggning`, `svara senare`, `mailbox admin`, `more menu`

I det här passet är målet inte att flytta all rendering, utan att ge stagingytan ett eget workspace-state-lager som kan spegla tillbaka till legacyfälten i `app.js` medan resten av renderlagret fortfarande bor där.

## Vad som är isolerat i femte passet
Följande renderlogik för fokusyta, kundhistorik och kundintelligens ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-focus-intel-renderers.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-focus-intel-renderers.js):

- `renderRuntimeFocusConversation`
- `renderFocusHistorySection`
- `renderFocusNotesSection`
- `renderRuntimeCustomerPanel`
- `renderRuntimeIntel`
- tillhörande intel-card-rendering och panel-builders

I det här passet flyttas renderlagret för mitten- och högerkolumnen ut ur `app.js`, men arbetsköns renderers och overlay-livscykler ligger fortfarande kvar där för att hålla snittet säkert.

## Vad som är isolerat i sjätte passet
Följande kö- och feed-rendering för vänsterkolumnen ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-queue-renderers.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-queue-renderers.js):

- arbetsköns renderers för:
  - trådkort
  - lane-state och counts
  - mailbox-/ägarmenyer
  - thread context chips
- queue history-rendering
- `Senare` / `Skickade`-feedrendering
- feed-metrics och tomtillstånd
- feed undo-state

I det här passet flyttas vänsterkolumnens rendererlager ut ur `app.js`, medan async laddning, selection-flow och overlay-livscykler fortfarande ligger kvar där för att hålla snittet stabilt.

## Vad som är isolerat i sjunde passet
Följande overlay-renderers och overlay-livscykler ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-overlay-renderers.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-overlay-renderers.js):

- `Svarstudio`
  - open/close
  - context collapse
  - mode-switching
  - render-shell och busy-state
- `Smart anteckning`
  - destinationsrendering
  - templateknappar
  - taggrendering
  - visibility/preset-hydrering
- `Schemalägg uppföljning`
  - draft-rendering
  - linked items
  - recommendation-hydrering
- `Svara senare`
  - options-rendering
  - open/close
  - label-hjälpare
- flytande hjälpskal:
  - `Anteckningsläge`
  - `Mailbox admin`

I det här passet flyttas overlay-lagret ut ur `app.js`, medan själva save/send/delete-mutationerna och async-orkestreringen fortfarande ligger kvar där för att hålla snittet säkert.

## Vad som är isolerat i åttonde passet
Följande async-orkestrering ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-async-orchestration.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-async-orchestration.js):

- workspace bootstrap
  - anteckningar
  - uppföljningar
  - workspace prefs
- workspace-preferenser
  - spara
  - återställ
  - debounce-schemaläggning
- `Smart anteckning`
  - visibility-validering
  - spara
  - reload
- `Schemalägg uppföljning`
  - konfliktvalidering
  - spara
  - runtime-patchning
  - reload
- `Svarstudio`
  - preview
  - spara utkast
  - skicka
  - senare
  - klar
  - radera
- fokusyta
  - historik-radering
  - runtime-delete/handled

I det här passet flyttas async-lagret ut ur `app.js`, medan live-runtime-laddning, domän-/mockdata och DOM-wireup fortfarande ligger kvar där för att hålla sista kompositionssnittet säkert.

## Vad som är isolerat i nionde passet
Följande sista staging-komposition ligger nu i en egen modul i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-dom-live-composition.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-dom-live-composition.js):

- live-runtime-loadern för CCO-workspace
- workspace selection/lane/history-expansion
  - `selectRuntimeThread`
  - `setActiveRuntimeLane`
  - `setConversationHistoryOpen`
- workspace-specifik DOM-wireup för:
  - arbetskö
  - fokusyta
  - kundintelligens-entry points
  - `Svarstudio`
  - `Smart anteckning`
  - `Schemalägg uppföljning`
  - `Svara senare`
  - `Mailbox admin`
- workspace-delegerade click-/keydown-flöden
- workspace-startup och live-bootstrap på startsidan

I det här passet blir `app.js` ett tunnare kompositionslager för själva stagingytan. Kvar där ligger nu främst icke-CCO-workspace-delar som showcase-/customer-/analytics-/automation-sidorna och den övergripande app-shellen.

## Delar som fortfarande lever i `app.js`
Följande ligger kvar i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js) efter sista staging-snittssteget:

- domän-/mockdata för kunder, analytics, automation, integrations, macros och settings
- app-shellens övergripande nav till vyer utanför CCO-workspace
- icke-workspace-specifik DOM-wireup för showcase-/customer-/analytics-/automation-ytor
- vissa hjälpfunktioner som hör till de ytorna och ännu inte är värda att modulera inför ett `/cco-next`-lyft

Det är avsiktligt. Själva CCO-workspacen är nu i praktiken modulär; det som återstår i `app.js` är främst annan staging-funktionalitet utanför målytan.

## Föreslagen lyftordning mot `/cco-next`
1. **Shell manifest**
   Flytta bubble-/lane-/workspace-manifestet 1:1.
2. **Thread state ops**
   Återanvänd den nu isolerade trådmutationsmotorn för `send`, `reply later`, `handled`, `delete`.
3. **Shared action engine**
   Bryt därefter ut delad actionrouting för `studio`, `history`, `later`, `handled`, `delete`, `schedule`, `note`.
4. **Workspace state**
   Isolera source-of-truth för vald tråd, lane, overlay state och readout state.
5. **Focus/intel renderers**
   Separera renderlogiken för fokusyta, kundintelligens och historik/kundhistorik från stagingens övriga nav.
6. **Queue layer**
   Flytta arbetskökort, lane-listor, queue history och Senare/Skickade-flöden efter att shared state och fokus/intel-renderers redan är isolerade.
7. **Overlay layer**
   Flytta `Svarstudio`, `Smart anteckning`, `Schemalägg uppföljning` och `Svara senare` sist, när action- och statekedjan redan är delad.
8. **Async orchestration**
   Flytta workspace bootstrap, overlay-save/send/delete och prefs-lagret när renderers och actions redan är modulära.
9. **DOM wireup / live runtime composition**
   Sista staging-snittssteget före faktisk adaptering: gör `app.js` till ett tunnare kompositionslager som kopplar modulerna till DOM, live-runtime och backendflöden.
10. **`/cco-next` adaptering**
   När du uttryckligen säger till: börja föra över den nu modulära workspaceytan till `/cco-next` additivt, utan att tappa befintliga fungerande funktioner.

## Source of truth som måste hållas intakt
När vi senare lyfter till `/cco-next` får vi inte dela upp följande i flera parallella sanningar:

- vald tråd
- arbetsköstatus och lane
- historikscope
- anteckningar
- uppföljningar
- studio mode
- reply-later / handled / delete

Om någon av dessa dupliceras mellan staging och `/cco-next` uppstår direkt risk för osynkade bubblor, döda actions och state leakage.

## Vad som kan flyttas 1:1 senare
- `runtime-config.js`
- `runtime-thread-ops.js`
- `runtime-action-engine.js`
- `runtime-workspace-state.js`
- `runtime-focus-intel-renderers.js`
- `runtime-queue-renderers.js`
- `runtime-overlay-renderers.js`
- `runtime-async-orchestration.js`
- `runtime-dom-live-composition.js`
- shell-tokens i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/styles.css`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/styles.css)
- bubble-rollernas ton- och storlekssystem
- overlay-shell-strukturen i [`/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/index.html`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/index.html)

## Single-track parity-stängning
Efter parity-auditen är arbetsregeln nu att nya CCO i `public/major-arcana-preview/` är enda aktiva spåret. Gammal `CCO-next` i `vendor/cconext-upstream/` används bara som read-only referens tills sista gapen är stängda.

Det första strukturella parity-gapet som stängts i nya shellen är att gamla `templates` och `workflows` inte längre kräver separata äldre routes:

- `view=templates` landar i `Automatisering > Mallar`
- `view=workflows` landar i `Automatisering > Byggare`

Det ger feature-parity utan att återinföra den gamla splittrade shell-strukturen.

## Vad som kräver adaptering
- DOM-targets som idag är staging-specifika
- navigationen till andra stagingvyer som inte finns i samma form i `/cco-next`
- eventuella mockdataflöden som ska ersättas av `/cco-next`-runtime

## Completion gate inför framtida `/cco-next`-lyft
Innan vi faktiskt byter skalet ska följande vara sant:

- stagingytan är coherent och klickbar end-to-end
- shared state är isolerad från renderlager
- bubble/actionmanifestet är modulärt
- inga kritiska flöden ligger kvar som staging-only sidospår
- `/cco-next` kan ta emot shell och actions additivt utan att tappa nuvarande fungerande funktioner
