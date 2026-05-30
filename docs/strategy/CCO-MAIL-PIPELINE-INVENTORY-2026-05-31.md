# CCO Mail Pipeline — Full inventory

Sprint 17 · Datum: 2026-05-31 · Verifierar att hela mail-pipelinen i preview-SPA är aktiv i nya CCO.

## Sammanfattning

**Allt finns redan i arcana.** Inget behöver porteras. Top-nav `Konversationer` → `/major-arcana-preview/?view=conversations` aktiverar hela pipelinen.

## Pipeline-stack

### 1. Frontend smart-funktioner (`public/major-arcana-preview/app/`)

| Modul                   | Funktion                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system-mail-parser.js` | Extraherar kundnamn från no-reply/system-mejl (Cliento, GetAccept, etc.) — visar `customerName` + `systemLabel`-pill istället för "Okänd avsändare" |
| `thread-ai-summary.js`  | AI-sammanfattning per tråd via `/cco/runtime/conversation/:key/summary` med debounce 450ms, cache, smart_reply feature-flag                         |
| `mock-worklist-api.js`  | Worklist API mock för dev/preview                                                                                                                   |
| `inbox-streak.js`       | Inbox achievement-tracking (streaks/goals)                                                                                                          |
| `thread-cache-idb.js`   | IndexedDB cache för tråd-data (offline-tolerant)                                                                                                    |
| `maintenance-banner.js` | Banner för planerade underhåll/incident                                                                                                             |

### 2. Backend mail-routes (`src/routes/`)

#### `ccoConversation.js` — 15+ endpoints (auth-protected)

| Endpoint                                      | Syfte                                |
| --------------------------------------------- | ------------------------------------ |
| `GET /cco/runtime/conversation/:key/messages` | Lista mail i tråd                    |
| `GET /cco/runtime/conversation/:key/summary`  | AI-sammanfattning (smart_reply-flag) |
| `GET /cco/runtime/conversation/:key/bookings` | Kopplade bokningar                   |
| `GET /cco/runtime/conversation/:key/notes`    | Interna notiser per tråd             |
| `POST /cco/runtime/conversation/:key/notes`   | Skapa intern notis                   |
| `GET /cco/runtime/health/mailboxes`           | Mailbox-hälsa (sync-status, fel)     |
| `GET /cco/runtime/dashboard`                  | Operatörsdash-data (cross-customer)  |
| `GET /cco/runtime/settings/info`              | Tenant-settings för UI               |
| `GET /cco/runtime/mail-templates`             | Lista mallar (för Svarstudio)        |
| + 5 POST-endpoints                            | Send, ack, status-uppdateringar      |

#### `mailInsights.js` — Insights API

| Endpoint                      | Syfte                                    |
| ----------------------------- | ---------------------------------------- |
| `GET /cco/mail-insights/...`  | Aggregerad insights (volym, churn, etc.) |
| `POST /cco/mail-insights/...` | Trigger om-analys                        |

#### `ccoMailIngestion.js` — 11 ingest-endpoints (owner-only)

| Endpoint                                           | Syfte                        |
| -------------------------------------------------- | ---------------------------- |
| `GET /cco/mail-ingestion/status`                   | Sync-status per mailbox      |
| `GET /cco/mail-ingestion/dashboard/readout`        | Dashboard summary            |
| `GET /cco/mail-ingestion/review-queue/summary`     | Unmatched/ambiguous counts   |
| `GET /cco/mail-ingestion/review-queue`             | Lista mail som kräver review |
| `POST /cco/mail-ingestion/resolve-unmatched-sweep` | Bulk-resolve unmatched       |
| `POST /cco/mail-ingestion/reprocess-unmatched`     | Re-mata matchnings-pipeline  |
| `POST /cco/mail-ingestion/sync`                    | Manuell sync från Graph      |
| `POST /cco/mail-ingestion/process` / `process-all` | Bearbeta queue               |
| `POST /cco/mail-ingestion/reset`                   | Reset state för mailbox      |
| `POST /cco/mail-ingestion/subscriptions/ensure`    | MS Graph webhook setup       |

### 3. Backend mail-ops (`src/ops/`) — 21 moduler

**Truth-stores** (mailbox sanning):

- `ccoMailboxTruthStore.js` — monolitisk store
- `ccoMailboxTruthShardedStore.js` — per-mailbox shards
- `ccoMailboxTruthStoreFactory.js` — factory
- `ccoMailboxTruthReadAdapter.js` — read-only adapter
- `ccoMailboxTruthRestore.js` — restore från backup
- `ccoMailboxTruthWorklistReadModel.js` + `WorklistShadow.js` — worklist-vy

**Ingest-pipeline** (`ccoMailIngestion/`):

- `pipeline.js` — discover → dedupe → classify → match → store → audit
- `dedupe.js` — dedupe-index per mailbox
- `nonPatientRules.js` — system-mail-filter (noreply, marketing, etc.)
- `resolveUnmatched.js` — manuell + auto-match
- `syncService.js` — Graph delta-sync
- `worker.js` — bakgrunds-processor
- `store.js` — raw-mail + ledger + patient-matches
- `constants.js` — versioner

**Mail-parsing**:

- `ccoMailContentParser.js` — extrahera body/subject/headers
- `ccoMailDocument.js` — canonical document-modell
- `ccoMailMimeLayer.js` + `MimeParser.js` — MIME-parsing
- `ccoMailAssetLayer.js` — attachments
- `ccoMailThreadHydrator.js` — bygger thread-document från messages

**Compose & dispatch**:

- `ccoMailComposeDocument.js` — utgående mail-modell
- `ccoCommercialMailDispatch.js` — kommersiella send-actions
- `ccoMailTemplateStore.js` — mallar (separat från Sprint 2 Svarstudio-templates)
- `ccoMailboxSettingsDocument.js` — per-mailbox settings

**Conversation-state**:

- `ccoConversationStateStore.js` — tråd-state (read/handled/etc.)
- `ccoConversationNotesStore.js` — interna notiser

**Cross-mailbox**:

- `crossMailboxAggregator.js` — cross-mailbox unified view
- `ccoInboxEnrichmentCoverage.js` — berikningstäckning

### 4. Graph-integration (`src/infra/`)

- `microsoftGraphMailboxTruth.js` — Graph → truth-store
- `microsoftGraphMailboxTruthBackfill.js` — initial backfill
- `microsoftGraphMailboxTruthDelta.js` — delta-sync (varje 3 min via cron)
- `microsoftGraphReadConnector.js` — read-only adapter

## Smart-funktioner per mail som ankommer

När ett mail kommer in genom Graph delta-sync körs **automatiskt**:

1. **MIME-parsing** (ccoMailMimeParser) → headers, body, attachments
2. **Content-parsing** (ccoMailContentParser) → subject, snippet, conversationId
3. **System-mail-filter** (nonPatientRules) → noreply/marketing/bounce flaggas som scrap
4. **System-mail-parser** (system-mail-parser.js, frontend) → extraherar kundnamn från subject vid no-reply
5. **Dedupe** (dedupe.js) → blockerar duplikat via graphMessageId
6. **Patient-matching** (resolveUnmatched) → matchar mot customerStore via email/personnr/conversation-history
   - MATCHED → kopplar rawMessageId → patientId
   - UNMATCHED → läggs i review-queue
   - AMBIGUOUS → flera kandidater, manuell review krävs
   - SECURITY_REVIEW → potentiell PII-läcka, owner-review
7. **Thread-hydration** (ccoMailThreadHydrator) → bygger thread-document från relaterade messages
8. **Berikning** (ccoInboxEnrichmentCoverage) → adderar derived metadata
9. **AI-sammanfattning** (thread-ai-summary.js) → cachas, debouncas, smart_reply-flag
10. **Worklist-aggregering** (WorklistReadModel) → grupperar per ansvar/SLA/prioritet
11. **Audit** → varje steg auditas i mailProcessingLedger

## Aktivering i nya CCO

Sprint 17-fix:

- Top-nav `Konversationer` i `kunder.html`, `kalender.html`, `operator-dashboard.html` → pekar nu till `/major-arcana-preview/?view=conversations`
- Hela pipelinen aktiveras automatiskt när användaren går dit

Nuvarande integration i kunder.html:

- Sprint 4 `cco-komm-panel.js` thread-view använder `ccoMailIngestionStore.listPatientMessages` (frontend-helper Sprint 4.1)
- Sprint 4.1 review-endpoints `/cco-mail/unmatched`, `/cco-mail/ambiguous`, `/cco-mail/mailbox-stats` är nya wrappers ovanpå existing ingest-store

## Vad detta betyder för slutanvändaren

| Use case                                                | Var den lever                                               |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| Operatör vill se alla inkomna mail med Svarstudio       | `/major-arcana-preview/?view=conversations` (full pipeline) |
| Operatör vill se en kunds mail-historik i patientkortet | `/kunder.html` dossier → Komm-panel thread-view (Sprint 4)  |
| Operatör vill skapa snabbt utkast från template         | komm-panel Svarstudio modal (Sprint 2 + 11)                 |
| Operatör vill batch-godkänna 10 utkast                  | komm-panel batch-bar (Sprint 9)                             |
| Owner vill se mail-ingest-status / unmatched-queue      | `/major-arcana-preview/` → ingestion-dashboard              |
| Cron vill skapa dry-run-proposals                       | Sprint 3 `/api/v1/cco-comm/cron/*`                          |

## Säkerhet

Alla mail-routes har:

- **Auth** via `authMiddleware` (admin-token) eller `attachRole + requirePermission` (RBAC)
- **Owner-only på ingest-endpoints** (`ROLE_OWNER`)
- **Audit** via mailProcessingLedger för varje state-transition
- **PII-mask** i logs (email-adresser hashas)
- **No external AI på journal-content** (AI bara på mail-subject/snippet)
- **No live external send** (vissa endpoints är send-routes men gated bakom owner-GO)

## Inget att porta

Min Sprint 17-uppgift: **bekräfta att allt finns + aktivera**. Inget kodas om.

Konkret leverans:

1. Top-nav-länkar fixade (commit `5148aa6e`)
2. Denna inventory-rapport
3. Existing pipeline orörd och fortsatt aktiv
