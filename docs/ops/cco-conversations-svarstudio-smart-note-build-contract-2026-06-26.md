# CCO Konversationer - Svarstudio + Smart anteckning build contract

Datum: 2026-06-26

Syfte: detta är byggunderlaget för Cloud Code. Det beskriver de två pre-V12-funktionerna som ska återskapas/implementeras i CCO Konversationer:

1. Svarstudio - arbetsyta för att svara kund i en konversation.
2. Smart anteckning - arbetsyta bredvid Svarstudio för att fånga, strukturera och spara relevant intern notering från tråden.

Viktigt: detta gäller konversationsflödet. Använd inte kundkortets anteckningsblock som facit.

## Visuellt facit

### Svarstudio

- `/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-svarstudio/pre-v12-implemented-svarstudio-overlay.png`
- `/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-svarstudio/pre-v12-implemented-svarstudio-shell-only.png`

### Smart anteckning

- Triggern i Svarstudio:
  `/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-smart-anteckning/pre-v12-smart-anteckning-button-highlighted-in-svarstudio.png`
- Lägesväljare:
  `/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-smart-anteckning/pre-v12-smart-anteckning-mode-picker.png`
- Arbetsyta:
  `/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-smart-anteckning/pre-v12-smart-anteckning-shell.png`

## Pre-V12 källa

Arkiverad implementation:

`/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/major-arcana/major-arcana-test/public/major-arcana-preview/index.html`

Viktiga ankare:

- `data-quick-action="studio"` runt rad 935: öppnar Svarstudio från konversation.
- `#studio-shell` runt rad 8587: Svarstudio-arbetsytan.
- `data-note-open` / `aria-label="Öppna smart anteckning"` runt rad 9165: Smart anteckning-knappen i Svarstudio.
- `#note-mode-shell` runt rad 8144: Smart anteckning-lägesväljare.
- `#note-shell` runt rad 9536: Smart anteckning-arbetsytan.

Nuvarande relevant repo-kod:

- `/Users/fazlikrasniqi/Code/major-arcana/src/routes/ccoCommDraft.js`
- `/Users/fazlikrasniqi/Code/major-arcana/src/ops/ccoCommDraftStore.js`
- `/Users/fazlikrasniqi/Code/major-arcana/src/routes/ccoWorkspace.js`
- `/Users/fazlikrasniqi/Code/major-arcana/src/ops/ccoNoteStore.js`
- `/Users/fazlikrasniqi/Code/major-arcana/src/routes/ccoConversation.js`
- `/Users/fazlikrasniqi/Code/major-arcana/src/ops/ccoConversationThreadStore.js`

## Svarstudio - produktroll

Svarstudio är inte en vanlig textbox. Den är en besluts- och svarsyta som hjälper personalen att:

- förstå varför tråden är viktig just nu,
- se vilken kund, mailbox och kontext svaret gäller,
- skriva ett korrekt svar med mallar, ton och policykontroll,
- spara svaret som utkast,
- skicka det vidare till godkännande,
- markera tråden senare/klar,
- öppna Smart anteckning när något ska dokumenteras.

Den får inte skicka live externt utan owner/live-send-aktivering.

## Svarstudio - UI-innehåll

Övre toolbar:

- Rubrik: `Svarstudio`.
- Statuspills: intent, prioritet, värde/VIP/ekonomi.
- Expandera.
- Dölj/visa kontext.
- Stäng.

Vänster kontext:

- Kundkort: avatar, namn, mood, e-post, telefon.
- Källa låst: valt mejlkonto/mailbox. Exempel: `Egzona`.
- Gör detta nu: nästa åtgärd. Exempel: `Svara nu`.
- Primär action-chip: t.ex. `Svara nu`.
- Varför i fokus: senaste händelse i tråden.
- Statusgrid:
  - Agent/ägare
  - Status
  - SLA
  - Prioritet
  - Churn-risk
  - Engagement
- Kontextflikar:
  - AI
  - Historik
  - Preferenser
  - Rek
- AI-sammanfattning / rekommendation.

Huvudyta:

- Senaste meddelande från kund.
- Snabbmallar:
  - Bekräfta bokning
  - Föreslå tider
  - Skicka prislista
  - Be om info
- Till: kundnamn.
- Från: mailbox/signaturval.
- Editor/textarea för svar.
- Word count.
- Policy-status, t.ex. `Policy OK`, `Skicka spärrat`, `Korta svaret`, `Lägg till tid`.
- Signaturval, t.ex. `Egzona`, `Fazli`.
- Sammanfattningsrad: från mailbox, signatur, nästa steg.
- Responsspår:
  - Bokning
  - Uppföljning
  - Mellanbesked
  - Medicinsk
  - Pris/trygghet
  - Admin
