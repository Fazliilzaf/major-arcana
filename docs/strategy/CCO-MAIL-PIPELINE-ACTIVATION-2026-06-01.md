# CCO Mail Pipeline Activation

**Datum:** 2026-06-01  
**Scope-bas:** [CCO-SYSTEM-SCOPE.md](./CCO-SYSTEM-SCOPE.md)  
**Importordning:** Cliento → halso@ → GetAccept → Drive safe-match ✅ → **Mail pipeline** (aktivt spår)  
**Regler:** Ingen ny mail-import · CCO = system of record · säker match → kundkort · osäker → review queue · inga Drive-länkar · ingen patientdata i GitHub

---

## Statusöversikt

| Steg | Beskrivning                                | Status                                                 |
| ---- | ------------------------------------------ | ------------------------------------------------------ |
| 1    | Pipeline coverage (prod read-only)         | ✅ Rapport uppdaterad                                  |
| 2    | Truth hydration från ingestion             | ✅ 3 520 customerIdentity-overlays (Fas A)             |
| 3    | Lanes / filter / SLA / risk / needs_action | ⚠️ Truth-only re-backfill **77,5%** — gap 2105 kvar    |
| 4    | Mail → kundkort (truth-first read model)   | ✅ Kod klar (deploy pending)                           |
| 5    | Svarstudio / Smart anteckning trådkontext  | ⚠️ Delvis (replyTo + mailboxBadge; enrichment pending) |
| 6    | Multi-mailbox-koppling                     | ✅ summary.mailboxes + UI-banner                       |
| 7    | Rapporter per steg                         | ✅ Detta dokument + under-rapporter                    |

---

## Steg 1 — Pipeline coverage (2026-06-01 prod)

Källa: `node scripts/report-mail-pipeline-coverage.js --json`

| Lager                  |          Prod |
| ---------------------- | ------------: |
| Ingestion raw          |         8 833 |
| Ingestion matched      |         3 240 |
| Ingestion unmatched    |             0 |
| Truth messages         |        33 344 |
| Truth conversations    |         9 338 |
| Enriched conversations | 7 233 (77,5%) |
| Operator thread states |             0 |

**Tolkning:** Mail finns i både ingestion och Graph-truth. Hydration kopplade ledger-kundId till truth. Truth-only re-backfill (2026-06-01 kväll) återställde enrichment + worklist men nådde inte 99,5%-tröskeln — gap kvarstår främst på `egzona@` (saknar graphMessageId på truth-meddelanden).

Detalj: [CCO-MAIL-PIPELINE-COVERAGE-2026-06-01.md](./CCO-MAIL-PIPELINE-COVERAGE-2026-06-01.md) (addendum nedan).

---

## Steg 2 — Truth hydration

**Status:** ✅ Klar (ingen ny import)

| Metric                   |      Värde |
| ------------------------ | ---------: |
| Customer overlay skrivna |      3 520 |
| Ingestion SHA            | oförändrad |
| Customer mismatch        |          0 |

Detalj: [CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md](./CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md)

---

## Steg 3 — Lanes / filter / SLA / risk / needs_action

**Status:** ⚠️ Worklist aktiv men `readyForWork=false` (77,5% < 99,5%)

| Signal                     |     Prod (post truth-only re-backfill) |
| -------------------------- | -------------------------------------: |
| Enriched conversations     |                                  7 233 |
| Gap                        |                                  2 105 |
| Coverage                   |                             **77,46%** |
| `readyForWork`             |                                  false |
| Consumer worklist (rollup) |                              201 rader |
| `act-now` lane             |                                    288 |
| `needsReplyCount`          |                                    369 |
| `actNowCount`              |                                    288 |
| Final persist entry        | `0689f147-acad-4fd6-b0f8-f39a62c94874` |

**Nästa:** Claude read-only klassificering av gap-export (2105 rader) — **inte** ny mail-import, **inte** blind restore.

---

## Steg 4–6 — Read model (Fas B, kod)

**Ändringar (branch `compliance/pipedrive-pii-purge`):**

- `ccoConversationThreadStore`: **truth-first** merge (truth + ingestion complement, dedupe på graphMessageId)
- API `/cco-customers/:id/conversation-threads` returnerar `summary` + `mailboxes`:
  - `latestInboundAt` / `latestOutboundAt`
  - `trueUnanswered`, `needsAction`, `handled`, `snoozed`
  - `multiMailbox`, `mailboxes[]`
- `cco-komm-panel.js`: mailbox-badge per rad + multi-mailbox-banner
- Preview: endast `bodyPreview`/snippet (max 140 tecken) — ingen rå body
- Tester: `tests/ops/ccoConversationThreadStore.test.js`

**Deploy:** Push + Render deploy `arcana` (Frankfurt) — samma tjänst som Fas A hydration.

---

## Blockers & regler

| Regel                       | Efterlevnad                                        |
| --------------------------- | -------------------------------------------------- |
| Ingen ny mail-import        | ✅                                                 |
| Säker match → kundkort      | ✅ via truth customerIdentity + ingestion ledger   |
| Osäker match → review queue | ✅ ingestion unmatched = 0; nya kunder skapas inte |
| Inga Drive-länkar           | ✅                                                 |
| Ingen patientdata i GitHub  | ✅ rapporter utan råtext                           |
| Enrichment full prod        | ✅ Truth-only re-backfill körd; gap export klar    |

