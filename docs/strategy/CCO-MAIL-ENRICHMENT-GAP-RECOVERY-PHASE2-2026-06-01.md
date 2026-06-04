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

| Blocker                | Beskrivning                                           | Åtgärd                              |
| ---------------------- | ----------------------------------------------------- | ----------------------------------- |
| ~~**Repair-platå**~~   | ~~150 `repairable_single_match` — sync-fix deployad~~ | ✅ **Löst** — repairable **0**      |
| **493 ambiguous**      | `ambiguous_multiple_matches` — ingen auto-write       | **Manuell review B**                |
| **Tröskel 99,5%**      | 638 eff. gap kvar                                     | Kräver ambiguous-review + ev. exkl. |
| **contact@ / egzona@** | 80,9% / 88,4% coverage                                | Koncentrerad gap-volym              |

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

### 8. Slutstatus (uppdaterad efter sync-fix)

| Metric                  |                     Värde |
| ----------------------- | ------------------------: |
| **Coverage (adjusted)** |                **93,07%** |
| **Enriched**            |                 **8 563** |
| **Gap (eff.)**          |                   **638** |
| **Repairable kvar**     |                     **0** |
| **Ambiguous kvar**      |                   **493** |
| **`readyForWork`**      | **false** (tröskel 99,5%) |

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
| **C**      | Bugfix: repair→gap analysis sync (150 platå) | ✅ **Klart** — repairable 0         |
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

# Repair sync canary (efter main-deploy av 7d62c8d5)
node scripts/run-gap-recovery-phase2-repair-sync-canary.js --snapshot --canary-limit 25 --wait

# Final gap closure (read-only)
node scripts/run-final-mail-gap-closure.js

# Parser-empty fallback (owner C)
node scripts/run-parser-empty-fallback-recovery.js --dry-run
node scripts/run-parser-empty-fallback-recovery.js --snapshot --canary --canary-limit 25 --wait
node scripts/run-parser-empty-fallback-recovery.js --full-remaining --canary-limit 125 --wait
```

---

## Bugfix: repair → gap-analysis sync (2026-06-02)

**Commit:** `7d62c8d5` (`compliance/pipedrive-pii-purge`)  
**Prod:** Frankfurt `arcana` (`srv-d8b3i3tckfvc73clgeng`) — deploy verifierad · `repairRunId` i API-svar ✅

### Kod

| Modul                                     | Syfte                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ccoGraphMessageIdRepairRegistry.js`      | Idempotency: `repairedAt`, `repairedByRunId`, `repairSource=ingestion_ledger`, `newGraphMessageIdHash` (ingen rå graphMessageId i audit) |
| `alignTruthMessageToGapConversation()`    | Repair-write → gap `conversationKey`                                                                                                     |
| Gap analysis + registry                   | Reparade rader exkluderas från `missing_graphMessageId`                                                                                  |
| `reconcileRepairRegistryFromGapDetails()` | Registry backfill från befintlig truth                                                                                                   |

**Registry på disk:** `/var/data/cco-inbox-graph-message-id-repairs.hair-tp-clinic.json` (150 poster efter slutkörning)

---

## Sync-fix kedja (2026-06-02, post-deploy)

**Regler:** Ingen ny mailimport · ingen Graph-fetch · ingen deploy/restart mitt i kedjan · ingen blind loop.

### 1. Post-deploy reload

Deploy nollställde capability → truth-only full backfill:

| Metric     | Före reload | Efter reload |
| ---------- | ----------- | ------------ |
| Coverage   | 0%          | **75,31%**   |
| Enriched   | 0           | **6 885**    |
| Repairable | —           | **1 265**    |
| Ambiguous  | —           | **595**      |

### 2. Sync-canary 25 ✅

| Metric            | Före   | Efter      | Δ          |
| ----------------- | ------ | ---------- | ---------- |
| Repairable        | 1 265  | **125**    | **−1 140** |
| Enriched          | 6 885  | **8 563**  | **+1 678** |
| Adjusted coverage | 75,31% | **93,07%** | +17,76 pp  |
| Eff. gap          | 2 257  | **638**    | −1 619     |
| Ambiguous         | 595    | **493**    | −102       |

