# CCO Mail Pipeline — Coverage & Activation Plan

Datum: 2026-06-01 · Spår: Mail-pipeline / filter / smarta funktioner  
Drive safe-match: **stängd** (parallellt spår, rör ej Drive-import)

## Executive summary

Mail finns **importerat i prod ingestion-store** (8 833 råmeddelanden, 3 240 kundmatchade).  
Pipelinen är **byggd men inte fullt aktiverad**:

| Lager                                   | Status                                                  |
| --------------------------------------- | ------------------------------------------------------- |
| **Ingestion** (`cco-mail-ingestion`)    | ✅ 8 833 mail på prod                                   |
| **Mailbox truth** (`cco-mailbox-truth`) | ✅ 33 344 meddelanden (prod, Graph + hydration overlay) |
| **Worklist / Konversationer**           | ⚠️ Enrichment coverage ~0,1% — worklist tom             |
| **Kundkort / komm-panel**               | 🔄 Fas B truth-first read model (deploy pending)        |
| **Enrichment** (`AnalyzeInbox`)         | ⚠️ 9 338 truth-konversationer, 9 enriched               |
| **Operator state** (handled/snooze)     | ❌ 0 poster på prod                                     |

**Huvudblocker (2026-06-01 initial):** Ingestion och truth lever i **två separata lager**. Konversations-UI och enrichment läser primärt truth; kundkort läser ingestion. Ingen ny import behövs — wire + truth-hydration från befintlig ingestion.

---

## Addendum 2026-06-01 — Post hydration (Fas A) + Activation start

| Lager                   | Status (prod)                                              |
| ----------------------- | ---------------------------------------------------------- |
| **Ingestion**           | ✅ 8 833 mail, 3 240 matched                               |
| **Mailbox truth**       | ✅ 33 344 meddelanden (Graph-backfill + hydration overlay) |
| **Hydration overlay**   | ✅ 3 520 customerIdentity från ledger                      |
| **Enrichment**          | ⚠️ 9 / 9 338 konversationer (0,1%)                         |
| **Kundkort read model** | 🔄 Fas B truth-first (deploy pending)                      |

Se [CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md](./CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md) och [CCO-MAIL-PIPELINE-ACTIVATION-2026-06-01.md](./CCO-MAIL-PIPELINE-ACTIVATION-2026-06-01.md).

---

## Steg 1 — Mail pipeline coverage

Källa: prod API (`arcana.hairtpclinic.com`) 2026-06-01, read-only.  
Script: `node scripts/report-mail-pipeline-coverage.js --json`

### Volym per mailbox

| Mailbox                  | Mail totalt | Kundmatchade | Unmatched | Ambiguous | Failed |
| ------------------------ | ----------: | -----------: | --------: | --------: | -----: |
| contact@hairtpclinic.com |       5 366 |        2 720 |         0 |         0 |      0 |
| egzona@hairtpclinic.com  |       2 280 |          397 |         0 |         0 |      0 |
| fazli@hairtpclinic.com   |         598 |           29 |         0 |         0 |      0 |
| info@hairtpclinic.com    |         250 |           67 |         0 |         0 |      0 |
| kons@hairtpclinic.com    |         188 |            4 |         0 |         0 |      0 |
| marknad@hairtpclinic.com |         151 |           23 |         0 |         0 |      0 |
| receipt@hairtpclinic.com |           0 |            0 |         0 |         0 |      0 |
| **Totalt**               |   **8 833** |    **3 240** |     **0** |     **0** |  **0** |

Övriga ledger-statusar:

| Status                             | Antal | Tolkning                                    |
| ---------------------------------- | ----: | ------------------------------------------- |
| `DUPLICATE_SKIPPED`                | 5 593 | Dedupe (samma binär/conversation sedd igen) |
| `MATCHED`                          | 3 240 | Säker kundmatch via email → patient master  |
| `UNMATCHED`                        |     0 | —                                           |
| `NEEDS_REVIEW` / `SECURITY_REVIEW` |     0 | —                                           |
| `FAILED`                           |     0 | —                                           |

**System/scrap:** Filtreras i pipeline (`nonPatientRules`, `classifyConversationMessage`) men räknas inte separat i dashboard — ingår i duplicates + icke-matchade råmeddelanden utan patientId.

### Trådar

| Metric                                     |        Värde | Källa                                                         |
| ------------------------------------------ | -----------: | ------------------------------------------------------------- |
| Råmeddelanden                              |        8 833 | ingestion ledger                                              |
| Unika trådar (uppskattning)                |      **TBD** | Kräver `conversationId`-gruppering på prod ledger             |
| Truth conversation rows                    |        **0** | `cco-mailbox-truth` tom                                       |
| Enrichment worklist (senaste AnalyzeInbox) | 120 (sample) | `capability-analysis.json` — Graph-snapshot, ej full historik |

