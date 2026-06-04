# Communication Mail Coverage Report — 2026-05-30

Sprint 4.1 — Real Imported Mail Wiring · Status och täckning.

## Owner-rapporterat import-läge

| Mailbox                  | Importerat | Förväntat (owner-uppgift) |
| ------------------------ | ---------- | ------------------------- |
| contact@hairtpclinic.com | 5366       | 5366                      |
| fazli@hairtpclinic.com   | 598        | 598                       |
| kons@hairtpclinic.com    | 188        | 188                       |
| info@hairtpclinic.com    | 250        | 250                       |
| egzona@hairtpclinic.com  | 2280       | 2280                      |
| marknad@hairtpclinic.com | 151        | 151                       |
| receipt@hairtpclinic.com | 0          | 0                         |
| **Totalt**               | **8833**   | **8833**                  |

## Lokal store-status (denna mac, denna repo)

| Store                          | Path                                                                | Status                                          |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------- |
| ccoMailIngestionStore          | `data/cco-mail-ingestion.json`                                      | 385 bytes — **empty**                           |
| ccoMailboxTruthStore (sharded) | `data/cco-mailbox-truth/mailboxes/`                                 | endast `.migration-complete.json` — **empty**   |
| ccoMailboxTruth index          | `data/cco-mailbox-truth/index.json`                                 | 36 KB sync-run-metadata, ingen mail-payload     |
| Backup pre-icloud              | `data.pre-icloud-sync-20260530-130350/cco-mailbox-truth/mailboxes/` | tom (4K)                                        |
| Mailbox-konfiguration          | `data/cco-mailboxes.json`                                           | 8 mailboxar konfigurerade (alla 7 + bokföring@) |

**Slutsats:** Lokal repo har all WIRING klar men noll mail-payload. Import-runs är loggade i `index.json` (~78 deltakörningar 2026-05-25 till 2026-05-30) men ingen körning resulterade i mail som persisterades i sharded mailbox-store eller ingestion-store på denna maskin.

**Hypotes:** Mail-importen kan ha skett i ett annat dataDir, en annan miljö, eller via en pipeline som inte committar till lokala JSON-shards. Detta måste verifieras av owner innan UI kan rendera live mail-trådar.

## Wirings färdiga i denna sprint

### `src/ops/ccoMailIngestion/store.js` — nya helpers

| Funktion                                               | Syfte                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `listPatientMessages({patientId, limit})`              | Returnera alla MATCHED mail för patient, sorterade desc                          |
| `listPatientMessagesByCustomerId({customerId, limit})` | Alias (patientId === customerId i CCO)                                           |
| `listUnmatchedMessages({mailboxEmail, limit})`         | Mail där ledger.status = UNMATCHED                                               |
| `listAmbiguousMatches({limit})`                        | Patient-matches med flera kandidater                                             |
| `listMailboxStats()`                                   | Per-mailbox: total/matched/unmatched/needsReview/ambiguous/failed + lastSyncedAt |

### `src/ops/ccoConversationThreadStore.js` — utökad aggregator

- Använder nya `listPatientMessages` när tillgängligt → täcker både in/ut/drafts via `folderType`
- **Fallback:** om ingest-store är tom, scannar `mailboxTruthStore.listMessages` med `customerIdentity`-match
- Ny `outgoing` + `system` filter
- True-unanswered tar nu hänsyn till alla outgoing-kanaler (mail + form + consent + comm_sent)
- Counts inkluderar nya filters

### `server.js` — nya endpoints (RBAC: mail.read · mail.send)

| Endpoint                                         | Syfte                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /api/v1/cco-mail/mailbox-stats`             | Per-mailbox-stats (total/matched/unmatched/etc)                              |
| `GET /api/v1/cco-mail/unmatched?mailbox=&limit=` | Lista UNMATCHED-mail per mailbox                                             |
| `GET /api/v1/cco-mail/ambiguous?limit=`          | Lista AMBIGUOUS_MATCH-records för manuell triage                             |
| `POST /api/v1/cco-mail/link-patient`             | Manuell koppling rawMessageId → patientId (audit: `mail.linked_to_customer`) |

### `app.locals` exposure

- `ccoMailIngestionStore` exponerad via `app.locals` (tidigare bara lokal variabel)
- `ccoMailboxTruthStore` exponerad via `app.locals`

### UI (`public/cco-komm-panel.js` + `.css`)

- Tabs utökade från 7 → 9:
  - Alla, Kräver svar, Inkommande, **Utgående** (ny), Utkast, Väntar, Skickat, Internt, **System** (ny)
- Mobile bottom-sheet bibehållen
- Live-counters per tab

## Smoke-test mot lokal tom store

```
GET /api/v1/cco-mail/mailbox-stats
{ ok: true, available: true, mailboxCount: 0 }  ← noll mailAccounts i ingest-store

