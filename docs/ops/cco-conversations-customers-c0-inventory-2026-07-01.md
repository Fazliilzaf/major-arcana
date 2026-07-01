# C0 - CCO Konversationer x Kunder inventering

Datum: 2026-07-01  
Scope: inventering, screenshots och integrationsplan. Ingen produktkod, inga writes, ingen Drive-review.

## Beslut

Konversationer/Kunder pausas för ny kod tills denna C0-inventering är accepterad. Google Drive-review fortsätter separat hos Cursor.

Nästa tekniska arbete ska börja med Konversationer som read-only operativ inkorg, och därefter koppla in Kunder. Skälet är enkelt: konversationsdelens UI och backend finns till stor del redan. Det som behöver bli rätt först är datakontraktet mellan mailtråd och patientkort, annars riskerar vi fel kundkoppling.

## Screenshots

Skärmbilderna togs lokalt mot `http://127.0.0.1:3100` med offline-server. De visar befintliga ytor, inte nybyggda C0-ytor.

| Yta                     | Fil                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Kunder / kundregister   | [01-customers-main.png](screenshots/c0-conversations-customers-2026-07-01/01-customers-main.png)                     |
| Konversationer v2-shell | [02-conversations-shell.png](screenshots/c0-conversations-customers-2026-07-01/02-conversations-shell.png)           |
| Svarstudio v3           | [03-svarstudio-v3.png](screenshots/c0-conversations-customers-2026-07-01/03-svarstudio-v3.png)                       |
| Smart anteckning v3     | [04-smart-anteckning-v3.png](screenshots/c0-conversations-customers-2026-07-01/04-smart-anteckning-v3.png)           |
| Mail review v3          | [05-mail-review-v3.png](screenshots/c0-conversations-customers-2026-07-01/05-mail-review-v3.png)                     |
| Kundportal/offert v3    | [06-customer-offer-portal-v3.png](screenshots/c0-conversations-customers-2026-07-01/06-customer-offer-portal-v3.png) |
| Offert-demo             | [07-customer-quote-demo.png](screenshots/c0-conversations-customers-2026-07-01/07-customer-quote-demo.png)           |

## Övergripande läge

| Del                           | Status             | Slutsats                                                                                                    |
| ----------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Konversationsshell            | Delvis live        | `cco-conversations-v2-shell.js` renderar lanes, inbox, tråd och kundkontext från injicerat runtime-context. |
| Svarstudio                    | Delvis live        | Inbäddad Svarstudio kan generera/spara/godkänna utkast via `ccoCommDraft`; live-send är låst.               |
| Smart anteckning              | Delvis live        | Workspace-notes finns via `ccoWorkspace`; standalone-vyn är rik preview/arbetsyta.                          |
| Mail ingestion                | Live owner/admin   | Graph/ingestion/review-queue finns, men kundkoppling behöver styras hårt.                                   |
| Kundkort                      | Live               | Patient-master kan läsa patient, dossier, dokument, filer, kommunikation och tidslinje.                     |
| Kundkommunikation på kundkort | Delvis live        | `ccoCustomerComm` aggregerar mail, utkast, internnotiser och utskick per kund.                              |
| Dokument/bilder               | Live/delvis review | Patient assets och Drive-import är inne, men osäkra filer ligger i separat Drive-review-spår.               |
| Kalender/offert               | Delvis live        | Booking/offer/portal-flöden finns, men konversationskopplingen ska göras stegvis.                           |

## UI-inventering