- 25 repair writes · `repairRunId` ✅ · registry 25 poster
- Targeted enrich 25 keys · `disabled_job` ej triggad
- **Verifiering:** repairable minskade · coverage backade inte · worklist stabil

### 3. Slutbatch 50 ✅

| Metric            | Före    | Efter      | Δ        |
| ----------------- | ------- | ---------- | -------- |
| Repairable        | **125** | **0**      | **−125** |
| Enriched          | 8 563   | **8 563**  | 0        |
| Adjusted coverage | 93,07%  | **93,07%** | 0        |
| Eff. gap          | 638     | **638**    | 0        |
| Ambiguous         | 493     | **493**    | 0        |

- 50 repair writes · registry **150** poster totalt
- Targeted enrich 50 keys · Δ enriched = 0 (redan berikade via canary-side-effect)
- **Verifiering:** repairable **0** · ingen coverage-regression · inga stop conditions

**Batch 50+50+25 avbröts:** andra batchen stoppade korrekt (`repairable=0`, inga keys kvar).

---

## Slutrapport sync-fix (2026-06-02)

| Metric                       | Baseline (pre fix) | Slut                       |
| ---------------------------- | ------------------ | -------------------------- |
| **Repairable**               | **150** (platå)    | **0**                      |
| **Repaired (denna kedja)**   | —                  | **75 writes** (25 + 50)    |
| **Registry totalt**          | —                  | **150** (inkl. reconcile)  |
| **Enriched**                 | 8 563              | **8 563**                  |
| **Enriched Δ (hela kedjan)** | —                  | **+1 678** (6 885 → 8 563) |
| **Adjusted coverage**        | 93,07%             | **93,07%**                 |
| **Eff. gap kvar**            | 638                | **638**                    |
| **Ambiguous kvar**           | 493                | **493**                    |
| **`readyForWork`**           | false              | **false** (tröskel 99,5%)  |

### Worklist

| Metric                |                                    Värde |
| --------------------- | ---------------------------------------: |
| Worklist rows         |                                   **10** |
| act-now               |                                    **5** |
| needsReply            |                                    **5** |
| unread                |                                    **9** |
| Lanes                 | all 5 · act-now 5 · today 0 · tomorrow 0 |
| outOfScopeDraftReview |                                   **29** |

### Stoppvillkor (sync-kedja)

| Villkor                       | Utfall                        |
| ----------------------------- | ----------------------------- |
| Repairable minskar inte       | ✅ Minskade 150 → 0           |
| Targeted enrich Δ=0 efter fix | ✅ Förväntat (redan berikade) |
| Coverage backar               | ✅ Ingen regression           |
| customerId mismatch           | ✅ Ej observerad              |
| duplicate explosion           | ✅ Ej observerad              |
| Rå mailtext i rapport         | ✅ Endast hashes/keys         |
| audit/persist fail            | ✅ registrySave ok            |
| Deploy/restart mitt i kedja   | ✅ Endast före kedjan         |

**Rapportfiler:** `data/imports/phase2-repair-sync-canary-report.json` (gitignored)

### Nästa steg: 493 ambiguous

**Ingen auto-write · ingen fuzzy customer merge.**

| Status                       |   Antal | Åtgärd                         |
| ---------------------------- | ------: | ------------------------------ |
| `ambiguous_multiple_matches` | **493** | Manuell review                 |
| Auto-repair                  |      ❌ | Flera kandidater → ingen write |
| Customer merge               |      ❌ | Endast vid single-match        |

**Review-regler:**

1. Prioritera `egzona@` och `contact@` (hög gap-volym)
2. Kräv match på ≥3 deterministiska fält (internetMessageId + subjectHash + receivedAt)
3. Logga beslut i audit — ingen bulk-merge
4. Osäkra rader → `leave_unresolved`

**Väg till `readyForWork=true`:** ~638 eff. gap kvar (493 ambiguous + ~145 övrigt). Kräver manuell ambiguous-review (B) — inte fler repair-writes.

---

## Final Mail Gap Closure (2026-06-02)

**Status:** Auto-repair stoppad · read-only analys · ingen deploy/restart · ingen Graph-fetch · ingen ny import.

### Export

| Artefakt                   | Sökväg                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| Final gap + klassificering | `data/imports/mail-enrichment-final-gap-2026-06-01.json` (gitignored) |
| Skript                     | `node scripts/run-final-mail-gap-closure.js`                          |

