# CCO Mail Enrichment Gap Recovery — Phase 2

**Datum:** 2026-06-01 (fortsättning 2026-06-02)  
**Föregångare:** Truth-only re-backfill (73,72% coverage, 2 454 gap)  
**Regler:** Ingen ny mailimport · ingen Graph-fetch · ingen rå mailtext · ingen patientdata i GitHub · ingen extern AI · ingen blind enrichment-loop · **ingen deploy/restart mitt i kedjan**

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

## Steg A–C (godkända 2026-06-01)

| Steg                        | Resultat                                                     |
| --------------------------- | ------------------------------------------------------------ |
| **A. Denominator-excluded** | **592** (508 dup + 84 scrap)                                 |
| **B. Repair-plan**          | 1 862 analyserade · **1 267 repairable** · **595 ambiguous** |
| **C. Canary repair**        | **100 writes** · 0 skipped · 0 ambiguous writes              |

**Adjusted coverage efter A:** 78,72% (6 884 / 8 745)  
**Snapshot repair:** `/var/data/backups/pre-gap-recovery-phase2-repair-2026-06-01/`

---

## Steg D — Blocker (löst)

Targeted enrich stoppade med `disabled_job` (scheduler-jobb inaktiverat).  
**Fix:** `manual_api_phase2_targeted` bypassar disabled job (`34aab8be`).  
**Deploy-problem:** Render deploy/restart nollställer capability store → kräver truth-only reload före fortsatt Phase 2.

---

## Fortsättning 2026-06-02 (kontrollerad kedja)

### 1. Ingen deploy/restart

Ingen deploy kördes under fortsättningen. Capability återställdes via **truth-only full backfill** (läser current truth på disk — ingen destructiv restore, ingen Graph-fetch).

### 2. Snapshot prod-state

| Artefakt                        | Sökväg / status                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| Mailbox truth                   | `/var/data/backups/pre-enrichment-backfill-2026-06-01/` (+ shards) |
| Capability store                | Samma snapshot (post-reset tom; återbyggd via backfill)            |
| Enrichment checkpoint           | `cco-inbox-enrichment-checkpoint.hair-tp-clinic.json`              |
| Audit                           | `cco-audit.jsonl`                                                  |
| Denominator exclusions          | `cco-inbox-enrichment-denominator-exclusions.hair-tp-clinic.json`  |
| Repair snapshot (urspr. canary) | `pre-gap-recovery-phase2-repair-2026-06-01/`                       |

### 3. Baseline reload (truth-only)

| Metric   | Före reload                   | Efter reload                                                 |
| -------- | ----------------------------- | ------------------------------------------------------------ |
| Coverage | **17,54%** (capability reset) | **90,74%**                                                   |
| Enriched | 1 534                         | **8 260**                                                    |
| Gap      | 7 803                         | **843**                                                      |
| Jobb     | —                             | truth-only full · 7 500 conv · ~3 min · `maxBatchRounds=500` |

Reload läste **current truth** (inkl. ursprungliga 100 canary-repair writes). Ingen gammal pre-backfill-restore.

### 4. Baseline-verifiering (post reload)

| Check                   | Resultat                                         |
| ----------------------- | ------------------------------------------------ |
| Adjusted coverage       | **90,35%** (efter denominator refresh)           |
| Enriched                | **8 260**                                        |
| Gap (eff.)              | **882** (efter 195 denominator-exkl.)            |
| Repairable kvar         | **382** (ned från 1 267 — canary + backfill)     |
| Ambiguous               | **500**                                          |
| `disabled_job`-fix live | ✅ targeted enrich `ok: true`                    |
| Worklist/lanes          | ✅ act-now 5 · needsReply 5 · inga trasiga lanes |

**Obs denominator:** 592 → **195** unika dup/scrap kvar i gap efter backfill (358 tidigare exkluderade rader berikades och räknas inte längre som gap).

### 5. Targeted enrich (canary + första batch)

| Körning                      | Repair writes | Targeted enrich             | Δ enriched | Coverage   |
| ---------------------------- | ------------- | --------------------------- | ---------- | ---------- |
| Urspr. canary 100 (A–C)      | 100           | ⚠️ blockerad (disabled_job) | —          | —          |
| Batch 1 (forts.)             | 100           | ✅ 100 keys                 | **+303**   | **93,07%** |
| `manual_api_phase2_targeted` | —             | ✅ ingen disabled_job       | —          | —          |

Verifiering: coverage ↑ · worklist stabil · inga customerId mismatch · inga duplicates · ingen rå mailtext i API-svar.

### 6. Batch-loop (repair + targeted enrich)

