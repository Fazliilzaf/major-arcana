# CCO Mail Enrichment Gap Analysis

**Datum:** 2026-06-01  
**Scope:** Frankfurt prod · truth-only · read-only  
**Regler:** Ingen rå mailtext · inga patient-ID/e-post i denna rapport · ingen Graph-fetch

---

## Restore GO — status 2026-06-01 (STOPP utlöst)

| Steg                  | Resultat                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Snapshot prod      | ✅ `/var/data/backups/pre-enrichment-backfill-2026-06-01/` — kopierade mailbox truth, capability-analysis.json, audit, cco-mailbox-truth/ |
| 2. Restore capability | ✅ `restore-capability` från samma label + entry-prefix `05dd08b4`                                                                        |
| 3. Coverage verify    | ❌ **0% / 0 enriched / 9338 gap** — förväntat ~91,7% / 8563 / 775                                                                         |
| 4. Gap-export         | ⚠️ Körd men **ogiltig baseline** — 9338 gap, bucket `missing_graphMessageId` (100%)                                                       |
| 5. JSON export        | `data/imports/mail-enrichment-gap-export-2026-06-01.json` (gitignored, **ej för Claude-klassificering**)                                  |

**Stoppvillkor utlöst:** restore gav inte tillbaka ~91,7%. Inga fallback-fixar, inga blinda enrichment-pass.

**Rotorsak:** Prod kör capability store **in-memory** utan `reloadFromDisk`. `restore-capability` skrev fil till disk men processens minnes-baseline uppdaterades inte. Fix pushad: commit `33c46f8e` (`reload-capability` + checkpoint-restore i snapshot) — **ej deployad till prod** (CI fail + Render ej uppdaterad efter 30+ min poll).

**Obs:** Steg-1-snapshot skrev över backup-mappen `pre-enrichment-backfill-2026-06-01` med **nuvarande disk-state** (samma datum-label som endpoint auto-genererar). Det bevarar live capability-analysis.json från före restore-copy — värdefullt när reload deployas.

**Nästa unblock (Cursor):**

1. Deploy `33c46f8e` till Frankfurt (`srv-d8b3i3tckfvc73clgeng`) — **en** deploy, ingen restart mitt i export
2. `POST …/backfill/run` `{ "phase": "reload-capability", "go": true, "entryId": "05dd08b4" }`
3. Verifiera coverage ≈ 91,7% / 775 gap
4. Kör om gap-export → giltig JSON för Claude read-only klassificering

---

## Gap Recovery GO — diagnostik-först (2026-06-01, STOPP)

Owner-GO för diagnostik-först recovery. **Ingen blind restore, ingen enrichment-loop, ingen deploy under sekvensen.**

| Steg                    | Status       | Resultat                                                                  |
| ----------------------- | ------------ | ------------------------------------------------------------------------- |
| 1. Read-only diagnostik | ❌ Blockerad | `GET /ops/cco/enrichment/baseline/diagnose` **ej deployad** (404 på prod) |
| 2. Targeted restore     | ⏸            | Väntar på diagnose + `reload-capability` (commit `4f054dda`)              |
| 3. Coverage verify      | ❌           | Prod fortfarande **0% / 0 / 9338**                                        |
| 4. Gap-export           | ⏸            | Ej giltig förrän baseline ≈ 8563 / 775                                    |

**Implementerat (Cursor-repo, ej prod):**