Ingen rå mailtext · inga graphMessageId · inga patient-ID i export.

### Två mått (tröskel 99,5% oförändrad)

| Mått                               | Värde      | Beskrivning                                              |
| ---------------------------------- | ---------- | -------------------------------------------------------- |
| **Technical enrichment coverage**  | **93,07%** | `8563 / 9201` eff. denominator · `readyForWork=false`    |
| **Operational worklist readiness** | **false**  | 150 parser-empty fallback-kandidater väntar owner-beslut |

Operational readiness = klar endast om alla kvarvarande ej-enriched är i review queue, non-actionable, excluded med motivering, eller owner-accepted unresolved. **493 ambiguous** uppfyller review-queue-kravet; **150 parser-empty** blockerar tills owner väljer A–D.

### Gap-klassificering (774 rå · 638 eff.)

| Closure bucket                            | Rå (774) | Eff. (638) | Beslut                                 |
| ----------------------------------------- | -------: | ---------: | -------------------------------------- |
| `ambiguous_multiple_matches_review_queue` |  **493** |    **493** | Manuell review — **ingen auto-write**  |
| `true_blocker` (parser-empty fallback)    |  **150** |    **150** | Owner-beslut — **inga fler auto-pass** |
| `non_actionable_system_or_duplicate`      |   **70** |          0 | Dup — exkluderas från eff. gap         |
| `should_exclude_from_denominator`         |   **61** |          0 | System/scrap — exkluderas              |
| `unresolved_missing_graphMessageId`       |    **0** |          0 | —                                      |
| `unsupported_shape`                       |    **0** |          0 | —                                      |

**493 + 150 = 643** rader i eff. klassificering vs **638** eff. gap i coverage — **5 rader** flagg-mismatch mellan gap-analysis och denominator-exclusion-fil (acceptabel avvikelse; räknas inte som blocker).

### Ambiguous review queue (493)

| Mailbox  | Antal (repair-plan) |
| -------- | ------------------: |
| contact@ |             **248** |
| egzona@  |             **175** |
| fazli@   |              **67** |
| marknad@ |               **3** |

**Regler (framtida godkännande):**

- Minst **3 deterministiska fält** bland: `internetMessageId`, `subjectHash`, `receivedAt`, `mailbox`, `conversationId`, `fromHash`, `toHash`
- ❌ ingen fuzzy merge · ❌ ingen customer merge om osäker · ❌ ingen auto-repair

### Resterande ~145 eff. gap (exakt 150 parser-empty)

| Kategori                           |   Antal | Kan exkluderas?  | Bugfix? | Unsupported? | Verklig blocker?  | Rekommendation |
| ---------------------------------- | ------: | ---------------- | ------- | ------------ | ----------------- | -------------- |
| **Parser-empty fallback-kandidat** | **150** | Ev. efter review | Nej     | Nej          | Ja (tills beslut) | Owner A/B/C/D  |
| Unresolved missing graphMessageId  |       0 | —                | —       | —            | —                 | —              |
| Unsupported shape                  |       0 | —                | —       | —            | —                 | —              |

**150 parser-empty:** truth har graphMessageId + body/subject men AnalyzeInbox-rad saknar workflow-signaler. Fallback enrich _möjlig_ men **inga fler blinda pass** — kräver explicit owner-godkännande eller `leave_unresolved`.

### Slutmetrics

| Metric                           |                           Värde |
| -------------------------------- | ------------------------------: |
| **Enriched**                     |                       **8 563** |
| **Adjusted coverage**            |                      **93,07%** |
| **Final gap (eff.)**             |                         **638** |
| **Final gap (rå)**               |                         **774** |
| **Ambiguous review queue**       |                         **493** |
| **True blockers (parser-empty)** |                         **150** |
| **Excluded (dup/scrap)**         | **131** (136 i denominator-fil) |
| **Operational readiness**        |                       **false** |
| **`readyForWork`**               |                       **false** |

#### Worklist / multi-mailbox

| Metric               |                                      Värde |
| -------------------- | -----------------------------------------: |
| Worklist rows        |                                     **10** |
| act-now              |                                      **5** |
| needsReply           |                                      **5** |
| unread               |                                      **9** |
| Lanes                |   all 5 · act-now 5 · today 0 · tomorrow 0 |
| Mailboxes i worklist | kons@ 1 · info@ 2 · contact@ 3 · egzona@ 4 |