| Batch        | Repair writes | Δ enriched  | Repairable kvar |
| ------------ | ------------- | ----------- | --------------- |
| 1–4 (script) | 4×100         | **0** var   | **150** (platå) |
| Final sweep  | 150           | ej enrichad | **150**         |

**Stop condition triggad:** `repair_plateau_no_enrichment_delta` — repair skriver graphMessageId upprepade gånger men repair-plan räknar samma 150 rader som `repairable_single_match`; targeted enrich ger Δ=0.

**Totalt repair writes i kedjan (2026-06-01):** 100 (urspr.) + 100 + 400 + 150 = **750** (varav ~150 unika repairable i platå).

---

## Fortsättning 2026-06-02 (riktad repair/enrichment, batch 2)

**Regler:** Ingen deploy · snapshot före batch · endast `repairable_single_match` · stopp vid 2× Δ=0 · ingen ambiguous auto-write.

### Snapshot

`/var/data/backups/pre-enrichment-backfill-2026-06-02/` (truth, capability, audit, shards)

### Baseline före batch

| Metric            |                                                  Värde |
| ----------------- | -----------------------------------------------------: |
| Adjusted coverage |                                             **93,07%** |
| Enriched          |                                              **8 563** |
| Eff. gap          |                                                **638** |
| Repairable        |                                                **150** |
| Ambiguous         |                                                **493** |
| Capability        | 91,71% memory · 6 disk entries (ingen reload behövdes) |

### Batch-körning

| Batch | Repair writes | Targeted enrich | Δ enriched | Repairable kvar |
| ----- | ------------- | --------------- | ---------- | --------------- |
| 1     | 100           | ✅ 100 keys     | **0**      | 150             |
| 2     | 100           | ✅ 100 keys     | **0**      | 150             |

**Stop:** `zero_delta_consecutive` efter batch 2 (regel 6).  
**Denna körning:** 200 repair writes · 200 enrich keys · **Δ enriched = 0**.

### Kumulativ Phase 2-progress (från godkänd baseline)

| Metric                                     | Godkänd baseline |                                    Nu |
| ------------------------------------------ | ---------------: | ------------------------------------: |
| Denominator-exkluderade (urspr.)           |              592 |  136 aktiv i gap (358 berikade sedan) |
| Repairable (`single_match`)                |            1 267 |                               **150** |
| Ambiguous                                  |              595 |                               **493** |
| Canary repair (urspr.)                     |              100 |                       ✅ kvar i truth |
| **Unika repairable adresserade**           |                — |              **~1 117** (1 267 − 150) |
| **Repair writes totalt ( alla körningar)** |                — |      **~950+** (inkl. platå-rewrites) |
| **Enriched efter repair (totalt)**         |            6 884 | **8 563** (**+1 679** vs pre Phase 2) |
| Adjusted coverage                          |           78,72% |                            **93,07%** |

### Slutrapport (2026-06-02)

| Metric                      |                         Värde |
| --------------------------- | ----------------------------: |
| **Repaired total (writes)** | **~950+** (200 denna körning) |
| **Enriched after repair**   |                     **8 563** |
| **Adjusted coverage**       |                    **93,07%** |
| **Remaining gap (eff.)**    |                       **638** |
| **Remaining ambiguous**     |                       **493** |
| **Repairable kvar**         |                       **150** |
| **`readyForWork`**          |                     **false** |

#### Worklist

| Metric          |                                    Värde |
| --------------- | ---------------------------------------: |
| Worklist rows   |                                   **10** |
| act-now         |                                    **5** |
| needsReply      |                                    **5** |
| unread          |                                    **9** |
| Lanes           | all 5 · act-now 5 · today 0 · tomorrow 0 |
| SLA/risk counts |         Ej exponerade i consumer summary |

#### Blockers

| Blocker                | Beskrivning                                                                                                                                 | Åtgärd                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Repair-platå**       | 150 `repairable_single_match` — graphMessageId-write uppdaterar inte gap analysis (`messageGroup.graphMessageIdCount`); targeted enrich Δ=0 | **Bugfix C** före fler batchar      |
| **493 ambiguous**      | `ambiguous_multiple_matches` — ingen auto-write                                                                                             | **Manuell review B**                |
| **Tröskel 99,5%**      | 638 eff. gap kvar                                                                                                                           | Kräver ovan + ev. säker exkludering |
| **contact@ / egzona@** | 80,9% / 88,4% coverage                                                                                                                      | Koncentrerad gap-volym              |

#### Stoppvillkor (denna körning)

