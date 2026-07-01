# Svarstudio i CCO Konversationer pre-V12 — handoff 2026-06-26

Syfte: detta gäller svarflödet i CCO Konversationer när personal ska svara en kund. Det gäller inte kundkort/foto och inte den nya V12-konversationsytan.

## Visuellt underlag

Rätt pre-V12-underlag:

- `docs/ops/screenshots/pre-v12-svarstudio/pre-v12-implemented-svarstudio-overlay.png`
  - Renderad från gamla implementerade pre-V12-HTML:en, inte från nya V12.
- `docs/ops/screenshots/pre-v12-svarstudio/pre-v12-implemented-svarstudio-shell-only.png`
  - Samma Svarstudio-shell isolerad.
- `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Downloads/v11-rail-block18-P-communication-screenshots/desktop-1440.png`
  - V11-kommunikationsblocket med `✉ Svarstudio` längst ner i Kundvy/rail.

Fel spår som inte ska användas som facit:

- `docs/ops/screenshots/svarstudio-handoff/01-current-conversation-svarstudio-context.png`
- `docs/ops/screenshots/svarstudio-handoff/02-current-svarstudio-action-buttons.png`

De är från nyare current/V12-konversationsyta och är inte det användaren efterfrågade.

## Vad Svarstudio ska vara

Svarstudio är arbetsytan för att svara kunden direkt från konversationen.

Den ska samla:

- inkommande kundmeddelande
- kundnamn och mailbox/källa
- risk/SLA/status-signaler
- boknings-/uppföljningskontext
- AI-förslag
- tonval
- signaturval
- utkast
- godkännande
- låst live-skick tills owner/live-send är godkänt

## Nuvarande frontend-kopplingar

Pre-V12 primär fil i iCloud-arkivet:

- `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/major-arcana/major-arcana-test/public/major-arcana-preview/index.html`

Nuvarande efter-V12-jämförelsefil:

- `public/major-arcana-preview/app/cco-conversations-v2-shell.js`

Viktiga punkter:

- Pre-V12 hade `data-quick-action="studio"` med synlig text `Svarstudio`.
- Pre-V12 hade `#studio-shell` / `studio-surface` som full Svarstudio-arbetsyta.
- Svarstudio innehöll:
  - kundprofil i vänster kontext
  - källa låst till valt mejlkonto
  - "Gör detta nu" / nästa åtgärd
  - varför tråden är i fokus
  - status/SLA/prioritet
  - AI/Historik/Preferenser/Rek-flikar
  - senaste meddelande från kund
  - snabbmallar
  - till/från
  - svarseditor
  - signaturval
  - respons-spår
  - tonfilter
  - finjustering
  - Skicka svar, Förhandsvisning, Spara utkast, Senare, Klar, Radera

## Nuvarande backend-kopplingar

Primära filer:

- `src/routes/ccoCommDraft.js`
- `src/ops/ccoCommDraftStore.js`
- `server.js`

API:

- `POST /api/v1/cco-comm/drafts/generate-reply`
- `POST /api/v1/cco-comm/drafts`
- `PATCH /api/v1/cco-comm/drafts/:draftId`
- `POST /api/v1/cco-comm/drafts/:draftId/transition`
- `GET /api/v1/cco-comm/drafts/:draftId`
- `GET /api/v1/cco-comm/drafts?customerId=&status=`

State machine:

- `draft -> needs_approval -> approved -> queued -> sent`
- `failed` och `cancelled` finns som sido-/terminalstatus.

Säkerhet:

- skapa/uppdatera/transition kräver `mail.send`
- live-skick till `sent` kräver `mail.live_send`
- live-skick är fortfarande hårt blockerat i backend i denna build
- författare får inte godkänna eget utkast om rollen inte är owner
- AI-generering går genom gateway med risk-/policykontroller
- journal-liknande innehåll ger review/block-risk

## Vad Cloud Code ska bygga vidare

Bygg inte ny kundkortsfunktion. Bygg vidare på Svarstudio i konversationer:

1. Gör Svarstudio visuellt komplett i konversationsflödet.
2. Koppla knappen till riktig selected thread och behåll kund-/mailboxkontext.
3. Visa AI-förslag tydligt, men låt personal redigera innan godkännande.
4. Spara inline-snabbsvar som riktigt draft via `/cco-comm/drafts`.
5. Gör “Begär godkännande” till transition `needs_approval`.
6. Gör “Godkänn” till transition `approved`.
7. Låt `queued` betyda redo för senare live-send, inte skickat.
8. Håll “Skicka” låst tills owner + live-send-beslut finns.
9. När live-send senare aktiveras: koppla `approved/queued -> send connector -> sent/failed` med audit.

## Viktiga produktregler

- Svarstudio får aldrig skicka externt utan tydlig owner/live-send-aktivering.
- Den ska hjälpa personal skriva bättre svar, inte ersätta granskning.
- Medicinska/journal-liknande uppgifter ska hanteras försiktigt och trigga granskning.
- Allt ska ske från konversationen: användaren ska inte behöva hoppa till kundkort för att svara.
