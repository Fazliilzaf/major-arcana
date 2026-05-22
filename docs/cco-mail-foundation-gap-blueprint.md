# CCO Mail Foundation Gap Blueprint

Senast uppdaterad: 2026-04-08

## Relaterade dokument
- Status och nuläge: [`cco-mail-foundation-status.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-foundation-status.md)
- Rekommenderad arbetssekvens: [`cco-mail-foundation-working-sequence.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-foundation-working-sequence.md)
- MIME-backed fidelity-plan: [`cco-mail-mime-fidelity-plan.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-mime-fidelity-plan.md)

## Syfte
Det här dokumentet beskriver vad CCO behöver för att få en fungerande mail foundation.

Utgångspunkten är:
- Mac Mail används som benchmark för vad en fungerande mailklient faktiskt klarar
- CCO ska inte bli en full ersättare för Mac Mail
- CCO behöver ändå en tillräckligt riktig mail foundation för att:
  - läsa riktiga mail utan att förstöra body/signatur/logo/ursprung
  - öppna trådar konsekvent
  - skriva och skicka mail med rätt identitet
  - fungera operativt över flera mailboxar och flera mailfamiljer

Det här är alltså inte ett designpapper.
Det är ett beslutsunderlag för vilken grund som saknas under dagens CCO-yta.

## Kort slutsats
Mac Mail fungerar inte för att den har en snygg renderer.
Den fungerar för att den äger hela mailobjektet:
- konto
- mailbox
- message model
- MIME/body
- attachments
- inline assets
- threading
- quoted content
- signatures
- compose/send

CCO har idag:
- Graph read/send
- mailbox truth
- history store
- worklist/focus/studio
- signaturprofiler
- kontrollerad HTML-rendering

CCO saknar fortfarande en full mail foundation mellan Graph och fokusytan.

Den viktigaste slutsatsen är därför:
- dagens problem är inte längre främst "små renderbuggar"
- dagens problem är att CCO ännu inte har en tillräckligt komplett canonical mail model

## Nuvarande status
Det här dokumentet beskriver målbild, gap och fasordning. Aktuell status för genomförandet finns i det separata statusdokumentet, men det viktiga nuläget är:

- `Phase 1–6` är genomförda som riktiga foundation-pass
- canonical objekt för mail, assets, tråd, compose/send och mailbox settings finns i aktiv kedja
- cutover, legacy reduction och observability-pass är genomförda
- `smoke:local` är stabiliserad och ett separat early-listen-pass för startup är gjort
- foundationen är nu huvudkedja i stora delar av read/open/send/settings-flödet, medan legacy ligger kvar som kontrollerad fallback

## Målbild
CCO ska fungera som ett operativt mailsegment, inte som en fri mailklient.

Det betyder att CCO måste kunna:
- öppna riktiga mail som riktiga mail
- bevara identitet, signatur, ursprung och rimlig bodystruktur
- visa inline-bilder och centrala attachments när de bär förståelse
- hålla quoted/history-brus nere
- svara och skicka från rätt mailbox med rätt signatur
- hålla ihop tråd och historik utan att tappa fidelity

CCO behöver inte:
- bli en full allmän mailapp
- exponera all låg-nivå-funktion i UI
- återge exakt all HTML som Mac Mail

## Benchmark: Vad Mac Mail har
På systemnivå har Mac Mail i praktiken dessa lager:

1. Konto- och mailboxlager
- flera konton
- mailbox-specifika inställningar
- regler
- signatures
- compose-beteende per konto

2. Full message model
- headers
- body
- HTML/plain-alternativ
- MIME-delar
- attachments
- inline assets
- quoted replies/forwards

3. Attachment- och assetmodell
- inline-bilder kan visas in-place
- vanliga bilagor kan öppnas/sparas
- `cid:` och andra inbäddade resurser hör ihop med samma meddelandeobjekt

4. Threading / conversation model
- trådar öppnas som riktiga trådar
- quoted svar och tidigare meddelanden hanteras som del av samma mailmodell

5. Compose/send model
- nytt mail
- svar
- vidarebefordran
- signaturplacering
- rätt avsändaridentitet

6. Mail renderer
- riktiga mail visas som mail
- HTML, struktur, footer och identitet får plats i rätt container

## Nuläge: Vad CCO har idag
Repo-grundad nulägesbild:

### Read / ingest
- [`microsoftGraphReadConnector.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphReadConnector.js)
- hämtar Graph-meddelanden med:
  - `body`
  - `bodyPreview`
  - `internetMessageHeaders`
  - `hasAttachments`
  - recipients, sender, dates, `conversationId`
- gör viss `cid:`-reparation genom att läsa `/attachments` och ersätta inline-bilder med `data:`-URL:er

### Truth / history
- [`ccoMailboxTruthReadAdapter.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoMailboxTruthReadAdapter.js)
- [`ccoHistoryStore.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js)
- CCO har två historikspår:
  - mailbox truth
  - legacy history store
- båda bär idag delar av mailmodellen men inte en full canonical message model

