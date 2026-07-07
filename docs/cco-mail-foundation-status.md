# CCO Mail Foundation Status

Senast uppdaterad: 2026-07-07

## Syfte

Det här dokumentet är den korta nulägesbilden för CCO:s mail foundation-spår.

Använd det här dokumentet när du snabbt behöver svar på:

- vad som redan är byggt
- vad som nu är huvudkedja
- vad som fortfarande är fallback
- vad som är nästa rimliga spår

För målbild och fasordning:

- [`cco-mail-foundation-gap-blueprint.md`](./cco-mail-foundation-gap-blueprint.md)

För rekommenderad arbetssekvens:

- [`cco-mail-foundation-working-sequence.md`](./cco-mail-foundation-working-sequence.md)

För riktad nästa teknisk plan för högre mailfidelity:

- [`cco-mail-mime-fidelity-plan.md`](./cco-mail-mime-fidelity-plan.md)

## Nuvarande läge

Mail foundation-spåret är inte längre bara planerat. Det är byggt i riktiga faser och därefter kopplat in i aktiv drift.

Kort sammanfattat:

- foundationen finns
- foundationen är inkopplad
- foundationen bär stora delar av read/open/send/settings-flödet
- legacy finns kvar som kontrollerad fallback, inte som tänkt huvudväg

### Aktuell CCO-inkorg / driftbaseline 2026-07-07

- aktiv produktionsyta för mailarbetet är `admin#cco`, den inbäddade `public/konversationer.html`
- målet är Mac Mail-modellen: hela klientmailet, inklusive loggor, bilder, signaturer och bilagor, ska finnas lokalt i CCO efter ingestion/backfill
- öppning av en tråd ska inte behöva live-fetch mot Graph
- inga live-send-flöden i CCO-inkorgen i detta spår
- ingen ny design eller palett i detta spår; UI-copy ska vara svensk
- auth-regeln är bearer-token, inte cookies
- prodmiljön är `arcana.hairtpclinic.com` på Render, 8 GB-instans, persistent disk `/var/data`

### OOM/502-serien, låst baseline efter #650

Bakgrund: full-body/full-thread-arbetet gav 4 GB-OOM och 502:or, särskilt runt kontaktformulär-trådar.

Stabiliseringsserien:

- #647 revertade full-body-lagring som gjorde ingestion-/runtime-state för tungt
- #648 stoppade en självmatande `.read`-audit-loop som orsakade en 429-storm
- #649 scopade per-thread messages-hämtning per mailbox-shard
- #650 är verifierat `MERGED` 2026-07-07 och gör de sista läsvägarna minnessnåla: `listRawMessages()` djup-klonar inte hela ingestion-storen, och health/mailboxes itererar per mailbox

Konsekvens för nya pass:

- utgå från efter-#650-baseline
- håll CCO-inkorgsarbete till små draft-PR:er, en i taget, med review före merge
- bevara befintlig funktion enligt preservation-regeln i `AGENTS.md`
- bygg vidare på lokal mail-lagring och minnessnåla read paths; återinför inte full-store-kloning eller live-fetch per öppning

### Konversationer source map för Cloud/Codex

Riktig produktionsyta:

- `https://arcana.hairtpclinic.com/admin#cco`
- `admin#cco` bäddar in `public/konversationer.html`; det är den enda riktiga CCO-ytan för Konversationer
- lokala `file:///tmp/.../public/konversationer.html`-ytor är inte sanning efter merge/deploy

Frontend-startpunkter:

- `public/konversationer.html` är konversationsdesignen: live inbox-lista, vald tråd, thread rendering, Svarstudio-context, mailbox-spår och full mail-rendering
- `public/konversationer-bottom-actions.js` äger bottenknappar, workbench-modaler, Svarstudio, makron, Smart anteckning, bokning, senare, notiser, skickat/kö, dossier, signaturer, Klar, Lägg senare och Återöppna

CCO-popup-vyer:

- `public/major-arcana-preview/cco-smart-anteckning-v3.html`
- `public/major-arcana-preview/cco-senare-v3.html`
- `public/major-arcana-preview/cco-skickat-v3.html`
- `public/major-arcana-preview/cco-notiser-v3.html`
- `public/major-arcana-preview/cco-signaturer-v3.html`
- `public/major-arcana-preview/cco-dokument-v1.html`
- `public/major-arcana-preview/cco-no-show-v3.html`
- `public/major-arcana-preview/cco-makron-v3.html`
- `public/major-arcana-preview/cco-booking-wizard-v3.html`

Backend/API-startpunkter:

- `src/routes/ccoConversation.js`
- `src/ops/ccoMailboxTruthWorklistReadModel.js`
- `src/ops/ccoMailboxTruthStore.js`
- `src/ops/ccoConversationStateStore.js`
- `src/ops/ccoConversationNotesStore.js`
- `src/ops/ccoMailboxAllowlist.js`
- `src/ops/ccoMailIngestion/`
- `src/intelligence/messageClassification.js`

Viktigaste API:er:

- `GET /api/v1/cco/runtime/worklist/consumer`
- `GET /api/v1/cco/runtime/conversation/:key/messages`
- `POST /api/v1/cco/runtime/conversation/:key/action`
- `POST /api/v1/cco/runtime/conversation/:key/reply`
- `GET /api/v1/cco/runtime/settings/info`

PR #622 är verifierat `MERGED` 2026-07-06 och låser fullt mail i trådvyn via HTML-kropp i sandboxad iframe. Det ändrade främst:

- `public/konversationer.html`
- `src/routes/ccoConversation.js`
- `tests/public/konversationerLiveInbox.test.js`
- `tests/ops/ccoConversationFullBody.test.js`

### Regression guard 2026-04-09

- en bred same-session screenshot-gate över fem konton och fyra mailfamiljer körs nu som återanvändbar regression-svit
- senaste verifierade arbetsset öppnade `8/8` fall med `Mail foundation`
- senaste verifierade arbetsset öppnade `0/8` fall via `Legacy fallback`
- det betyder att den tidigare fidelity-/thin-body-/raw-url-gruppen nu är låst med ett tydligare regressionsartefaktspår, inte bara ett enskilt lyckat pass

## Genomfört

### Phase 1

- `Canonical Mail Model`
- resultat:
  - canonical `mailDocument`

### Phase 2

- `Attachment and Inline Asset Layer`
- resultat:
  - canonical assetmodell
  - attachments
  - inline assets
  - asset registry
  - resolution contract

### Phase 3

- `Open Thread Hydrator`
- resultat:
  - canonical `threadDocument`
  - uppdelning i:
    - `primaryBody`
    - `quotedBlocks`
    - `signatureBlock`
    - `systemBlocks`

### Phase 4

- `Controlled Mail-Body Renderer`
- resultat:
  - öppnade mail renderas via document/mail-body-kontrakt
  - sektioner för body, signatur, system/provider och tidigare i tråden

### Phase 5

- `Compose / Send Foundation`
- resultat:
  - canonical `mailComposeDocument`
  - compose/reply på gemensam modell

### Phase 6

- `Mailbox and Operator Settings`
- resultat:
  - canonical `mailbox_settings_document`
  - serverbackade mailbox-/operator-defaults för sender/signatur/settings

## Integration efter foundation

Efter fasbygget gjordes också ett integrationsspår:

### Cutover

- `threadDocument` och `mailDocument` används som primär källa i större delar av open/read-kedjan
- compose/send läser canonical compose-model
- mailbox settings läser canonical settings-model

### Legacy reduction

- preview/readout-paths prioriterar foundation-first
- legacy fallback finns kvar, men är tillbaka i kompatibilitetsrollen

### Observability / cleanup

- tydligare provenance för:
  - `Mail foundation`
  - `Legacy fallback`
- mindre duplicerad preview-/fallbacklogik

### Smoke / startup stabilization

- `smoke:local` stabiliserad
- separat early-listen-pass gjort
- `healthz` kan komma upp tidigt
- `readyz` förblir ärlig tills appen verkligen är redo

## Vad som nu är huvudkedja

Det här är den avsedda standardvägen i nuläget:

### Inbound / open / focus

1. `threadDocument`
2. annars `mailDocument`
3. annars legacy fallback

### Compose / send

1. `mailComposeDocument`
2. legacy send-shims bara som kompatibilitetslager

### Mailbox defaults / settings

1. `mailbox_settings_document`
2. äldre UI-/fallback-data bara när canonical settings saknas

## Vad som fortfarande är fallback

Det här finns kvar med flit:

- äldre previewfält när canonical dokument ännu saknas
- kompatibilitetskedjor för tunna eller ofullständiga runtime-rader
- vissa äldre readout-/feed-fält som safety net

Det viktiga är att de här spåren inte längre ska betraktas som normalläge.

## Rekommenderade nästa spår

Det här är nu de mest rimliga fortsättningarna, i prioriterad ordning:

1. `Selective MIME-backed fidelity`

- foundationen är starkare nu, men vissa mailfamiljer tappar fortfarande innehållsfidelity
- nästa riktiga tekniska steg är att ge öppnade high-risk mail ett rikare source-spår via selektiv MIME-fetch
- se [`cco-mail-mime-fidelity-plan.md`](./cco-mail-mime-fidelity-plan.md)

2. `Performance / startup / heavy-state optimization`

- foundationen fungerar, men lokal boot kan fortfarande optimeras vidare på verklig ready-tid

3. `Attachment UX and richer asset handling`

- grunden finns, men mer synlig attachment-/asset-upplevelse kan byggas ovanpå foundationen

4. `Forward / drafts / richer compose flows`

- compose/send-foundationen finns, men inte alla högre lager runt den

5. `Selective legacy sunset`

- bara där vi tydligt ser att fallback inte längre behövs

## Beslutsregel

Om ett nytt större pass öppnas ska startpunkten vara:

- statusdokumentet för nuläge
- blueprinten för målbild och fasordning
- working sequence-dokumentet för arbetsordning

Det minskar risken att vi:

- öppnar fel spår
- blandar gammalt och nytt läge
- eller återgår till symptomfixar på fel nivå
