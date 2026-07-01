# CCO live Admin conversation functions

Date: 2026-06-26
Source: https://arcana.hairtpclinic.com/admin and live `major-arcana-preview/index.html`
Purpose: handoff for implementing the existing/live Admin conversation functions into the new conversation surface.

Important: this is the existing/live Admin conversation UI, not the new v2 preview branch.

## Screenshots

- Full live conversation screen: `docs/ops/screenshots/live-arcana-conversations-current-2026-06-26.png`
- Cropped action/context screen: `docs/ops/screenshots/live-arcana-conversations-actions-crop-2026-06-26.png`
- Live Admin overview: `docs/ops/screenshots/live-arcana-admin-2026-06-26.png`

## Visible live conversation surface

The live surface has:

- Left work queue with lane chips: Senare, Skickade, Historik, Svarstudio, Klar, Radera, Admin, Granska, Oklart, Eftervård, Operation, Commercial, Bokning, Medicinsk.
- Focus tabs: Konversation, Kundhistorik, Historik, Anteckningar.
- Focus action row: Svara nu, Nytt mejl till kunden, Svara senare, Markera klar, Schemalägg uppföljning, Öppna historik, Radera.
- Right customer intelligence panel: customer, lifecycle, waiting state, follow-up, owner, risk, quick chips.

## Svarstudio

Live Admin contains a full `studio-shell` workspace.

Key content and controls:

- Opens from quick action `data-quick-action="studio"` / `data-quick-mode="reply"`.
- Context sidebar and editor panel.
- Response tracks: Bokning, Uppföljning, Mellanbesked, Medicinsk, Pris/trygghet, Admin.
- Tone filters: Professionell, Varm, Lösningsfokus, Beslutsstöd.
- Finetune: Kortare, Skarpare.
- Signature selection: Egzona, Fazli.
- Editor tools: Smart anteckning, regenerate/rewrite, policy check.
- Primary action: Skicka svar.
- Secondary actions: Förhandsvisning, Spara utkast, Senare, Klar, Radera.

Implementation note for Cloud Code: preserve the response-track/tone/signature model and policy state. Do not replace it with only a simple text box.

## Bokningsyta / Bokningsarbete

Live Admin contains a full `booking-operator-surface` and `booking-shell`.

Key content and controls:

- Status: Behöver triage / booking status pill.
- Source, health, next action, decision source.
- Attention grid: Vad, När, Validering.
- Decision context, handoff checklist, handoff summary.
- Slot overview: Lediga tider, overview title/meta/engine/steps/reason.
- Slot controls: Från, Till, Behandlare, Behandling, Resurs-id, Service-id.
- Actions: Hämta CCO-tider, Hämta tider, Välj 3 tider, Rensa tider, Infoga i Svarstudio, Väntar kund, Schemalägg, Bekräftad externt, Avboka, Kopiera överlämning, Kopiera logg.
- Event timeline and audit preview.

Implementation note for Cloud Code: this is not just "open calendar". It is an operator booking workflow that can select candidate slots and push them into Svarstudio.

## Smart anteckning

Live Admin contains a mode picker and a full `note-shell`.

Mode picker:

- Sammanfatta konversation.
- Extrahera viktiga detaljer.
- Identifiera åtgärder.
- Skapa manuell anteckning.

Save destinations:

- Kundprofil.
- Konversation.
- Medicinsk.
- Betalning.
- SLA / eskalering.
- Intern.
- Uppföljning.

Editor content:

- Auto-hämtad data: konversations-ID, sentiment, avsikt, svarstid.
- Auto-kopplas till list.
- Templates: Ombokning begärd, Allergier / kontraindikationer, Betalningsplan.
- Text editor, tags, priority, visibility.
- Save action: Spara anteckning.

Implementation note for Cloud Code: Smart anteckning must preserve destination selection and auto-hämtad data, not only save a free-text note.

## Kalender

Live Admin contains a `calendar-shell`.

Key content:

- Title: Kalender.
- Description: Bokade tider, lediga slots och resursplanering för mottagningen.
- Host: `data-booking-calendar-host`.

Implementation note for Cloud Code: Calendar is connected to booking context and slot selection; it should be reachable from conversation context and booking workflow.

## Minimum migration target

Cloud Code should implement these as functional surfaces in the new conversation UI:

1. Preserve current focus action row behavior.
2. Wire Svarstudio with tracks, tone, signature, draft/save/preview/send states.
3. Wire Bokningsyta as a booking workflow with slot controls, candidate times, handoff, log/audit, and "Infoga i Svarstudio".
4. Wire Smart anteckning with mode picker, destination, auto data, templates, tags, priority, visibility, and save.
5. Wire Kalender as a context-aware calendar/slot surface, not only a nav link.