| Mailbox  | Coverage |
| -------- | -------: |
| fazli@   |   98,42% |
| kons@    |   99,24% |
| info@    |   85,33% |
| marknad@ |   88,24% |
| egzona@  |   88,36% |
| contact@ |   80,90% |

### Owner-beslut (väntar)

| Alt   | Beskrivning                                                | Status                   |
| ----- | ---------------------------------------------------------- | ------------------------ |
| **A** | Godkänn operational readiness trots ambiguous review queue | ⏸ Ej ännu                |
| **B** | Bygg ambiguous review UI                                   | **Nästa steg**           |
| **C** | Parser-empty fallback recovery (150 true blockers)         | ✅ **Klart**             |
| **D** | Lämna unresolved                                           | Default för osäkra rader |

---

## Parser-empty recovery — Owner C (2026-06-02)

**Beslut:** C kördes kontrollerat · A nekad · B efter parser-empty · ingen blind pass.

### Fallback-policy (regelbaserad)

| Policy                      | Villkor                                                                                                        | Fallback-signaler                                                               | Disposition           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| `true_unanswered_candidate` | inbound/mixed · kundmatch · ej handled/snoozed · senaste inkommande > utgående · graphMessageId + body/subject | `intent=follow_up` · `workflowLane=action_now` · `needsReplyStatus=needs_reply` | needs_action-kandidat |
| `non_actionable_outbound`   | outbound                                                                                                       | `intent=admin` · `workflowLane=admin_low` · `needsReplyStatus=handled`          | non_actionable        |
| `exclude_non_actionable`    | system/scrap                                                                                                   | —                                                                               | denominator-exclude   |
| `unresolved_review`         | osäker / saknar kundidentitet / handled                                                                        | —                                                                               | leave_unresolved      |

**Dry-run (150):** 65 `true_unanswered_candidate` · 85 `non_actionable_outbound` · 0 `unresolved_review` · alla canary-safe.

### Körning

| Steg                    |   Antal | Δ enriched | Δ eff. gap |   Coverage |
| ----------------------- | ------: | ---------: | ---------: | ---------: |
| Baseline (post closure) |       — |      8 563 |        638 | **93,07%** |
| Canary 25               |      25 |    **+25** |    **−24** | **93,33%** |
| Full 125                |     125 |   **+125** |   **−124** | **94,68%** |
| **Totalt**              | **150** |   **+150** |   **−148** | **94,68%** |

**Commits:** `e1b50e5f` (feature) · `bbcf20ee` (checkpoint-baseline fix)

**Verifiering:** customerId mismatch 0 · duplicate explosion 0 · coverage ↑ · worklist/lanes stabil · ingen Graph-fetch · ingen ny import · audit per batch.

### Slutmetrics (post parser-empty)

| Metric                     |                          Värde |
| -------------------------- | -----------------------------: |
| **Enriched**               |               **8 713** (+150) |
| **Adjusted coverage**      |                     **94,68%** |
| **Eff. gap**               |                        **490** |
| **Parser-empty kvar**      |                          **0** |
| **Ambiguous review queue** |                        **493** |
| **Repairable**             |                          **0** |
| **`readyForWork`**         |              **false** (99,5%) |
| **Operational readiness**  | **false** (493 ambiguous kvar) |

#### Worklist

| Metric     |                                    Värde |
| ---------- | ---------------------------------------: |
| Rows       |                                   **10** |
| act-now    |                                    **5** |
| needsReply |                                    **5** |
| unread     |                                    **9** |
| Lanes      | all 5 · act-now 5 · today 0 · tomorrow 0 |

**Rapport:** `data/imports/parser-empty-fallback-recovery-report.json` (gitignored)

### Owner B — Ambiguous Review UI (2026-06-02)

**Status:** Aktiverad · ingen auto-repair · ingen fuzzy merge · ingen customer merge · ingen blind enrichment.

#### API (`/api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review/`)