- Tonfilter:
  - Professionell
  - Varm
  - Lösningsfokus
  - Beslutsstöd
- Finjustera:
  - Kortare
  - Skarpare
- Verktygsrad:
  - regenerera/skriv om
  - policykontroll
  - Smart anteckning
  - extra trygghets-/merförsäljningsrad
- Primära actions:
  - Skicka svar
  - Förhandsvisning
  - Spara utkast
  - Senare
  - Klar
  - Radera

## Svarstudio - state och data

Minsta state per aktiv tråd:

- `threadId`
- `customerId`
- `customerName`
- `customerEmail`
- `customerPhone`
- `mailboxId` / `mailboxAddress`
- `conversationId`
- `messageId` / `graphMessageId`
- `mode`: `reply` eller `compose`
- `draftBody`
- `baseDraftBody`
- `activeTemplateKey`
- `activeTrackKey`
- `activeToneKey`
- `activeRefineKey`
- `selectedSignatureId`
- `composeMailboxId`
- `usedToolKeys`
- `lastToolKey`
- `sending`

Koppla alltid Svarstudio till aktuell selected thread. Om offline/history-tråd visas ska skriv- och verktygsfunktioner vara låsta som läsläge.

## Svarstudio - logik

### Öppna

När användaren klickar `Svarstudio`:

1. Läs selected thread.
2. Lås käll-mailbox till trådens mailbox om den finns.
3. Välj standardsignatur från operatör/mailbox.
4. Inferera responsspår:
   - `medical` om taggar innehåller medical.
   - `pricing` om intent handlar om pris.
   - `admin` om taggar innehåller admin.
   - `booking` om bookable.
   - `follow_up` om followup eller nästa action är uppföljning.
   - annars `booking`.
5. Bygg initialt draft från:
   - live AI/reply endpoint om aktiverad,
   - annars befintlig `previewDraftBody`, `suggestedReply`, `proposedReply`, `draftModes`,
   - annars lokal fallbackmall.

### Mallar

Snabbmall ska ersätta/bygga om draft:

- `confirm_booking`: bekräfta nästa steg/tid.
- `suggest_times`: ge tre konkreta tider.
- `send_pricing`: ge prisöversikt och erbjuda bokningsförslag.
- `ask_more_info`: be om behandling + dagar/tider.

### Responsspår

Responsspår ska bygga draft med annan avsikt:

- `booking`: boka/bekräfta/föreslå tid.
- `follow_up`: driva uppföljning.
- `holding`: mellanbesked om att ärendet är aktivt.
- `medical`: stäm av med klinik/behandlare innan säkert svar.
- `pricing`: pris/trygghet och nästa steg.
- `admin`: administrativ hjälp och komplettering.

### Tonfilter

Tonfilter ska skriva om befintligt utkast:

- `professional`: sakligt och kort.
- `warm`: varmare, lugnare.
- `solution_focus`: tydlig nästa åtgärd.
- `decision_support`: hjälper kunden besluta.

### Finjustering

- `shorter`: kortar ner.
- `sharper`: gör tydligare, mer beslutsdrivet.

### Verktyg

- Regenerera: bygg om från aktiv tråd + valt spår.
- Policy: kör policykontroll före skick/godkännande.
- Smart anteckning: öppnar note mode eller note shell och markerar verktyget som använt.
- Extra rad/gift: lägger till trygghets-/nästa-steg-rad om relevant.

### Policy

Minsta policy:

- Tomt svar = blockera.
- Bokningssvar utan konkret tid eller tydligt nästa steg = varning.
- För långt svar över ca 120 ord = varning.
- Journal-/hälsodata i kundsvar = kräver review/block enligt befintlig AI/journal-guard.
- Externt live-send = spärrat tills owner/live-send är aktiverat.

### Spara och godkännande

Använd dagens backend:

- `POST /api/v1/cco-comm/drafts/generate-reply`
- `POST /api/v1/cco-comm/drafts`
- `PATCH /api/v1/cco-comm/drafts/:draftId`
- `POST /api/v1/cco-comm/drafts/:draftId/transition`
- `GET /api/v1/cco-comm/drafts/:draftId`
- `GET /api/v1/cco-comm/drafts?customerId=&status=`

State machine:

- `draft -> needs_approval -> approved -> queued -> sent`
- `failed` och `cancelled` finns som terminal/sidostatus.

Regler:

- Skapa/uppdatera/transition kräver `mail.send`.
- Läsa kräver `mail.read`.
- `sent` kräver `mail.live_send`, men är fortfarande hårt blockerat i nuvarande build.
- Författare får inte godkänna eget utkast om rollen inte har owner/live-send.
- `queued` betyder redo för senare live-send, inte faktiskt skickat.

