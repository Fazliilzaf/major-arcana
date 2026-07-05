# CCO Konversationer — backfill-runbook (Fas 1)

Mål: historiska inkommande mail från Microsoft Graph (READ) fyller
Konversationer i `admin#cco`, via befintlig CCO-pipeline. Ingen live-send.

## Kedjan (Graph → UI)

```
Microsoft Graph (READ)
  → mailbox-truth-store        POST /api/v1/cco/runtime/history/backfill
  → ingestion (raw + kö)       POST /api/v1/cco/mail-ingestion/backfill  (read-only, #605)
  → pipeline                   allowlist → brusfilter → dedupe → kundmatchning
                               → conflict/suggested → review (ALDRIG auto-bind)
                               → needsReply/worklist
  → Konversationer i admin#cco (läser truth + state, se endpoint-karta)
```

## Endpoint-karta: vad `admin#cco → Konversationer` läser

`admin#cco` bäddar in `/konversationer.html` (`public/admin.js`,
`CCO_PREVIEW_EMBED_SRC`). Den ytan använder:

| Funktion                                    | Endpoint                                                | Källa                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Trådlista (worklist)                        | `GET /api/v1/cco/runtime/worklist/consumer?mailboxId=…` | truth + customer + conversation-state + ingestion (`capabilities.js`, `ccoMailboxTruthWorklistReadModel`) |
| Tråd (meddelanden)                          | `GET /api/v1/cco/runtime/conversation/:key/messages`    | truth-store (`ccoConversation.js`)                                                                        |
| AI-summary (finns, används ej av ytan idag) | `GET /api/v1/cco/runtime/conversation/:key/summary`     | truth + capability                                                                                        |
| Svarstudio-utkast (ingen send)              | `POST/GET /api/v1/cco-comm/drafts`                      | drafts-store (`konversationer-bottom-actions.js`)                                                         |
| Åtgärdslogg                                 | `POST /api/v1/cco-audit`                                | audit                                                                                                     |
| Bilagor                                     | `GET /api/v1/cco/assets/…`                              | asset-lager (`cco-komm-panel.js`)                                                                         |

## Körning (en brevlåda i taget, start `kons@hairtpclinic.com`)

```bash
# Default host är https://arcana.hairtpclinic.com (den riktiga ytan) och
# default brevlåda är kons@. Explicit env-var rekommenderas ändå vid drift:
ARCANA_PROD_URL=https://arcana.hairtpclinic.com \
node scripts/run-cco-conversations-backfill.js

# Nästa brevlåda (först efter ägar-GO):
ARCANA_MAILBOX=info@hairtpclinic.com node scripts/run-cco-conversations-backfill.js
```

> Obs: `.se`-hosten används inte för Konversationer-drift — kör alltid mot `.com`.

Skriptet kör fyra faser och skriver PASS/STOP + JSON-bevis:

1. **Truth (inbox):** `history/status` → rundor av `history/backfill`
   (enbart `inbox` — scope är inkommande mail) tills materialiserad.
2. **Ingestion-backfill:** `POST /cco/mail-ingestion/backfill` —
   allowlist-gated, `mode` hårdlåst `read_only` i workern.
3. **Jobbföljning:** `GET /cco/mail-ingestion/status` → fas + räkneverk
   (fetched/saved/duplicates/processed/failed).
4. **Bevis mot UI-endpointen:** `worklist/consumer` före/efter — antal trådar,
   needsReply, exempelrader (conversationKey, brevlåda, senaste inkommande,
   needsReply, kundmatch-status; **aldrig ämnen/brödtext**).

## Säkert stopp

- 4xx (t.ex. **403 = brevlådan inte allowlistad**) är slutgiltiga — inga retries.
- 3 konsekutiva truth-fel → STOP. Graph rate-limit (429) sänker tröskeln
  till 2 och trefaldigar backoffen.
- STOP lämnar allt konsistent: materialiserad truth-data ligger kvar och
  **omkörning är idempotent** (dedupe på `internetMessageId`/graph-id).

## Garantier (testlåsta)

| Garanti                                                                      | Test                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| 403 för icke-allowlistad brevlåda (alla ingest-endpoints)                    | `tests/ops/ccoMailIngestionBackfill.test.js`            |
| Backfill hårdlåst read_only (mode i body ignoreras)                          | `tests/ops/ccoMailIngestionBackfill.test.js`            |
| Hela kedjan truth→raw→pipeline-ledger→tom kö, idempotent omkörning           | `tests/ops/ccoMailIngestionBackfill.test.js` (e2e)      |
| Conflict/suggested → review, aldrig auto-bind (`patientId: null`)            | `tests/ops/ccoMailIngestionConflictReview.test.js` (B2) |
| Skriptets täcknings-/jobb-/worklist-tolkning + stopp-logik + integritetsfält | `tests/ops/ccoConversationsBackfillScript.test.js`      |

## Efterkontroll i UI

Öppna `admin#cco → Konversationer`: trådarna ska synas med brevlådan kunden
mailade till, senaste inkommande och needsReply. Tvetydiga kundmatchningar
ligger i review-kön (`GET /api/v1/cco/mail-ingestion/review-queue`) och binds
manuellt där — aldrig automatiskt.