| Yta                     | Kod                                                                                               | Viktiga funktioner                                                                                                                                                                              | Status                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Konversationer v2-shell | `public/major-arcana-preview/app/cco-conversations-v2-shell.js`                                   | Lanes, lane chips, inbox tabs, trådvy, context rail/bottom-sheet, AI-box, Svarstudio, Bokningsyta, Smart anteckning, Kalender, bulkbar, CMD-K, quick reply, tema/densitet, mobil master-detail. | Delvis live                                               |
| Svarstudio v3           | `public/major-arcana-preview/cco-svarstudio-v3.html` + inbäddad modal i shell                     | Mallar, spår, ton, signatur, policy, makro, förhandsvisning, senare/klar, spara utkast.                                                                                                         | Preview + delvis live via draft-router                    |
| Smart anteckning v3     | `public/major-arcana-preview/cco-smart-anteckning-v3.html` + `cco-workspace/notes`                | Anteckningsläge, mallar, AI fortsätt skriva, taggar, visibility, journal/pdf/signering i standalone.                                                                                            | Preview + delvis live notes                               |
| Senare/Skickat          | `public/major-arcana-preview/cco-senare-v3.html`, `cco-skickat-v3.html`                           | Köer för senare/sent, statusfilter och draft-status.                                                                                                                                            | Delvis live, behöver runtime-bindning verifieras per lane |
| Notiser                 | `public/major-arcana-preview/cco-notiser-v3.html`                                                 | Backend-taxonomi: booking, compliance, id_verification, agreement, mail, system.                                                                                                                | Live-ish via notifications feed                           |
| Mail review             | `public/major-arcana-preview/cco-mail-review-v3.html`, `src/routes/ccoMailIngestion.js`           | Owner review queue för unmatched/needs-review mail.                                                                                                                                             | Live owner/admin                                          |
| Kundregister / kundkort | `patient-master-ui.js`, `ccoPatientMaster.js`                                                     | Patientlista, dossier, journal, dokument, bilder, offer/portal readiness, communication/timeline, payment context.                                                                              | Live                                                      |
| Kundportal/offert       | `ccoCommercial.js`, `ccoOfferEsign.js`, `customer-quote.html`, `cco-patient-offer-portal-v3.html` | Token-länk, offert, zoner, pris, betänketid, signering, portal-preview.                                                                                                                         | Delvis live                                               |

## Klickbara actions i konversationsdelen

| Action                    | Selector/funktion                           | Nuvarande mål                                | Status/risk                                 |
| ------------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Byt lane                  | `setLane(id)`, lane sidebar/chips           | Frontend context                             | Live i shell                                |
| Välj tråd                 | `selectThread(id)`                          | Frontend context                             | Live i shell                                |
| Context rail/bottom-sheet | `data-v2-ctx-toggle`, ctx tabs              | Frontend context                             | Live i shell                                |
| Svarstudio                | `data-v2-action="studio"`                   | Inbäddad workbench                           | Delvis live                                 |
| AI generera svar          | `data-studio-generate`                      | `studioGenerate` -> draft AI                 | Delvis live, AI fallback om provider saknas |
| Spara utkast              | `data-studio-save`, quick reply save        | `POST /cco-comm/drafts`                      | Live, gated                                 |
| Begär godkännande         | `data-studio-review`                        | draft transition                             | Live, gated                                 |
| Godkänn                   | `data-studio-approve`                       | draft transition                             | Live, gated                                 |
| Skicka svar               | `data-studio-send`                          | Live-send                                    | Låst medvetet                               |
| Markera klar              | `data-v2-action="handled"`                  | `POST /cco/runtime/conversation/:key/action` | Backend finns, UI-bindning ska verifieras   |
| Senare                    | Svarstudio/queue actions                    | `reply_later` state                          | Backend finns                               |
| Öppna bokning             | `data-v2-action="booking"`                  | Booking context                              | Delvis live, behöver kundbindning           |
| Kunddossiér               | `data-v2-action="dossier"`                  | Customer/patient route                       | Kräver stabil patientId                     |
| Smart anteckning          | `data-v2-action="note"`                     | Workspace notes                              | Backend finns                               |
| Bulk actions              | `data-v3-bulk=assign/snooze/handled/triage` | Frontend/handler                             | Måste riskklassas innan writes              |
| CMD-K                     | `data-v3-cmdk`                              | Frontend commands                            | Live i shell                                |

## Backend/store/API-karta