### Runtime / API
- [`capabilities.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/routes/capabilities.js)
- runtime history, search, backfill och worklist exponerar mail till UI
- truth-spåret kan nu leverera `bodyHtml`, men UI:t får fortfarande en redan tolkad version av mailobjektet

### Focus render
- [`app.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js)
- [`runtime-focus-intel-renderers.js`](/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/runtime-focus-intel-renderers.js)
- fokusytan har nu kontrollerad rich HTML och `mail-body mode`
- men renderaren sitter fortfarande ovanpå en begränsad message model

### Compose / send
- [`executionService.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/capabilities/executionService.js)
- [`microsoftGraphSendConnector.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphSendConnector.js)
- CCO kan:
  - skicka nytt mail
  - skicka reply
  - lägga på signatur-HTML
- CCO saknar fortfarande en full outbound mail model, särskilt för attachments och robust quote-placement

## Gap-matris
| Område | Mac Mail har | CCO har idag | Saknas i CCO | Konsekvens | Prioritet |
|---|---|---|---|---|---|
| Konto/mailbox | Full konto- och mailboxmodell | Mailboxscope + writing identities + signaturprofiler | Riktigt mailboxlager med settings och capability contracts | Ojämt beteende mellan mailboxar | Must-have |
| Message model | Full message/MIME-modell | Graph message + truth/history-normalisering | Canonical mail model som bevarar allt viktigt | Fidelity tappas mellan ingest och fokusyta | Must-have |
| HTML/body | Full mailbody | `bodyHtml` + sanitizer + renderer | Stabil body source selection och tydlig body-depth policy | Vissa mail blir tunna eller ojämna | Must-have |
| Inline assets | Inline attachments som förstaklassobjekt | Delvis `cid:`-reparation | Full asset layer för inline-bilder/loggor/vanliga bilagor | Logo/signatur fidelity blir ojämn | Must-have |
| Attachments | Öppna/spara/visa | `hasAttachments` + begränsad inline-fetch | Attachment registry + download/open metadata | Bilagor är inte en riktig del av mailupplevelsen | Must-have |
| Threading | Robust conversation model | `conversationId` + heuristik + history join | Canonical thread hydrator | Trådar kan kännas tunna eller feltolkade | Must-have |
| Reply/quoted content | Naturlig del av mailvisningen | Heuristik för quoted/signature/body | Förstaklassig separation: body vs quoted vs footer | Reply-heavy mail blir ojämna | Must-have |
| Renderer | Riktig mailyta | Kontrollerad CCO-rendering | Mail-body mode som jobbar mot en bättre canonical model | Containerproblem minskar men datagap kvarstår | Must-have |
| Compose/send | Full compose/send | New + reply + signatur-HTML | Attachments, forward, bättre compose model | Outbound fungerar men är inte komplett | Must-have |
| Regler/extensions | Full klientfunktion | Begränsad operativ automation | Inte grundkrav för första foundation-fasen | Påverkar inte kärnfunktion först | Later |

## Root causes på generell nivå
De viktigaste generella root causes vi har sett hittills är:

1. Fel containerkontrakt
- öppnade riktiga mail trycktes länge in i bubble-liknande kontrakt
- det gav fel layout även när rätt innehåll fanns

2. För tunn canonical message model
- CCO bygger idag på flera delkällor:
  - Graph
  - truth store
  - history store
  - UI-feed entries
- resultatet blir att fokusytan ofta renderar ett tolkats/stympat objekt i stället för ett komplett mailobjekt

3. Asset-/attachment-gap
- inline assets och attachments är inte modellade som förstaklassiga mailresurser i hela kedjan
- `cid:` går nu bättre i vissa fall, men det är fortfarande inte ett fullständigt assetlager

4. Body source selection-gap
- olika typer av mail landar i olika fidelity beroende på vilken bodykälla som råkar vinna:
  - `bodyPreview`
  - normaliserad text
  - truth `bodyHtml`
  - history `bodyHtml`

5. Compose/send-model-gap
- outbound fungerar, men är fortfarande mer "skicka HTML" än "riktig mailkomposition"

## Must-have vs Later

### Must-have
Det här krävs för att CCO ska ha en fungerande mail foundation:

1. Canonical mail model
- ett gemensamt format för öppnade mail
- ska bära:
  - headers
  - sender/recipients
  - subject
  - primary body text
  - primary body HTML
  - quoted blocks
  - signature/footer blocks
  - attachment metadata
  - inline asset references

2. Attachment / asset layer
- inline assets
- vanliga attachments
- säkra URL:er eller blob/data-representation
- metadata för render/open/download

3. Thread hydrator för öppnad tråd
- ska välja rikaste och mest korrekta källan för fokusytan
- ska bygga samma sorts objekt oavsett mailbox och mailtyp

4. Controlled mail-body renderer
- dokumentyta som grundläge
- kontrollerad sanitizer
- separata regler för:
  - primary body
  - quoted content
  - footer/signature
  - system boilerplate

5. Outbound foundation
- reply/new mail med rätt identitet och signatur
- grund för attachments senare i samma modell