| Villkor                | Utfall              |
| ---------------------- | ------------------- |
| Deploy/restart         | ✅ Undvikt          |
| 2× targeted enrich Δ=0 | ✅ Stopp batch 2    |
| Coverage backar        | ✅ Ingen regression |
| Ambiguous auto-write   | ✅ 0 writes         |
| customerId mismatch    | ✅ Ej observerad    |
| duplicate explosion    | ✅ Ej observerad    |
| disabled_job           | ✅ Ej observerad    |

**Rapportfil:** `data/imports/phase2-continuation-report.json` (gitignored)

### 7. Ambiguous (493 kvar) — separat plan

**Ingen auto-write på ambiguous.**

| Status                       |   Antal | Åtgärd                                |
| ---------------------------- | ------: | ------------------------------------- |
| `ambiguous_multiple_matches` | **493** | Manuell review / stramare matchregler |
| Auto-repair                  |      ❌ | Flera kandidater → ingen write        |
| Customer merge               |      ❌ | Endast vid single-match               |

**Regler för manuell review:**

1. Prioritera `egzona@` och `contact@` (hög gap-volym per mailbox)
2. Kräv match på ≥3 deterministiska fält (internetMessageId + subjectHash + receivedAt)
3. Logga beslut i audit — ingen bulk-merge
4. Osäkra rader → `leave_unresolved`

### 8. Slutstatus

| Metric                  |                           Värde |
| ----------------------- | ------------------------------: |
| **Coverage (adjusted)** |                      **93,07%** |
| **Enriched**            |                       **8 563** |
| **Gap (eff.)**          |                         **638** |
| **Repairable kvar**     | **150** (platå — kräver bugfix) |
| **Ambiguous kvar**      |                         **493** |
| **`readyForWork`**      |       **false** (tröskel 99,5%) |

#### Per mailbox (slut)

| Mailbox  | Coverage |
| -------- | -------: |
| fazli@   |   98,42% |
| kons@    |   99,24% |
| info@    |   85,33% |
| marknad@ |   88,24% |
| egzona@  |   88,36% |
| contact@ |   80,90% |

---

## `readyForWork=false` — rekommenderad väg

| Alternativ | Beskrivning                                  | Rekommendation                      |
| ---------- | -------------------------------------------- | ----------------------------------- |
| **A**      | Exkludera säkert icke-actionable ambiguous   | Endast efter manuell klassificering |
| **B**      | Manuell review av 493 ambiguous              | **Ja** — största säkra volym        |
| **C**      | Bugfix: repair→gap analysis sync (150 platå) | **Ja** — blockerar sista repairable |
| **D**      | Leave unresolved                             | Default för osäkra rader            |

**Kvar till 99,5%:** ~638 eff. gap varav 493 ambiguous + 150 repair-platå + ~rest (contact@/egzona@ koncentration).

---

## Stoppvillkor (logg)

| Villkor                     | Utfall                                   |
| --------------------------- | ---------------------------------------- |
| Deploy/restart mitt i kedja | ✅ Undvikt                               |
| disabled_job                | ✅ Fix verifierad                        |
| Coverage backar             | ✅ Stoppade vid platå (ingen regression) |
| Blind enrichment-loop       | ✅ Stoppad vid 2× Δ=0 (2026-06-02)       |
| customerId mismatch         | ✅ Ej observerad                         |
| duplicate explosion         | ✅ Ej observerad                         |
| truth/worklist skada        | ✅ Ej observerad                         |

---

## Verktyg

```bash
# Snapshot + baseline reload
node scripts/run-truth-only-enrichment-rebackfill.js --snapshot --full --wait

# Phase 2 steg
node scripts/run-gap-recovery-phase2.js --denominator-apply
node scripts/run-gap-recovery-phase2.js --repair-plan
node scripts/run-gap-recovery-phase2.js --repair-canary --wait

# Kontrollerad fortsättning (2× Δ=0 stop)
node scripts/run-gap-recovery-phase2-continuation.js --snapshot --verify-baseline --batch-loop --batch-size 100 --max-batches 8 --wait
```

---

## Moduler

| Fil                                                  | Syfte                                 |
| ---------------------------------------------------- | ------------------------------------- |
| `src/ops/ccoInboxEnrichmentDenominatorExclusions.js` | Exclusion persist + adjusted coverage |
| `src/ops/ccoGraphMessageIdRepairPlan.js`             | Dry-run matcher                       |
| `src/ops/ccoGraphMessageIdRepairApply.js`            | Canary apply                          |
| `scripts/run-gap-recovery-phase2.js`                 | Orchestration                         |
| `scripts/run-gap-recovery-phase2-continuation.js`    | Fortsättning m. platå-stop            |