| UI-behov                             | API/store                                                                               | Status                          |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------- |
| Full trådhistorik                    | `GET /api/v1/cco/runtime/conversation/:key/messages` -> `ccoMailboxTruthStore`          | Live                            |
| AI-sammanfattning / next best action | `GET /api/v1/cco/runtime/conversation/:key/summary` -> `runSummarizeThreadCapability`   | Live med OpenAI eller heuristik |
| Bookingförslag från tråd             | `GET /api/v1/cco/runtime/conversation/:key/bookings`                                    | Live/delvis                     |
| Generera booking-bekräftelse         | `POST /api/v1/cco/runtime/conversation/:key/booking-confirm`                            | Live/delvis                     |
| AI-utkast från tråd                  | `POST /api/v1/cco/runtime/conversation/:key/draft`                                      | Live/delvis                     |
| Skicka Graph-reply                   | `POST /api/v1/cco/runtime/conversation/:key/reply`                                      | Kräver Graph send, hög risk     |
| Klar/Senare/Öppna igen               | `POST /api/v1/cco/runtime/conversation/:key/action` -> `ccoConversationStateStore`      | Live backend                    |
| Trådanteckningar                     | `GET/POST /api/v1/cco/runtime/conversation/:key/notes` -> `ccoConversationNotesStore`   | Live backend                    |
| Manuell mailbox-sync                 | `POST /api/v1/cco/runtime/sync` -> Graph read                                           | Kräver Graph read               |
| Dashboard/mailbox health             | `/cco/runtime/dashboard`, `/health/mailboxes`, `/settings/info`                         | Live                            |
| Mallar/makron                        | `/cco/runtime/mail-templates`, `ccoMacroStore`                                          | Live/delvis                     |
| Utkast-state-machine                 | `/api/v1/cco-comm/drafts*` -> `ccoCommDraftStore`                                       | Live; live send hårt blockerat  |
| Workspace bootstrap/notes/followups  | `/api/v1/cco-workspace/*` -> note/followup/booking/patient stores                       | Live/delvis                     |
| Kundens konversationer               | `GET /api/v1/cco-customers/:id/conversation-threads` -> `ccoConversationThreadStore`    | Live backend                    |
| Kundens unified timeline             | `GET /api/v1/cco-customers/:id/unified-timeline`                                        | Live backend                    |
| Patientlista/patientkort             | `/api/v1/cco-patient-master/*`                                                          | Live                            |
| Dokument/dossier                     | `/cco-patient-master/patient/document-bundle`, `/dossier-bundle`                        | Live                            |
| Mail ingestion/review                | `/api/v1/cco/mail-ingestion/*`                                                          | Live owner/admin                |
| Offert/kundportal                    | `/api/v1/cco-commercial/*`, `/cco-commercial/customer-offer-portal`, `/offer-sign-page` | Live/delvis                     |

## Datakontrakt som saknas innan riktig integration

Konversationer får inte börja skriva mot Kundkort förrän varje tråd har ett spårbart kundbindningsobjekt:

```json
{
  "conversationKey": "graph/mailbox conversation id",
  "mailboxId": "info@hairtpclinic.com",
  "threadId": "stable internal id",
  "customerMatch": {
    "patientId": "cliento_...",
    "status": "confirmed | suggested | none | conflict",
    "confidence": "high | medium | low",
    "basis": "email_exact | phone_exact | drive_folder_owner | manual | unknown"
  },
  "workflow": {
    "lane": "agera_nu | bokningsbar | operation | eftervard | medicinsk | system",
    "needsReply": true,
    "slaStatus": "ok | warning | overdue",
    "assignedTo": "staff user id or null"
  },
  "links": {
    "bookingId": null,
    "offerId": null,
    "portalToken": null,
    "patientAssetIds": []
  }
}
```

Regel: `confirmed` får visas på kundkortet. `suggested` får visas som förslag i konversationen. `conflict` måste till review. Inga automatiska journal- eller kundkortswrites från AI.

## Statusklassning

### Live / kan användas som bas

- Mailbox truth + runtime conversation API.
- Draft generation/save/approval via `ccoCommDraft`.
- Conversation state: handled, reply_later, reopen.
- Customer communication aggregator per kund.
- Patient-master/dossier/document bundle/file reads.
- Customer offer/portal readiness och signeringsflöden.
- Drive-import assets som redan är `VISIBLE_ON_PATIENT_CARD`.

### Demo/preview eller kräver bindning

- Standalone `cco-svarstudio-v3.html` och `cco-smart-anteckning-v3.html`.
- V2-shells visuella quick actions om de saknar runtime handler i aktuell vy.
- Senare/Skickat/Notiser behöver verifierad data per miljö.
- Booking action från konversation till bokningsyta.

### Saknar data eller behöver ägarbeslut

- Slutlig mailbox allowlist och filter för vad som ska in i CCO.
- Patientmatch-trösklar: exakt e-post, telefon, namn, folder-owner.
- Vad som räknas som systemmail, spam, leveransnotis, Google/Meta/Loopia/Fortnox-brus.
- Rollregler: vem får markera klar, godkänna utkast, ändra kundbindning.