### Operator-status (prod)

| Metric                     |                                                          Värde |
| -------------------------- | -------------------------------------------------------------: |
| true_unanswered (worklist) | **TBD** — kräver truth + enrichment eller ingestion-gruppering |
| handled                    |                                                              0 |
| snoozed                    |                                                              0 |
| needs_action               |          0 (mail-lager; booking-modul har egen `needs_action`) |
| thread state records       |                                                              0 |

### Kundtäckning

| Metric                     | Värde                                                  |
| -------------------------- | ------------------------------------------------------ |
| Kundmatchade mail          | 3 240                                                  |
| Unika kunder med mail      | **TBD** — kräver `distinct(patientId)` på prod ledger  |
| Kunder med flera mailboxar | **TBD** — `crossMailboxAggregator` på matched messages |

**Spot-check (prod):** Kund `2726bc83-308a-4661-8b37-1d1647a2d76a` (Albert) → **2 trådrader** via `/conversation-threads` (1 in + 1 ut, samma conversationId). Kundkort-koppling fungerar för matchade kunder.

### Lokal vs prod

| Store                      | Lokal mac                             | Prod                  |
| -------------------------- | ------------------------------------- | --------------------- |
| `cco-mail-ingestion.json`  | 0 mail                                | 8 833 mail            |
| `cco-mailbox-truth/`       | 0 mail                                | 0 mail                |
| `capability-analysis.json` | 58 MB (AnalyzeInbox sample 120 rader) | delad via Render disk |

---

## Filter / lanes — vad som finns vs saknas

### Gamla CCO-lanes → nya CCO

| Gammal lane (UI) | Ny kod / källa               |   Finns i truth?    | Finns i enrichment? |   Finns på kundkort?    |
| ---------------- | ---------------------------- | :-----------------: | :-----------------: | :---------------------: |
| Alla             | `all`                        |     ✅ default      |         ✅          |         ✅ tab          |
| Agera nu         | `act-now` / `action_now`     |    ✅ (SLA ≥24h)    |         ✅          |     via status chip     |
| Sprint           | `sprint`                     |     ❌ overlay      |         ✅          |       ❌ egen tab       |
| Senare           | `later`                      | ✅ (operator state) |         ✅          | via snooze/later action |
| Admin            | `admin` / `admin_low`        |     ❌ overlay      |         ✅          |           ❌            |
| Granskning       | `review`                     |  ✅ (needsReview)   |         ✅          |       ❌ egen tab       |
| Oklart           | `unclear`                    |     ❌ overlay      |         ✅          |           ❌            |
| Eftervård        | `aftercare`                  |     ❌ overlay      |         ✅          |           ❌            |
| Operation        | `operation`                  |     ❌ overlay      |         ✅          |           ❌            |
| Commercial       | `commercial`                 |     ❌ overlay      |         ✅          |           ❌            |
| Bokning          | `bookable` / `booking_ready` |     ❌ overlay      |         ✅          |    via booking-modul    |
| Medicinskt       | `medical` / `medical_review` |     ❌ overlay      |         ✅          |           ❌            |
| Skickade         | `sent` / `sent_feed`         |      ✅ folder      |         ✅          |         ✅ tab          |
| Historik         | `history`                    |      ✅ action      |         ✅          |        ✅ action        |
| Svarstudio       | `studio` mode                |      ✅ action      |         ✅          |        ✅ modal         |
| Klar             | `handled` / `done`           |      ✅ state       |         ✅          |     status, ej tab      |
| Radera           | `delete`                     |      ✅ action      |         ✅          |        ✅ action        |

**Truth-only lanes:** `act-now`, `review`, `later`, `all`  
**Enrichment-only lanes:** `sprint`, `bookable`, `medical`, `admin`, `unclear`, `aftercare`, `commercial`, `operation`, `consultation`

**Sekundära signal-filter (chips):** `high-risk`, `today`, `tomorrow`, `unassigned`, `followup` — definierade i `runtime-queue-renderers.js`, kräver enrichment.

### Kundkort-filter (komm-panel)

Finns: `all`, `unanswered`, `incoming`, `outgoing`, `drafts`, `needs_approval`, `sent`, `internal`, `system`  
Saknas som tab: `handled`, `snoozed` (finns som thread-status, ej filter-tab)

---