### Later
Det här är viktigt men behöver inte byggas först:

1. Full forward-stöd
2. Rich attachment actions i UI
3. Mailboxspecifika rules/preferences i UI
4. Mer avancerad compose-layout
5. Full parity med traditionell mailklient

## Prioriterad fasordning

### Phase 1: Canonical Mail Model
Bygg ett enda canonical format för öppnat mail.

Det här är viktigast eftersom nästan alla nuvarande problem uppstår när CCO:
- läser från flera källor
- normaliserar olika
- och sedan skickar ett ofullständigt objekt till renderaren

Leverabler:
- gemensamt `mailDocument`-objekt
- tydlig body source policy
- tydlig metadata policy
- en enda väg från runtime history/truth till fokusytan

### Phase 2: Attachment and Inline Asset Layer
Bygg en förstaklassig modell för:
- inline images/logos
- attachments
- asset references

Leverabler:
- attachment registry per message
- inline asset resolution contract
- asset-safe rendering contract

### Phase 3: Open Thread Hydrator
Bygg en dedikerad hydrator för öppnad tråd/mail.

Den ska:
- välja rätt meddelanden
- välja rätt bodykälla
- märka upp:
  - primary body
  - quoted content
  - footer/signature
  - system boilerplate

### Phase 4: Controlled Mail-Body Renderer
Bygg renderaren ovanpå `mailDocument`, inte ovanpå feed-preview-logik.

Den ska:
- använda mail-body mode som standard
- ge konsekvent presentation över mailfamiljer
- fortfarande hålla rå mailklientkänsla nere

### Phase 5: Compose/Send Foundation
Bygg vidare outbound så att den använder samma foundation:
- compose object
- sender identity
- signature block
- senare attachments/forward

### Phase 6: Mailbox and Operator Settings
När foundationen finns:
- mailbox-specifika settings
- attachment policies
- signature policies
- operatörsinställningar

## Rekommenderat första konkreta byggpass
Det första riktiga byggpasset ska vara:

### `Mail Foundation Phase 1: Canonical Mail Document`

Det passet ska göra exakt detta:

1. Införa ett nytt canonical objekt för öppnat mail
- föreslaget namn:
  - `mailDocument`

2. Låta `mailDocument` bära:
- `messageId`
- `conversationId`
- `mailboxId`
- `subject`
- `from`
- `to`
- `cc`
- `replyTo`
- `sentAt`
- `direction`
- `primaryBodyText`
- `primaryBodyHtml`
- `quotedBlocks`
- `signatureBlock`
- `systemBlocks`
- `attachments`
- `inlineAssets`
- `source`

3. Bygga objektet i ett enda backendspår
- sannolik huvudyta:
  - [`/Users/fazlikrasniqi/Desktop/Arcana/src/routes/capabilities.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/routes/capabilities.js)
  - [`/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoMailboxTruthReadAdapter.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoMailboxTruthReadAdapter.js)
  - [`/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js)
  - eventuellt [`/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphReadConnector.js`](/Users/fazlikrasniqi/Desktop/Arcana/src/infra/microsoftGraphReadConnector.js)

4. Ändra fokusytan så att den öppnar `mailDocument`
- inte en blandning av preview/feed/history-fält

5. Inte bygga full attachment-UI ännu
- bara se till att foundationen bär attachment/inline-asset metadata för nästa fas

### Varför börja här
Om vi börjar med renderer igen kommer vi fortsätta polera symptom.
Om vi börjar med `mailDocument` bygger vi den grund som:
- signaturfidelity
- body fidelity
- logo fidelity
- thread fidelity
- outbound parity
alla kan vila på.

## Rekommenderad gräns för detta arbete
För att inte göra detta till ett oändligt omtag ska vi hålla denna gräns:

### Ingår i mail foundation
- läsa rätt mail
- förstå rätt mail
- öppna rätt mail
- visa rätt mail
- svara/skicka från rätt identitet

### Ingår inte i första foundationvågen
- full allmän mailklient
- avancerade mailboxregler i UI
- full parity med Apple Mail
- every-last-pixel HTML fidelity

## Beslutsrekommendation
Nästa större byggspår bör vara:

1. `Phase 1: Canonical Mail Document`
2. `Phase 2: Attachment and Inline Asset Layer`
3. `Phase 3: Open Thread Hydrator`

Det här är den minsta riktiga vägen till att få en fungerande mail foundation i CCO.

Om vi hoppar över det och fortsätter med enbart renderfixar kommer vi sannolikt fortsätta få:
- ojämn body fidelity
- trasig signatur/logo fidelity
- specialfall per mailfamilj
- regressrisk mellan mailboxar

## Kort beslutssats
CCO behöver inte bli Mac Mail.
Men CCO behöver sluta bygga mailvisningen på previewlogik och börja bygga den på en riktig mail foundation.

Första konkreta byggpasset ska därför vara:
- **Canonical Mail Document**

Det är den tydligaste och viktigaste must-have-grunden för allt som fortfarande känns skört i dagens mailsegment.