| Artefakt                                           | Syfte                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/v1/ops/cco/enrichment/baseline/diagnose` | Read-only: live disk, checkpoint, backups; hittar `05dd08b4`; **avvisar pre-backfill (~143)** |
| `reload-capability`                                | Laddar disk → minne utan restart                                                              |
| `scripts/run-enrichment-gap-recovery.js`           | diagnose → targeted restore → verify → export                                                 |

**Unblock:** Deploy `compliance/pipedrive-pii-purge` @ `4f054dda` till Frankfurt. Render autoDeploy följer `main` (unrelated histories — compliance merge till main ej möjlig utan manuell ops-PR).

**Efter deploy (en körning, ingen restart mitt i):**

```bash
node scripts/run-enrichment-gap-recovery.js --diagnose-only
node scripts/run-enrichment-gap-recovery.js --restore --export
```

Scriptet stoppar om ingen pass-6-källa hittas eller om pre-backfill (~143) är enda kandidaten.

---

## Executive summary

| Metric                | Värde (senaste stabila pass)           |
| --------------------- | -------------------------------------- |
| Truth conversations   | 9 338                                  |
| Enriched              | 8 563                                  |
| **Gap**               | **775**                                |
| Coverage              | **91,7%**                              |
| `readyForWork`        | false (tröskel 99,5%)                  |
| Senaste persist entry | `05dd08b4-cc0c-4daa-aa53-bbc5e5189686` |

**Huvudfynd:** De 775 kvarvarande gap-raderna berör samma trådar efter pass 6–7 (416–500 scoped batches utan coverage-ökning). Pass 7 loggade upprepade `truth_snapshot conversations=0` innan lookback-fix, och därefter stall trots snapshot-fix. Automatiserad bucket-rapport kräver **återställd capability-baseline i minnet** (deploy/restart nollställer tillfälligt baseline → falskt 100% gap tills servicen laddat store).

**Inga blinda enrichment-pass kördes under denna analys.**

---

## Metod

1. Read-only endpoint: `GET /api/v1/ops/cco/enrichment/gap-analysis`
2. Script: `node scripts/analyze-enrichment-gap.js --write-report --detail-limit 775`
3. Pass 6–7 Render-loggar (`enrichment_full_backfill START/DONE`, `truth_snapshot`)
4. Coverage API före deploy-kedja

Per gap (i sample-export, max 775 rader):

| Fält           | Beskrivning                             |
| -------------- | --------------------------------------- |
| threadKey      | `mailbox:conversationId` (ingen råtext) |
| mailbox        | mailboxId                               |
| customerId     | `yes` / `no`                            |
| graphMessageId | `yes` / `no` (truth-meddelanden)        |
| truth-row      | alltid `yes` för gap                    |
| ingestion      | `matched` / `present` / `no`            |
| direction      | inbound / outbound / mixed / unknown    |
| date           | senaste aktivitet (ISO-datum)           |
| system         | klassificering system_mail              |
| duplicate      | alias/dubblett-flagga                   |
| bucket         | primär kategori                         |
| fallback       | kan regelbaserad fallback?              |
| why            | maskinläsbar orsak                      |

---

## Bucket-kategorisering (775 gap)

Uppskattning baserad på pass 7-beteende, worklist-modell och sample från gap-export (775 detaljrader). **Exakta bucket-tal bör verifieras med:**

```bash
node scripts/analyze-enrichment-gap.js --json   # efter baseline reload, utan deploy
```

| Bucket                              | Uppskattat antal | Andel | Beskrivning                                                                                   |
| ----------------------------------- | ---------------: | ----: | --------------------------------------------------------------------------------------------- |
| `enrichment_parser_empty`           |         ~520–600 |  ~70% | Truth snapshot viable; AnalyzeInbox kördes men gav `intent: unknown` / inga workflow-signaler |
| `system_scrap_should_exclude`       |          ~80–120 |  ~12% | system_mail / kampanj / noreply (klassificering i worklist)                                   |
| `duplicate_or_alias`                |           ~40–70 |   ~7% | Samma suffix/identitet i flera mailboxar                                                      |
| `missing_customer_identity`         |           ~30–50 |   ~5% | Varken customerId eller counterparty-email                                                    |
| `missing_graphMessageId`            |           ~15–30 |   ~3% | Truth-rader utan graphMessageId på meddelanden                                                |
| `no_truth_body_or_headers`          |           ~10–20 |   ~2% | Saknar bodyPreview och subject                                                                |
| `unsupported_message_shape`         |           ~10–20 |   ~2% | Snapshot-byggare exkluderar (key/format)                                                      |
| `outside_supported_mailbox`         |             ~0–5 |   <1% | Mailbox utanför scheduler-scope                                                               |
| `corrupted_or_incomplete_truth_row` |             ~0–5 |   <1% | Ofullständig nyckel                                                                           |

Flaggor (ej ömsesidigt uteslutande):

| Flag                                | Uppskattat antal |
| ----------------------------------- | ---------------: |
| `can_fallback_enrich`               |         ~550–650 |
| `should_be_excluded_from_threshold` |         ~130–200 |

---

## Beslut per bucket

| Bucket                              | Beslut                       | Motivering                                                           |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `system_scrap_should_exclude`       | **exclude_from_denominator** | Automatiskt skräp ska inte blockera operativ worklist-tröskel        |
| `duplicate_or_alias`                | **exclude_from_denominator** | Dubbletter ska dedupliceras, inte retry-enrichas                     |
| `outside_supported_mailbox`         | **exclude_from_denominator** | Utanför scheduler-scope                                              |
| `enrichment_parser_empty`           | **enrich_via_fallback**      | Har truth-underlag; regelbaserad intent/lane från metadata + preview |
| `can_fallback_enrich`               | **enrich_via_fallback**      | graphMessageId + preview/subject, icke-system                        |
| `missing_graphMessageId`            | **leave_unresolved**         | Kräver truth-repair eller Graph-sync — inte truth-only               |
| `no_truth_body_or_headers`          | **leave_unresolved**         | Saknar minsta analysunderlag                                         |
| `missing_customer_identity`         | **needs_manual_review**      | Fallback OK för lane men ej auto-kundkoppling                        |
| `unsupported_message_shape`         | **bugfix_needed**            | Key/format-mismatch worklist ↔ snapshot builder                      |
| `corrupted_or_incomplete_truth_row` | **bugfix_needed**            | Data repair                                                          |

---

## Varför samma 775 fastnade (pass 7)

Render-logg (17:27–17:30 UTC):

```
START  truth=9338 enriched=8563 gap=775 coverage=91.7% baselineEnriched=9054
DONE   batches=416 truth=9338 enriched=8563 gap=775 coverage=91.7% (oförändrat)
```

Tolkning:

1. **Parser-tom output (~70%):** Scoped merge kördes men delta-rader saknade workflow-signaler. Merge-fix bevarar baseline, så coverage står still — korrekt fail-safe.
2. **Snapshot conversations=0 (~tidigt):** Historiska trådar utanför 365d lookback (fixat i `0ff8af6d`, scoped filter bypass).
3. **Key mismatch (misstänkt):** Worklist `conversationKey` vs message `graphMessageId`-fallback (`mailbox:graph:msgId`) kan ge falsk `missing_graphMessageId` i analys — **bugfix_needed** i gap-analys + snapshot builder.

---

## Väg till `readyForWork=true`

### Scenario A — Exkludera + fallback (rekommenderad)

| Steg | Åtgärd                                                            | Effekt                           |
| ---- | ----------------------------------------------------------------- | -------------------------------- |
| 1    | Exkludera ~130–200 system/duplicate/out-of-scope från denominator | Ny denominator ≈ 9 140–9 200     |
| 2    | Regelbaserad fallback för ~550–650 parser-empty                   | +550–650 enriched                |
| 3    | Projicerad coverage                                               | **≥99,5%** utan fler blinda pass |

```text
Nu:     8563 / 9338 = 91,7%
Efter:  (8563 + 600) / (9338 - 170) ≈ 99,6%  (illustrativt)
```

### Scenario B — Endast exkludering

| Metric                            |                    Värde |
| --------------------------------- | -----------------------: |
| Exkludera                         |                     ~170 |
| Ny coverage (ingen ny enrichment) | ~8563 / 9168 ≈ **93,4%** |
| Räcker inte för 99,5%             |                       ❌ |

### Scenario C — Sänk tröskel till 91%

| Risk           | Beskrivning                                           |
| -------------- | ----------------------------------------------------- |
| Hög            | Worklist fylls med osäkra rader; lanes/SLA opålitliga |
| Rekommendation | **Avråds**                                            |

---

## Risker

| Åtgärd                     | Risk                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **Fallback-enrich**        | Fel lane/intent utan customerId; mitigera med `admin_low` / `waiting_reply` defaults    |
| **Exkludera denominator**  | Maskerar data debt; kräver dokumenterad exkluderingslista i ops                         |
| **Fler blinda pass**       | O(n) capability-store bloat, OOM, baseline-regression — **stoppa tills gap analyserat** |
| **Deploy/restart mid-run** | Nollställer in-memory baseline; alltid vänta på coverage-stabilisering före analys      |

---

## Verktyg (implementerat, read-only)

| Artefakt                                      | Syfte                 |
| --------------------------------------------- | --------------------- |
| `src/ops/ccoInboxEnrichmentGapAnalysis.js`    | Bucket-logik          |
| `GET /api/v1/ops/cco/enrichment/gap-analysis` | Prod read-only export |
| `scripts/analyze-enrichment-gap.js`           | Rapportgenerator      |

**Körning (efter baseline reload, utan deploy):**

```bash
node scripts/analyze-enrichment-gap.js --write-report --detail-limit 775
```

---

## Nästa steg (ingen write-fix ännu)

1. **Deploy** `4f054dda` till Frankfurt → kör `run-enrichment-gap-recovery.js`
2. **Verifiera** coverage ≈ 8563 / 775 → giltig gap-export
3. **Beslut:**
   - Om majoritet `system_scrap` + `duplicate` → justera denominator → kör coverage igen
   - Om majoritet `enrichment_parser_empty` → bygg fallback-enrichment → kör
   - Om verkliga blockers (`missing_graphMessageId`, `unsupported_message_shape`) → bugfix + truth repair

---

## Bilaga: per-mailbox gap (pass 6, uppskattning)

| Mailbox                  | Gap (andel av 775) |
| ------------------------ | -----------------: |
| contact@hairtpclinic.com |               ~35% |
| egzona@hairtpclinic.com  |               ~30% |
| info@hairtpclinic.com    |               ~12% |
| kons@hairtpclinic.com    |                ~8% |
| marknad@hairtpclinic.com |                ~7% |
| övriga                   |                ~8% |

_Exakta per-mailbox-siffror genereras av gap-analysis endpoint när baseline är stabil._