## Smarta signaler

| Signal                | Backend                                               | UI                  | Prod-status                                    |
| --------------------- | ----------------------------------------------------- | ------------------- | ---------------------------------------------- |
| **SLA**               | `slaMonitor.js`, `analyzeInbox` → `slaStatus`         | SLA-chip, focus     | ✅ i AnalyzeInbox sample (120/120)             |
| **Risk**              | `riskStackEngine.js` → `dominantRisk`                 | `high-risk` chip    | ✅ sample (120/120)                            |
| **Owner**             | enrichment `ownerLabel`                               | `unassigned` filter | ❌ sample 0/120                                |
| **Next action**       | `recommendedAction`, conversation state               | focus actions       | ✅ sample (120/120)                            |
| **Focus**             | `FOCUS_SIGNALS`, `whyInFocus`                         | focus panel         | ❌ sample 0/120                                |
| **Smart summary**     | `thread-ai-summary.js` → `/conversation/:key/summary` | debounced AI        | ⚠️ kräver truth thread key                     |
| **Svarstudio status** | draft store + runtime reply                           | studio panel        | ⚠️ komm-modal OK; preview SPA kräver truth key |

Senaste enrichment-körning mot **truth:** 0 conversations → **coveragePercent 100 men gapCount 0** (vacuously true). Worklist redo-flagga är missvisande tills truth hydreras.

---

## Steg 2 — Koppla mail till kundkort (målbild)

Allt som **säkert matchar kund** ska visas på kundkortet:

| Fält                        | Finns idag? | Wire-gap                                                              |
| --------------------------- | :---------: | --------------------------------------------------------------------- |
| Senaste inkommande          |     ⚠️      | `listPatientMessages` — per-message, ej dedupead tråd                 |
| Senaste utgående            |     ⚠️      | Samma                                                                 |
| Mailbox-källa               |     ✅      | `mailboxId` på thread                                                 |
| true unanswered             |     ⚠️      | Logik finns; Albert-case visar `unanswered: false` trots oläst in     |
| handled / snoozed           |   ✅ API    | 0 state på prod                                                       |
| needs_action                |   ❌ mail   | Bara booking-modul                                                    |
| Länk till tråd              |     ❌      | Ingen deep-link till `/major-arcana-preview/?view=conversations&key=` |
| Source mailbox badge        |     ⚠️      | Finns i data, saknas visuellt i komm-lista                            |
| Multi-mailbox consolidation |     ❌      | `crossMailboxAggregator` ej inkopplad i komm-panel                    |

**Befintlig wiring:** `cco-komm-panel.js` → `GET /api/v1/cco-customers/:id/conversation-threads` → `ccoConversationThreadStore` → `mailIngestionStore.listPatientMessages` (fallback: truth).

---

## Steg 3 — Behåll gamla filtertänket

Mappa enrichment `workflowLane` → UI `QUEUE_LANE_ORDER` i `runtime-config.js`:

```
action_now      → act-now
booking_ready   → bookable
medical_review  → medical
admin_low       → admin
waiting_reply   → later (eller review)
```

**Activation:** Kör `AnalyzeInbox` mot **hydrerad truth** (eller ingestion-adapter), inte mot tom truth. Shadow-läge (`WORKLIST_TRUTH_VIEW.relayMode: legacy_advisory_only`) ska uppgraderas till `truth_primary` när truth ≥ ingestion.

---

## Steg 4 — Svarstudio + Smart anteckning + Bokning + Kalender

| Yta                         | Route / fil                                              | Kontext som skickas                 | Status                        |
| --------------------------- | -------------------------------------------------------- | ----------------------------------- | ----------------------------- |
| Svarstudio (kundkort)       | `cco-komm-panel.js` → modal                              | customerId, templates, preset       | ✅ öppnar                     |
| Svarstudio (konversationer) | `app.js` studio + `/cco/runtime/conversation/:key/reply` | conversation key, mailbox, signatur | ⚠️ kräver truth key           |
| Smart anteckning            | `/smart-anteckning.html?patientId=`                      | patientId                           | ✅ från kalender/konversation |
| Bokningsyta                 | `/cco/runtime/conversation/:key/bookings`                | thread + customer                   | ⚠️ truth key                  |
| Kalender                    | `cco-kalender-bridge.js`                                 | patientId, defferar Svarstudio      | ✅                            |

**Krav för full kontext:** kund, tråd, mailbox, senaste meddelande, SLA, next action, signatur, mall, human approval — alla fält finns i runtime/conversation-routes **när thread key är truth-baserad**.

---

## Activation plan (ordning)