### Senare / Klar

Svarstudio ska kunna:

- `Senare`: parkera tråden via reply-later/action-state med follow-up due date.
- `Klar`: markera konversationen handled/klar.

Relevant befintlig väg:

- `/api/v1/cco/reply-later`
- `/api/v1/cco/handled`
- Conversation state i `ccoConversationThreadStore`.

## Smart anteckning - produktroll

Smart anteckning är inte en enkel intern kommentar. Den är en strukturerad dokumentationsyta från konversationen. Den används när personalen behöver spara varför något händer, vad kunden sagt, vad som blockerar, eller vad teamet ska följa upp.

Den öppnas från Svarstudio med dokumentikonen bredvid andra verktyg.

## Smart anteckning - lägesväljare

När Smart anteckning öppnas kan systemet först visa `Välj anteckningsläge`.

Lägen:

- `ai-summary`: Sammanfatta konversation.
  - Fyll anteckningen med tät helhetssammanfattning.
- `ai-extract`: Extrahera viktiga detaljer.
  - Lyft datum, tider, preferenser och blockerande beslutspunkter.
- `ai-action-items`: Identifiera åtgärder.
  - Skapa action-orienterad anteckning för team, SLA eller uppföljning.
- `manual`: Skapa manuell anteckning.
  - Öppna utan AI-förifyllning.

Aktuell kontext ska visas i modal: kund + trådsyfte + fokus.

## Smart anteckning - UI-innehåll

Övre toolbar:

- Rubrik: `Smart anteckning`.
- Pill: `Intelligensstöd`.
- Kundpill.
- Stäng.

Vänster kolumn - sparplats:

- Kundprofil - allmänna kundnoter.
- Konversation - specifikt för denna tråd.
- Medicinsk - behandling och hälsa.
- Betalning - ekonomi och faktura.
- SLA / eskalering - brådskande uppföljning.
- Intern - bara för teamet.
- Uppföljning - framtida åtgärder.

Liveförhandsvisning:

- Visar var anteckningen blir synlig/sparad.

Mittenkolumn - auto-hämtad data:

- Konversations-ID / aktuell tråd.
- Sentiment.
- Avsikt.
- Svarstid/SLA.
- Auto-kopplas till-lista med relevanta tråd-, person- och ansvarspunkter.

Höger kolumn - editor:

- Snabbmallar:
  - Ombokning begärd.
  - Allergier / kontraindikationer.
  - Betalningsplan.
- Anteckningsfält.
- Auto-genererat + teckenräknare.
- Taggar:
  - befintliga chips,
  - input för ny tagg,
  - plusknapp.
- Prioritet:
  - Låg
  - Medel
  - Hög
- Synlighet:
  - Team
  - Intern
  - Alla operatörer
- Footer:
  - `Sparas i: <destination>`
  - Avbryt
  - Spara anteckning

## Smart anteckning - destinationer och betydelse

- `kundprofil`: generell kundkunskap/preferenser.
- `konversation`: bara denna tråd, t.ex. vad som sagts eller vad nästa svar ska bygga på.
- `medicinsk`: behandling/hälsa. Ska vara försiktig och inte automatiskt exponeras till kund.
- `betalning`: faktura, plan, ekonomi.
- `sla`: eskalering, tidskritisk uppföljning, ansvar.
- `intern`: team-only, aldrig kundsynligt.
- `uppfoljning`: skapar underlag för framtida åtgärd/påminnelse.

## Smart anteckning - state och data

Minsta note-draft:

- `tenantId`
- `workspaceId`
- `conversationId`
- `customerId`
- `destinationKey`
- `targetLabel`
- `text`
- `tags`
- `priority`
- `visibility`
- `templateKey`
- `linkedItems`
- `dataCards`
- `source`: exempel `svarstudio`
- `actorUserId`

State per aktiv destination:

- Ett draft per destination.
- Byte av destination ska bevara nuvarande text/taggar innan ny destination visas.
- Mallval fyller text + tags för aktuell destination.
- Taggar normaliseras och dubletter tas bort.
- Teckenräknare uppdateras live.

## Smart anteckning - logik

### Öppna från Svarstudio

1. Läs aktiv tråd och aktivt Svarstudio-state.
2. Bygg aktuell kontext:
   - kundnamn,
   - senaste meddelande,
   - intent,
   - prioritet/SLA,
   - valgt responsspår/ton,
   - utkastets huvudpoäng.