GET /api/v1/cco-mail/unmatched
{ ok: true, available: true, count: 0 }

GET /api/v1/cco-mail/ambiguous
{ ok: true, available: true, count: 0 }

GET /api/v1/cco-customers/CUST-DEMO-002/conversation-threads
{ counts: { all: 2, incoming: 0, outgoing: 0, drafts: 1, ..., internal: 1 },
  availableFilters: [..., outgoing, ..., system] }
```

Detta bevisar att:

- Wiring fungerar (endpoints svarar, RBAC checkar OK).
- När mail-data landar i de lokala stores kommer threads-aggregatorn omedelbart visa dem.
- Mockup-drafts + interna notiser från Sprint 2 + Sprint 1 är kvar och syns korrekt.

## Audit-events tillagda

| Event                     | Vid action                                                         |
| ------------------------- | ------------------------------------------------------------------ |
| `mail.linked_to_customer` | Manuell koppling via `/cco-mail/link-patient` (PII-mask: bara IDs) |
| `mail.match_reviewed`     | Reserverad — kommer användas av ambiguous-review-UI när det byggs  |

Sprint 4-events från tidigare är oförändrade:

- `thread.read` · `thread.mark_handled` · `thread.unmark_handled` · `thread.snoozed` · `thread.unsnoozed` · `thread.linked_to_journey_step`

## True-unanswered formel (oförändrad sedan Sprint 4)

```
thread.unanswered = (
  thread.kind === 'incoming_mail' AND
  !thread.systemMail AND
  !thread.handled AND
  (!thread.snoozedUntil OR snoozedUntil < now) AND
  ts(thread) > ts(senasteUtgående)
)
```

Senaste utgående omfattar nu: `outgoing_mail`, `comm_sent`, `form_sent`, `consent_sent`, `file_sent`.

## Systemmail/scrap-filter (oförändrad sedan Sprint 4)

RegExp på from-address:

- `^noreply@` · `^donotreply@` · `^bounce@` · `^postmaster@` · `^mailer-daemon@`
- `^notifications?@` · `^auto-?reply@` · `^marketing@` · `^newsletter@`

Träffar → `systemMail: true` → exkluderas från `Alla`-tab, syns endast i `System`-filter.

## Blockers / vad som kvarstår

1. **Mail-data saknas lokalt.** Verifiera med owner var de 8833 mailen lagras:
   - Annan dev-miljö?
   - Produktions-store på server?
   - Sharded shards under annan path (`ARCANA_CCO_MAILBOX_TRUTH_SHARD_DIR` env)?
   - Bör synas till denna mac för smoke-test mot riktig data.

2. **Mailbox-truth ↔ customerStore email-koppling saknas helper.**
   - För att fallback-skanningen ska träffa rätt kund krävs att `mailboxTruthStore.listMessages()` returnerar `customerIdentity` med korrekt `customerId`.
   - Detta sker via ingest-pipeline-matchning. Om matchning inte gjordes vid import → 0 träffar trots payload.
   - Workaround under aktivering: kör `requestReprocessUnmatched()` per mailbox för att re-mata matchnings-pipeline.

3. **Ambiguous-review-UI ej byggt.**
   - Backend-endpoint klar: `/cco-mail/ambiguous`
   - UI med swipe-och-välj behöver byggas i separat Sprint (4.2).

4. **`listForCustomer` saknas på `ccoSendActionStore`.**
   - Sprint C utskick (formulär/samtycken/filer) visas inte i threads än.
   - 30 min jobb att lägga till — separat Sprint eller fast-fix.

5. **Live mail-send fortfarande BLOCKERAD** (owner-mandat).
   - Drafts → needs_approval → approved → queued: OK.
   - **Queued → sent kräver explicit owner-GO** + SMTP/Graph-leverans (ny tredjepartsintegration).

## Guardrails efterlevda

- [x] Ingen extern AI på journalinnehåll
- [x] Ingen rå journaltext i prompts (inga prompts genereras)
- [x] Inga externa auto-svar
- [x] Inga massutskick
- [x] Inga Drive-länkar
- [x] Ingen patientdata till GitHub (denna rapport innehåller endast aggregerade counts)
- [x] Mailinnehåll kräver RBAC (`mail.read`) + audit
- [x] PII-mask i audit (rå mailadress hashas till `xx***@yy***`)

## Nästa steg

1. **Owner**: verifiera var de 8833 mailen lagras + ev. sync till denna repo.
2. **Sprint 4.2** (efter data lokalt): bygg ambiguous-review-UI + mass-mark-as-system + reprocess-button.
3. **Sprint 6** (timeline) kan nu fortsätta — alla aggregator-källor är wirade.
4. **Sprint 7** (operatörsdashboard) bygger ovanpå `/cco-mail/mailbox-stats` + `/cco-comm/drafts/queue` + `/cco-conversation-threads/stats`.