---

## Nästa steg

1. **Claude:** Klassificera `data/imports/mail-enrichment-gap-export-2026-06-01.json` (A/B/C/D)
2. **Cursor (efter klassificering):** denominator-exkludering och/eller fallback-enrich enligt beslut
3. **Fas B (endast om `readyForWork=true`):** Wire kundkort + Svarstudio + Smart anteckning mot enrichment worklist

---

## Addendum — Truth-only re-backfill GO (2026-06-01 kväll)

**Deploy:** `cb04cad6` → Render `dep-d8f01g9kh4rs73eo7abg` (Frankfurt)  
**Mode:** truth-only · ingen Graph-fetch · ingen ny mailimport

### Körordning

| Steg            | Resultat                                                     |
| --------------- | ------------------------------------------------------------ |
| 1. Snapshot     | ✅ `/var/data/backups/pre-enrichment-backfill-2026-06-01/`   |
| 2. Plan         | 9338 truth · 9338 eligible · 0 enriched före körning         |
| 3. Canary (500) | ✅ 442 enriched · 0 batch-fail · checkpoint only             |
| 4. Full         | ✅ 7233 enriched · stall + `maxBatchRounds=500`              |
| 5. Gap export   | ✅ `data/imports/mail-enrichment-gap-export-2026-06-01.json` |

### Prod metrics (efter full)

| Metric                  |      Värde |
| ----------------------- | ---------: |
| Coverage                | **77,46%** |
| Enriched                |      7 233 |
| Gap                     |      2 105 |
| `readyForWork`          |      false |
| Worklist rollup rows    |        201 |
| Cross-mailbox customers |         69 |
| Batch failures          |    0 (<1%) |
| CustomerId mismatch     |          0 |
| Duplicate explosion     |        nej |

### Per-mailbox coverage

| Mailbox  | Truth | Enriched |      Gap |  Coverage |
| -------- | ----: | -------: | -------: | --------: |
| fazli@   |  4744 |     4559 |      185 |     96,1% |
| contact@ |  2367 |     1895 |      472 |     80,1% |
| kons@    |   132 |      131 |        1 |     99,2% |
| marknad@ |    34 |       30 |        4 |     88,2% |
| info@    |    75 |       64 |       11 |     85,3% |
| egzona@  |  1986 |      554 | **1432** | **27,9%** |

### Blockers

- Full pass träffade `maxBatchRounds=500` med stall (rowCount fast 7724 sista ~6 batchar)
- Kvarvarande gap: primärt `egzona@` — truth-meddelanden saknar `graphMessageId` (truth-only kan inte berika)
- Gap-export bucket `missing_graphMessageId` (100%) — detaljfält (`isSystemScrap`, `messageClassification`) ger finare klassificering för Claude

### Stoppvillkor

| Villkor              | Utlöst?          |
| -------------------- | ---------------- |
| Coverage backar      | nej (0% → 77,5%) |
| CustomerId mismatch  | nej              |
| Duplicate explosion  | nej              |
| Truth/worklist skada | nej              |
| Failed > 1%          | nej              |
| Raw mail i rapport   | nej              |

**Fas B:** ⏸ tills `readyForWork=true` eller owner beslut efter gap-klassificering.

---

## Addendum — Enrichment full backfill (2026-06-01 prod)

**Frankfurt prod (`arcana.hairtpclinic.com`) · truth-only · ingen Graph-import**

### Root cause fixes (branch `compliance/pipedrive-pii-purge`)

| Problem                                                    | Fix                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Scoped merge ersatte enrichade rader med `intent: unknown` | Bevara baseline-signaler vid merge (`1e57ebe6`)                                      |
| Per-batch append → 3,7 GB RSS / OOM                        | In-memory rolling baseline + checkpoint-fil + ett persist vid pass-slut (`aafc33a8`) |
| Sista ~894 gap: `truth_snapshot conversations=0`           | Scoped filter bypassar lookback-fönster (deploy pending)                             |

### Prod metrics (senaste pass 2 klart 16:55 UTC)

| Metric               |                                  Värde |
| -------------------- | -------------------------------------: |
| Truth conversations  |                                  9 338 |
| Enriched             |                                  8 444 |
| Coverage             |                             **90,43%** |
| Gap                  |                                    894 |
| `readyForWork`       |                  false (tröskel 99,5%) |
| Final entry (pass 2) | `5e97511c-a2ee-4f5a-bd80-f2266e2c652d` |

### Körning

- Snapshot: `/var/data/backups/pre-enrichment-backfill-2026-06-01/`
- Pass 1–3 via `POST /api/v1/ops/cco/enrichment/backfill/run {"phase":"run","go":true}`
- Coverage: `GET /api/v1/ops/cco/enrichment/coverage?tenantId=hair-tp-clinic`
- **Pass 4:** deploy lookback-fix → kör sista pass för ~894 historiska trådar

### Nästa (Fas B efter ≥99,5%)

1. Verifiera consumer worklist > 0 rader
2. Multi-mailbox rollup (`/ops/customers/cross-mailbox-report`)
3. Wire kundkort + Svarstudio mot enrichment-signaler
