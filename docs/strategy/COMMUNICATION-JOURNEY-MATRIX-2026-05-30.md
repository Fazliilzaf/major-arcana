# Communication & Journey Matrix

*Genererad: 2026-05-30 · Sprint 1 audit-fas innan implementation*

> Owner-direktiv: CCO ska hantera kommunikation kopplat till patientresan.
> Inga Drive-länkar. Ingen extern AI på journalinnehåll. AI får bara skapa
> utkast med human approval.

---

## Existing infrastructure (audit)

### Stores som finns

| Store | Roll |
|---|---|
| `ccoSendActionStore` | Sprint C — skicka form/consent/file/encounter med dry-run + version-snapshot |
| `ccoNotificationStore` | Steg 5 — push + SMS + cron |
| `ccoNotificationFeedStore` | Steg 4 — aggregator från 5 källor, 17+ notis-typer |
| `ccoMailTemplateStore` | Steg 1 — templates med versioning + audit |
| `ccoMailboxTruthShardedStore` | Mail-historik per inbox (sharded) |
| `ccoMailboxTruthReadAdapter` | Read-adapter mot mailbox-truth |
| `ccoMailComposeDocument` | Compose-flow för utgående mejl |
| `ccoMailThreadHydrator` | Tråd-bygge från råa mejl |
| `ccoConversationStateStore` | Konversations-state (read/snoozed/escalated) |
| `ccoConversationNotesStore` | Interna anteckningar per konversation |
| `ccoCommercialMailDispatch` | Mejl-dispatch för offerter/avtal |
| `ccoJournalTextTemplates` | Templates för journal-fält (Sprint F tone-selector) |

### Endpoints som finns

| Endpoint | RBAC |
|---|---|
| `POST /api/v1/cco-send/form/:customerId` | `mail.send` |
| `POST /api/v1/cco-send/consent/:customerId` | `mail.send` |
| `POST /api/v1/cco-send/file/:customerId` | `mail.send` |
| `POST /api/v1/cco-send/encounter/:customerId` | `mail.send` |
| `POST /api/v1/cco-offers/:id/send` | `offer.write` |
| `POST /api/v1/cco-agreements/:id/send` | `agreement.write` |
| `POST /api/v1/cco-marketing/send-token` | `marketing.send` |
| `GET/POST /api/v1/cco-templates/*` | `templates.read/write/legal_review` |
| `GET /api/v1/cco-mailboxes` | `mailbox.admin` |
| `/api/v1/cco-notifications/{push,sms}-*` | `settings.*` |

### Saknas / inte wirade till patientkort idag

| Saknas | Behov |
|---|---|
| Aggregator `/api/v1/cco-customers/:id/communication-feed` | **NY** — Sprint 1 |
| Per-kund mailbox-truth listning | **NY** — Sprint 1 |
| Listsends per customerId | **NY** — Sprint 1 |
| "Kommunikation"-sektion i kunder.html dossier | **NY** — Sprint 1 |
| Intern notis-knapp på patientkort | **NY** — Sprint 1 |
| Booking-bekräftelse / avbokning / påminnelse-mall-wires | UPGRADE — Sprint 2 |
| AI-utkast med human approval | **NY** — Sprint 2 (om aktiveras) |

---

## Kundres-matrix (12 steg × 11 kolumner)