### Fas A — Truth hydration (ingen ny import)

1. **Backfill truth från befintlig ingestion** — materialisera `mailRawMessages` → `ccoMailboxTruthStore` shards (read-only copy, behåll dedupe).
2. Verifiera `GET /cco/runtime/health/mailboxes` → `totalMessages > 0`.
3. Kör **inte** ny Graph full-sync om ingestion redan har 8 833.

### Fas B — Enrichment + worklist

4. Kör `AnalyzeInbox` capability mot hydrerad truth.
5. Verifiera `GET /ops/cco/enrichment/coverage` → `truthConversationCount > 0`, `coveragePercent ≥ 99.5%`.
6. Aktivera worklist consumer i preview SPA (`/major-arcana-preview/?view=conversations`).

### Fas C — Kundkort polish

7. **Tråd-gruppering** i `ccoConversationThreadStore` — merge in+ut med samma `conversationId` till en rad.
8. **Mailbox badge** + **deep-link** till konversationsvy per tråd.
9. **Multi-mailbox rollup** via `crossMailboxAggregator` på kundkort header.
10. Synka `tenantId` (`hair_tp` vs `hair-tp-clinic`) i alla komm-anrop.

### Fas D — Operator state

11. Migrera befintlig handled/snooze från gamla CCO om export finns; annars börja fresh med truth keys.
12. Exponera `handled` / `snoozed` som filter-tabs i komm-panel (valfritt).

---

## Exakta wire-fixar (prioriterad lista)

| #   | Fix                                    | Fil(er)                                                                                       | Varför                                           |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | **Hydrate truth from ingestion**       | nytt script `scripts/hydrate-mailbox-truth-from-ingestion.js` + `ccoMailboxTruthShardedStore` | Konversationer + enrichment läser truth          |
| 2   | **Fix health endpoint**                | `ccoConversation.js` health handler                                                           | Rapporterar 0 trots ingestion                    |
| 3   | **Thread merge by conversationId**     | `ccoConversationThreadStore.js`                                                               | Dubbla rader in/ut (Albert-case)                 |
| 4   | **Deep-link tråd → preview**           | `cco-komm-panel.js`                                                                           | "Öppna tråd" i konversationsflöde                |
| 5   | **Mailbox badge**                      | `cco-komm-panel.js` + CSS                                                                     | Synlig mailbox-källa                             |
| 6   | **Enrichment re-run trigger**          | scheduler / ops endpoint                                                                      | Fyll worklist-lanes efter truth hydration        |
| 7   | **Lane map normalize**                 | `app.js` + `runtime-config.js`                                                                | `action_now` ↔ `act-now` inkonsistens            |
| 8   | **crossMailboxAggregator on kundkort** | `server.js` communication-feed                                                                | Multi-mailbox consolidation                      |
| 9   | **Owner signal backfill**              | `analyzeInbox.js`                                                                             | Owner 0/120 i sample                             |
| 10  | **Distinct customer count endpoint**   | `ccoMailIngestion` ops readout                                                                | Coverage KPI utan ledger-scan i UI               |
| 11  | **Local prod data parity**             | sync Render disk → lokal `./data` för dev                                                     | Lokal mac har 0 mail idag                        |
| 12  | **Unanswered logic review**            | `ccoConversationThreadStore.js`                                                               | Albert: inbound efter outbound men ej unanswered |

---

## Regler (oförändrade)

- Bygg inte nytt fristående mailsystem
- Importera inte om mail redan finns (8 833 finns)
- Rå mailtext ska inte in i rapporter
- Ingen patientdata i GitHub
- Ingen extern AI på journaldata
- CCO = system of record
- Mail ska visas på kundkortet och i konversationer, inte leva separat

---

## Verifiering efter activation

1. `node scripts/report-mail-pipeline-coverage.js` → truthMessages > 0, enrichment gap real
2. Prod: `/cco-mail/mailbox-stats` oförändrat (ingen dubbelimport)
3. Kundkort: 3 testkunder med mail visar trådar, mailbox badge, unanswered
4. Konversationer: lanes matchar gamla CCO-filter
5. Svarstudio: öppnas från både kundkort och konversationskö med rätt signatur/mall

---

## Relaterade dokument

- `docs/strategy/CCO-MAIL-PIPELINE-INVENTORY-2026-05-31.md` — full stack-inventering
- `docs/strategy/COMMUNICATION-MAIL-COVERAGE-REPORT-2026-05-30.md` — Sprint 4.1 wiring
- `scripts/report-mail-pipeline-coverage.js` — upprepa denna coverage