### Risker

- Fel patientkoppling är största risken.
- Live-send via Graph ska förbli låst tills owner har godkänt flöde, audit och rollback.
- AI får inte skriva journal automatiskt.
- Bulk actions får inte kunna påverka flera patienter utan preview/confirm.
- Mail från flera mailboxar kan skapa dubbletter om dedupe inte används konsekvent.
- Audit-läsning har tidigare haft auth-gap; actions måste ändå audit-loggas.

## Integrationsplan Konversationer -> Kunder

### C1 - Read-only mailtråd till CCO-konversationer

Mål: visa riktiga trådar i konversationsshell utan writes.

- Lås mailbox allowlist.
- Normalisera lane-taxonomi.
- Läs från `ccoMailboxTruthStore`/mail ingestion.
- Visa kundmatch-status: bekräftad, föreslagen, saknas, konflikt.
- Visa "Öppna kundkort" bara när patientId är bekräftad.
- Testa desktop, iPad, mobil.

### C2 - Kundkortets kommunikationspanel

Mål: varje kundkort visar mail/utkast/skickade formulär i rätt ordning.

- Använd `GET /cco-customers/:id/conversation-threads`.
- Visa filter: inkommande, utgående, utkast, behöver godkännande, skickat, intern, obesvarad.
- Visa mailboxes och senaste inbound/outbound.
- Länka tillbaka från kundkort till konversationstråd.
- Inga writes i första PR.

### C3 - Svarstudio riktig i konversationen

Mål: Svarstudio jobbar mot riktig tråd och riktig kund.

- `generate-reply` och `drafts` används med `customerId`, `conversationKey`, `threadSnippet`.
- "Spara utkast" skriver draft.
- "Begär godkännande" och "Godkänn" använder draft transition.
- "Skicka" fortsätter vara låst.
- Visa tydligt om tråden saknar bekräftad kund.

### C4 - Smart anteckning med säker destination

Mål: operatören kan skapa intern anteckning/follow-up från tråd.

- Koppla `note` till `/cco-workspace/notes`.
- Visa visibility-regler innan save.
- Medicinska anteckningar kräver rätt destination och får inte autoskrivas till journal.
- Audit/logga action.

### C5 - Operativa actions

Mål: klar/senare/reopen fungerar från CCO-konversationen.

- Använd `/cco/runtime/conversation/:key/action`.
- Reply_later kräver datum eller default +24h.
- Kundkortet ska spegla handled/snoozed status via conversation thread store.
- Bulk först som preview, sedan confirm.

### C6 - Customer timeline och dokument/bilder

Mål: kundens tidslinje visar kommunikation, dokument, bilder och offers i en gemensam ordning.

- Bygg på `unified-timeline`.
- Drive-review-resultat kommer in när assets är `VISIBLE_ON_PATIENT_CARD`.
- Bilder/dokument ordnas efter asset/document timestamp.
- Osäkra Drive-filer visas inte på kundkort förrän review är klar.

### C7 - Live send senare

Mål: aktivera Graph-send först efter torrkörning.

- Kräver owner-beslut.
- Kräver `mail.live_send`.
- Kräver audit och tydlig "skickat av".
- Kräver stopp/rollback-plan.

## Rekommenderad ägarmodell

| Spår                        | Ägare          | Varför                                                        |
| --------------------------- | -------------- | ------------------------------------------------------------- |
| C0-C3 Konversationer/Kunder | Codex          | Kräver bred kodkarta, riskklassning och UI->backend-kontrakt. |
| Google Drive review         | Cursor         | Cursor har importhistoriken, canary-script och review-kön.    |
| Cloud Code implementation   | Cloud efter C0 | Ska bygga från specifikation, inte gissa funktioner.          |

## Nästa föreslagna prompt till Cloud efter C0

```text
Bygg inte nytt från minnet. Använd C0-dokumentet:
docs/ops/cco-conversations-customers-c0-inventory-2026-07-01.md

Starta med C1:
- read-only konversationslista från befintlig mailbox truth / ingestion
- visa kundmatch-status
- inga writes
- inget live-send
- ingen journal
- inga nya dokument
- desktop/iPad/mobil
- följ CCO-designen
```