3. Visa lägesväljare om ingen note-mode är vald.
4. Efter valt läge öppna note shell.
5. Förifyll text, tags, data cards och linked items utifrån läget.

### AI-lägen

`Sammanfatta konversation` ska ge:

- kort sammanfattning av vad kunden vill,
- vad vi redan har svarat/föreslagit,
- vad nästa steg är.

`Extrahera viktiga detaljer` ska ge:

- datum/tider,
- behandling,
- preferenser,
- blockerare,
- beslut som saknas.

`Identifiera åtgärder` ska ge:

- vem gör vad,
- när,
- varför,
- risk/SLA om relevant.

`Manuell` ska öppna tomt eller senaste draft för destination.

### Spara

Använd dagens backend:

- `GET /api/v1/cco-workspace/notes?workspaceId=&conversationId=&customerId=`
- `POST /api/v1/cco-workspace/notes`
- `POST /api/v1/cco-workspace/notes/validate-visibility`

Befintlig store:

- `/Users/fazlikrasniqi/Code/major-arcana/src/ops/ccoNoteStore.js`

Store-regel:

- En anteckning sparas/upsertas per `tenantId + workspaceId + conversationId + customerId + destinationKey`.
- Spara på samma destination uppdaterar befintlig note, skapar inte dublett.
- `getNotesByConversation` returnerar anteckningar per aktiv konversation/kund.

Spara ska audit-loggas med `cco.workspace.note.save` där möjligt.

## Koppling mellan Svarstudio och Smart anteckning

Smart anteckning är ett verktyg i Svarstudio, inte en fristående kundkortsfunktion.

Kopplingar:

- Aktiv tråd styr kund, conversationId, mailbox och context.
- Svarstudions draftBody kan ingå i note-kontext som “vad vi tänker svara”.
- Svarstudions activeTrackKey styr rekommenderad destination:
  - `medical` -> `medicinsk`
  - `pricing` -> `betalning`
  - `follow_up` -> `uppfoljning`
  - `booking` -> `konversation` eller `uppfoljning` beroende på nästa åtgärd
  - `admin` -> `intern` eller `konversation`
- Policy/SLA-varningar kan föreslå destination `sla`.
- När Smart anteckning sparas ska Svarstudio kunna visa feedback: “Anteckning sparad i <destination>”.
- Om Smart anteckning öppnas som rekommenderat verktyg ska Svarstudio markera `note` som använt i `usedToolKeys`.

## Kundresa/logik för Hair TP Clinic

Svarstudio och Smart anteckning ska förstå CCO-kundresan:

- inkommande fråga eller bokningsdialog,
- underlag och hälsodeklaration/friskförsäkran,
- konsultation,
- offert/behandlingsplan,
- betänketid 2 dagar när det gäller bokning inom 2 dagar enligt beslut,
- avtal/samtycke,
- behandling,
- eftervård och uppföljning.

I konversationen betyder detta:

- Bokningsdialoger ska driva kunden till konkret nästa steg.
- Medicinska frågor ska inte låtsas vara läkarbesked; de ska markeras för klinisk granskning.
- Dokument-/samtyckesbrister ska kunna noteras och drivas som blockerare.
- Uppföljning och SLA ska dokumenteras så teamet inte tappar ärendet.

## Byggkrav

1. Återskapa Svarstudio visuellt och funktionellt i konversationsflödet.
2. Implementera Smart anteckning som verktyg bredvid Svarstudio-verktygen.
3. Koppla båda till aktiv selected thread.
4. Spara Svarstudio-utkast i `ccoCommDraftStore`.
5. Spara Smart anteckning i `ccoNoteStore` via `ccoWorkspace/notes`.
6. Behåll live-send spärrat tills owner/live-send beslut finns.
7. Låt `Senare` och `Klar` använda befintliga conversation-action endpoints/state.
8. Medicinsk/journal-liknande output ska flaggas för review.
9. Intern/SLA/medicinsk visibility får inte råka bli kundsynligt.
10. Lägg tester för:
    - Svarstudio öppnar med rätt tråd/mailbox.
    - Mall/spår/ton/finjustering ändrar draft.
    - Spara utkast skapar draft.
    - Transition `needs_approval` och `approved` följer RBAC.
    - `sent` blockeras.
    - Smart anteckning öppnas från Svarstudio.
    - Note destination sparas/upsertas korrekt.
    - Byte av destination tappar inte aktuell draft.
    - Medicinsk/SLA/intern visibility valideras.

## Inte i scope utan separat beslut

- Riktigt externt live-send.
- Automatisk patientexponering av anteckningar.
- Ny kundkortsfunktion.
- Ny design som avviker från pre-V12 facit utan owner-beslut.
