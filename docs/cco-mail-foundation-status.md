# CCO Mail Foundation Status

Senast uppdaterad: 2026-04-09

## Syfte
Det här dokumentet är den korta nulägesbilden för CCO:s mail foundation-spår.

Använd det här dokumentet när du snabbt behöver svar på:
- vad som redan är byggt
- vad som nu är huvudkedja
- vad som fortfarande är fallback
- vad som är nästa rimliga spår

För målbild och fasordning:
- [`cco-mail-foundation-gap-blueprint.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-foundation-gap-blueprint.md)

För rekommenderad arbetssekvens:
- [`cco-mail-foundation-working-sequence.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-foundation-working-sequence.md)

För riktad nästa teknisk plan för högre mailfidelity:
- [`cco-mail-mime-fidelity-plan.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-mime-fidelity-plan.md)

## Nuvarande läge
Mail foundation-spåret är inte längre bara planerat. Det är byggt i riktiga faser och därefter kopplat in i aktiv drift.

Kort sammanfattat:
- foundationen finns
- foundationen är inkopplad
- foundationen bär stora delar av read/open/send/settings-flödet
- legacy finns kvar som kontrollerad fallback, inte som tänkt huvudväg

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
- se [`cco-mail-mime-fidelity-plan.md`](/Users/fazlikrasniqi/Desktop/Arcana/docs/cco-mail-mime-fidelity-plan.md)

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