| # | Kundresesteg | Trigger | Kanal | Mall | Audit | Journalnot | Approval | Signering | CCO-plats | Status |
|--:|---|---|---|---|---|---|---|---|---|---|
| 1 | **Första kontakt / lead** | Patient hör av sig via web-chat / mail / telefon | mail / SMS | `welcome_*` (Nordbro) | Y | N | N | N | Konversationer + patientkort | UPGRADE — lead-flagga finns (989 leads), wire mot mall saknas |
| 2 | **Konsultations-bokning** | Slot bokas via /kunder.html?view=calendar | mail | `booking_confirmation_*` | Y | N | N | N | Kalender + dossier | UPGRADE — booking-create finns, mail-dispatch saknas |
| 3 | **Påminnelse 24h innan** | Cron-job dagen före | mail / SMS | `reminder_24h_*` | Y | N | N | N | Notification-cron + dossier-timeline | UPGRADE — cron finns, mall saknas |
| 4 | **Pre-treatment formulär** | Behandling bokad → kräver dokument | patient-portal + mail | health_declaration_hair_tp + fitness_certificate_hair_tp | Y | Y (signering → journal-entry) | N (auto) | Y (patient) | Patientportal + dossier-Formulär | ✅ EXISTS — `POST /cco-send/form/:id` + form-submit wired (#222-hook) |
| 5 | **Konsultation genomförd** | Encounter markeras "completed" | mail (sammanfattning) | `consultation_summary_*` | Y | Y (journal-entry) | Y (human approval — staff väljer) | Y (signerad journal) | Smart-anteckning → drawer | EXISTS — journal-signering finns, summary-mail saknas |
| 6 | **Offert skickad** | Offer-create + send | mail (PDF-bilaga) | `offer_*_nordbro` (DHI 2-day) | Y | N | Y (staff klickar Skicka) | Y (digital signering via portal) | Offerter + dossier | ✅ EXISTS — `POST /cco-offers/:id/send` |
| 7 | **Avtal signerat** | Patient signerar via portal | mail (bekräftelse) | `agreement_confirmation_*` | Y | N | N (auto) | Y (patient redan signerat) | Avtal-sektion + dossier-Avtal | EXISTS — `POST /cco-agreements/:id/send` + signed-state |
| 8 | **Pre-op ID-verifiering** | Behandling < 48h | in-house (staff visuell + portal) | n/a (process, ej mall) | Y | Y (id_verification.confirmed) | Y (staff confirm) | N | Ready-for-treatment pill | EXISTS — `ccoIdVerificationStore` |
| 9 | **Avbokning / sena reschedule** | Patient eller staff avbokar | mail / SMS | `cancellation_*` + `reschedule_*` | Y | N | Y (om late-cancel-policy) | N | Booking-drawer + dossier | UPGRADE — late-cancel-policy finns, mail saknas |
| 10 | **Eftervård / aftercare** | encounter.completed → cadence-scheduler | mail / SMS | `aftercare_fue_*`, cadence 7/30/90/365d | Y | Y (followup-entry vid svar) | N (auto-schedule) | N | Aftercare scheduler + tidslinje | ✅ EXISTS — `ccoAftercareSchedulerStore` |
| 11 | **No-show follow-up** | Booking markerad `no_show` | mail | `no_show_followup_*` | Y | N | Y (staff väljer att skicka) | N | Booking-drawer + dossier | UPGRADE — markering finns, mall + auto-mail saknas |
| 12 | **Intern notis till personal** | Staff vill flagga något internt | in-house (notification-feed) | n/a (free text) | Y | N | N | N | Patientkort + notisfeed | **NY** Sprint 1 — finns infrastruktur, ingen knapp idag |

---

## Status-sammanfattning

| Status | Antal | Steg |
|---|--:|---|
| ✅ EXISTS (fungerar) | 5 | #4, #6, #7, #8, #10 |
| 🟡 UPGRADE (delvis, saknar mall/wire) | 6 | #1, #2, #3, #5, #9, #11 |
| ❌ MISSING (saknas helt) | 1 | #12 |
| ⛔ DO_NOT_PORT | 0 | — |

---

## Säkerhets-/compliance-regler (orubbliga)

| Regel | Hur det hanteras |
|---|---|
| Inga Drive-länkar | Alla mejl-bilagor via CCO secure storage (`/api/v1/cco/assets/:id/download`) |
| Ingen extern AI på journalinnehåll | Utkast får skapas via AI MEN endast på strukturerade fält + human approval krävs |
| AI-utkast = draft | Aldrig auto-skickat. Staff klickar "Godkänn & skicka" |
| Patientdata till GitHub | Aldrig. Templates är generiska, payload är runtime |
| Audit | Varje send → `mail.sent` audit-event med template-id, version-snapshot, recipient-hash |
| RBAC | `mail.send` på alla send-routes; `marketing.send` på marketing |
| Journalnot vid sign | `#222-hook` triggar PDF + asset + audit per signering |

---

## Sprint 1 implementation-plan

### Backend (1 ny endpoint + 1 ny store-wire)

| Endpoint | Vad | RBAC |
|---|---|---|
| `GET /api/v1/cco-customers/:id/communication-feed` | Aggregator: sends + mails + notisser + interna anteckningar, kronologiskt | `customers.read` |
| `POST /api/v1/cco-customers/:id/internal-note` | Skapa intern notis (steg #12) | `customers.write` |

### Frontend (1 ny dossier-sektion + 4 snabbactions)

1. **"Kommunikation"-sektion** i kunder.html dossier (efter Filer & journaler)
2. **Snabbactions-rad** (4 knappar):
   - Skicka formulär (wirad mot `/cco-send/form/:id`)
   - Skicka friskförsäkran (wirad mot `/cco-send/form/:id` med `formType=fitness_certificate`)
   - Skicka samtycke/avtal (wirad mot `/cco-send/consent/:id` eller `/cco-agreements/:id/send`)
   - Intern notis (nytt — modal eller inline-input)
3. **Kronologisk feed** av kommunikation per kund med status-pills
4. **Mobile bottom-sheet** för action-modaler

### Sprint 1 scope (autonomt)

- ✅ Aggregator-endpoint
- ✅ Internal-note-endpoint
- ✅ "Kommunikation"-sektion i dossier
- ✅ 4 snabbactions med audit
- ✅ Mobile bottom-sheet bevarad

### Senare sprintar (ej i Sprint 1)

- Sprint 2: AI-utkast med human approval-flow
- Sprint 2: Mail-template-mappar för steg #1, #2, #3, #5, #9, #11
- Sprint 3: Cron-wires för booking-confirmation / reminder / no-show-followup
- Sprint 4: Conversation-thread-view per kund (mail-history)

---

## Vad som flyttar till kalender vs patientkort

| Funktion | Bor i |
|---|---|
| Skicka formulär från **booking** | Kalender-drawer (snabbaction redan finns!) |
| Skicka formulär från **kund** | Patientkort dossier (Sprint 1) |
| Booking-bekräftelse | Auto vid booking-create (Sprint 2) |
| Avbokning | Booking-drawer (extension Sprint 2) |
| Eftervård | Aftercare-scheduler (auto, syns i timeline) |
| Intern notis | Patientkort (Sprint 1) |
| Mail-historik | Patientkort + Konversationer-vy |

---

*Refs:*
- *src/ops/ccoSendActionStore.js (Sprint C)*
- *src/ops/ccoNotificationFeedStore.js (Steg 4)*
- *src/ops/ccoMailTemplateStore.js (Steg 1)*
- *src/ops/ccoAftercareSchedulerStore.js (Steg 5)*
- *config/cco-treatment-document-requirements.json (Sprint 2 dokument-krav)*
- *kunder.html L5079+ (existing dossier-sektioner)*