| Endpoint                    | Roll         | Beskrivning                                                                             |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `GET summary`               | OWNER, STAFF | Totalt, mailbox-fördelning, beslutsstatistik, coverage, operational readiness, worklist |
| `GET queue`                 | OWNER, STAFF | Paginerad kö (`status=pending\|all`, `mailboxId`, `limit`, `offset`)                    |
| `GET item?conversationKey=` | OWNER, STAFF | Rad med ambiguityReason, kandidater (hashade), deterministiska matchfält                |
| `POST decide`               | OWNER        | `go=true` + action                                                                      |

**Actions:** `approve_single_match` · `leave_unresolved` · `exclude_non_actionable` · `reject_candidate`

**Approve-regel:** minst **3** deterministiska fält bland `internetMessageId`, `subjectHash`, `receivedAt`, `mailbox`, `conversationId`, `fromHash`, `toHash`. Blockeras med 409 om under tröskel.

**Vid approve:** single repair-write via `applySingleApprovedGraphMessageIdRepair` → registry → targeted enrich (en rad) om scheduler finns.

**Vid leave_unresolved:** `unresolved_review` eller `owner_accepted_unresolved` — räknas inte som enriched.

**Vid exclude_non_actionable:** kräver `reason` → denominator-exclusion + audit.

#### UI

| Artefakt    | Sökväg                                                           |
| ----------- | ---------------------------------------------------------------- |
| Review-sida | `/ambiguous-mail-enrichment-review.html?tenantId=hair-tp-clinic` |

#### Baseline efter Owner C (start för B)

| Metric            |      Värde |
| ----------------- | ---------: |
| Enriched          |  **8 713** |
| Adjusted coverage | **94,68%** |
| Eff. gap          |    **490** |
| Ambiguous (kö)    |    **493** |
| Parser-empty      |      **0** |
| Repairable        |      **0** |
| `readyForWork`    |  **false** |

#### Ambiguous mailbox breakdown

| Mailbox  |   Antal |
| -------- | ------: |
| contact@ | **248** |
| egzona@  | **175** |
| fazli@   |  **67** |
| marknad@ |   **3** |

#### Operational readiness (efter C, före B-beslut)

| Villkor                  | Status                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Parser-empty blockers    | ✅ **0**                                                        |
| Ambiguous i review queue | ⏳ **493 pending**                                              |
| Operational readiness    | **false** (493 kvar att reviewa eller acceptera som unresolved) |
| Worklist intakt          | ✅ 10 rader · act-now 5 · needsReply 5                          |

**Beslut efter B:** operational readiness kan godkännas om alla eff. gap antingen är enriched, excluded med motivering, eller owner-accepted unresolved — även om review-kön inte är tom men alla rader har explicit beslut.

#### Stop conditions (oförändrade)

- customerId mismatch
- duplicate explosion
- raw mail body in report
- patientdata in GitHub
- auto-merge attempted
- ambiguous write without 3 deterministic fields
- coverage regression

---

## Moduler

| Fil                                                     | Syfte                                 |
| ------------------------------------------------------- | ------------------------------------- |
| `src/ops/ccoInboxEnrichmentDenominatorExclusions.js`    | Exclusion persist + adjusted coverage |
| `src/ops/ccoGraphMessageIdRepairPlan.js`                | Dry-run matcher                       |
| `src/ops/ccoGraphMessageIdRepairApply.js`               | Canary apply                          |
| `scripts/run-gap-recovery-phase2.js`                    | Orchestration                         |
| `src/ops/ccoGraphMessageIdRepairRegistry.js`            | Repair idempotency + gap sync         |
| `scripts/run-gap-recovery-phase2-repair-sync-canary.js` | Sync canary orchestration             |
| `src/ops/ccoFinalGapClosure.js`                         | Final gap closure classification      |
| `scripts/run-final-mail-gap-closure.js`                 | Final gap export orchestration        |
| `src/ops/ccoParserEmptyFallback.js`                     | Parser-empty rule fallback            |
| `scripts/run-parser-empty-fallback-recovery.js`         | Parser-empty recovery orchestration   |
| `src/ops/ccoAmbiguousMailEnrichmentReviewStore.js`      | Review-beslut persist                 |
| `src/ops/ccoAmbiguousMailEnrichmentReviewService.js`    | Queue, scoring, decide                |
| `public/ambiguous-mail-enrichment-review.html`          | Review UI                             |
