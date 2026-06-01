# CCO Mail Enrichment Gap Recovery — Phase 2

**Datum:** 2026-06-01  
**Föregångare:** Truth-only re-backfill (73,72% coverage, 2 454 gap)  
**Regler:** Ingen ny mailimport · ingen Graph-fetch · ingen rå mailtext · ingen patientdata i GitHub · ingen extern AI · ingen blind enrichment-loop

---

## Mål

1. Exkludera icke-arbetsbara gaps från denominator (dup/scrap)
2. Dry-run repair-plan för `missing_graphMessageId` (1 862 rader)
3. Canary repair endast vid deterministisk single-match
4. Targeted enrichment endast på repaired rows
5. Väg till `readyForWork=true` utan blind `maxBatchRounds`-continuation

---

## Baseline (pre Phase 2)

| Metric              |  Värde |
| ------------------- | -----: |
| Truth conversations |  9 338 |
| Enriched            |  6 884 |
| Gap                 |  2 454 |
| Coverage (rå)       | 73,72% |
| `readyForWork`      |  false |

### Gap buckets (full export)

| Bucket                        | Antal |
| ----------------------------- | ----: |
| `missing_graphMessageId`      | 1 862 |
| `duplicate_or_alias`          |   508 |
| `system_scrap_should_exclude` |    84 |

---

## Steg A — Denominator-exkludering

**Scope:** 592 konversationer (508 dup + 84 scrap)  
**Princip:** Räknas inte mot worklist-tröskel — inte verkliga kundkonversationer som kräver åtgärd.

| API                                                                          | Beskrivning                             |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| `POST /api/v1/ops/cco/enrichment/gap-recovery/phase2/denominator-exclusions` | `{ dryRun: true }` eller `{ go: true }` |

**Persistens:** `/var/data/cco-inbox-enrichment-denominator-exclusions.hair-tp-clinic.json`

**Projicerad coverage efter exkludering:** 6 884 / 8 746 ≈ **78,7%**

---

## Steg B — Repair-plan (dry-run)

**Scope:** 1 862 `missing_graphMessageId`  
**Källor (read-only):** truth store + ingestion ledger — ingen Graph-fetch.

**Deterministiska matchfält:**

- mailbox
- conversationId / threadKey
- internetMessageId (om finns)
- subjectHash / snippetHash
- receivedAt / sentAt
- from/to-hash
- ingestion ledger mapping

**Status per rad:**

| Status                       | Beskrivning                         |
| ---------------------------- | ----------------------------------- |
| `repairable_single_match`    | Exakt en kandidat — canary-eligible |
| `ambiguous_multiple_matches` | Stopp — ingen write                 |
| `no_candidate`               | Saknar säker källa                  |
| `corrupted_truth_row`        | Ogiltig nyckel/mailbox              |
| `should_remain_unresolved`   | Scrap/dup eller osäker              |

| API                                                              | Beskrivning     |
| ---------------------------------------------------------------- | --------------- |
| `GET /api/v1/ops/cco/enrichment/gap-recovery/phase2/repair-plan` | Dry-run summary |

---

## Steg C — Canary repair

**Villkor:** Endast om dry-run har `repairable_single_match > 0`  
**Limit:** 100 (default)  
**Write:** Endast graphMessageId / conversation alias — ingen rå mailtext

| API                      | Beskrivning                                               |
| ------------------------ | --------------------------------------------------------- |
| `POST .../repair/canary` | `{ dryRun: true }` sedan `{ go: true, canaryLimit: 100 }` |

**Snapshot:** `/var/data/backups/pre-gap-recovery-phase2-repair-YYYY-MM-DD/`  
**Audit:** `ops.cco.enrichment.gap_recovery.phase2.repair_canary`

---

## Steg D — Targeted enrichment

Endast repaired conversation keys efter grön canary.

| API                        | Beskrivning                             |
| -------------------------- | --------------------------------------- |
| `POST .../targeted-enrich` | `{ go: true, conversationKeys: [...] }` |

---

## Stoppvillkor

| Villkor                    | Åtgärd              |
| -------------------------- | ------------------- |
| customerId mismatch        | STOPP               |
| duplicate explosion        | STOPP               |
| ambiguous match vid canary | STOPP — ingen write |
| coverage backar            | STOPP               |
| truth/worklist skadas      | STOPP               |

---

## Verktyg

```bash
node scripts/run-gap-recovery-phase2.js --denominator-dry-run
node scripts/run-gap-recovery-phase2.js --denominator-apply
node scripts/run-gap-recovery-phase2.js --repair-plan
node scripts/run-gap-recovery-phase2.js --repair-canary-dry-run
node scripts/run-gap-recovery-phase2.js --repair-canary --wait
```

---

## Resultat (fylls efter körning)

| Metric                             | Värde |
| ---------------------------------- | ----: |
| Denominator-excluded               |     — |
| missing_graphMessageId analyserade |     — |
| repairable                         |     — |
| ambiguous                          |     — |
| unresolved                         |     — |
| repaired (canary)                  |     — |
| Coverage % (adjusted)              |     — |
| `readyForWork`                     |     — |
| Worklist rows                      |     — |
| act-now / needsReply               |     — |

---

## Moduler

| Fil                                                  | Syfte                                 |
| ---------------------------------------------------- | ------------------------------------- |
| `src/ops/ccoInboxEnrichmentDenominatorExclusions.js` | Exclusion persist + adjusted coverage |
| `src/ops/ccoGraphMessageIdRepairPlan.js`             | Dry-run matcher                       |
| `src/ops/ccoGraphMessageIdRepairApply.js`            | Canary apply                          |
| `scripts/run-gap-recovery-phase2.js`                 | Orchestration                         |
