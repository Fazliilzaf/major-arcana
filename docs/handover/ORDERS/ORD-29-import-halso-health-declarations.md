# ORD-29 — Import hälsodeklarationer via halso@ mailbox-ingest

**Skapad:** 2026-06-04 (Claude spec · iCloud)  
**Assignee:** Cursor (write — backend)  
**Claude-spår:** Spec + historisk import (~1660 via `m365_halso`) + UAT efter deploy  
**Prio:** P0

| Fas                                            | Status                                                    | Deploy                                                |
| ---------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| **Phase 1** — enrichment (Claude `m365_halso`) | **CLOSED** (UAT PASS 2026-06-16)                          | **Live**                                              |
| **Phase 2** — mailbox struktur-ingest          | **Operativt blockerad av PNR-källa, inte implementation** | Batch PUT (flag fortfarande false) · **batch 2 HOLD** |

---

## Phase 1 — Claude-spår (deploy nu)

**Mål:** `missingHealthDeclaration` rensas **enbart** när patient har faktiskt HD-dokument — inga falska “har HD”.

### Signallogik

| Signal                                                             | Räknas som HD | Användning                     |
| ------------------------------------------------------------------ | ------------- | ------------------------------ |
| Asset `category: form`                                             | Ja            | `hasHealthDeclarationDocument` |
| `m365_halso` + `category: other` (ej injektions-journal i filnamn) | Ja            | Claude-import ~1660            |
| `m365_halso` + `category: journal/agreement/consent`               | **Nej**       | Undvik false clear             |
| `hasHalso` (valfri `m365_halso`-asset)                             | —             | Segment-badge **halso@** only  |
| `patient.healthDeclaration` (Phase 2)                              | Ja            | Efter Phase 2-deploy           |

### Kod

- `src/ops/ccoKunderEnrichment.js` — `isHealthDeclarationAsset`, `patientHasHealthDeclarationAsset`
- `tests/ops/ccoKunderEnrichment.test.js` — positiv/negativ + injektions-journal

### Claude UAT (Phase 1)

- [x] Känd patient **med** `m365_halso` form/other: `missingHealthDeclaration: false`
- [x] Känd patient **utan** HD-asset: `missingHealthDeclaration: true` (ingen false clear)
- [x] Segment `halso@` ~1660 (badge ≠ HD-status)
- [x] Smart Nästa Steg blocker “Saknar hälsodeklaration” försvinner bara vid faktisk HD

**Omar ref-patient WARN (facit):** stickprov-UUID `3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12` → **404** i prod patient-master (referens-ID, **ej blockerande**; förväntat WARN i sticks).

**Prod verify 2026-06-16:** `npm run verify:ord29-prod-sticks` **14/14 PASS** (exit 0). Stickprov API: 4/5 `missingHealthDeclaration=false` (Michael, Fahed, Johan, Henrik); Omar ref-patient **WARN** — 404 i prod patient-master (referens-ID, ej blockerande).

---

## Phase 2 — Mailbox struktur-ingest (owner GO 2026-06-16)

**Mål:** Löpande mejl → `patient.healthDeclaration` (answers, flags, allergier).

| Modul                                            | Roll                          |
| ------------------------------------------------ | ----------------------------- |
| `src/ops/ccoHalsoHealthDeclarationParser.js`     | Parser                        |
| `src/ops/ccoHalsoHealthDeclarationIngest.js`     | Match, upsert, dedup          |
| `src/ops/ccoMailIngestion/pipeline.js`           | Gren före non-patient-dismiss |
| `scripts/run-halso-health-declaration-ingest.js` | Prod mail-ingestion (valfri)  |
| `scripts/run-halso-hd-batch-ingest.js`           | **Primär Fas 2 GO-väg** (PUT) |

**Förutsättningar:** Graph lokalt · prod owner-token · corpus `complete: true` · `ARCANA_CCO_HALSO_HD_INGEST_ENABLED=false` (batch PUT-modell).

**Körschema:** Se `docs/handover/ORDERS/ORD-29-FAS2-GO-RUNBOOK.md`.

### Fas 2 execution checklist (explore report)

- [ ] **1. Fas 0 sanity** — `npm run dry-run:halso-hd -- --max 500 --stickprov 5 --out ./data/reports/halso-hd-dry-run.json` (valfritt om redan signerat)
- [ ] **2. Corpus scan** — `npm run scan:halso-hd-corpus` (resume: `--resume`); checkpoint `complete: true` + `halso-hd-corpus-index.jsonl`
- [x] **3. Batch dry-run batch 1** — `npm run ingest:halso-hd-batch -- --batch 1 --dry-run`; granska `halso-hd-batch-report.json` (PII, committa inte)
- [x] **4. Stickprov** (batch 1 GO: `halso-hd-dry-run-go.stickprov.json`) — `npm run push:halso-hd-stickprov-prod -- --from ./data/reports/halso-hd-dry-run.stickprov.json` → `npm run verify:ord29-prod-sticks`
- [x] **5. GO batch commit** (batch 1 — se tabell nedan) — `npm run ingest:halso-hd-batch -- --batch N --commit` per batch (endast efter dry-run + stickprov PASS)
- [ ] **6. Review queue** — `ingest:halso-hd-review-reprocess --dry-run` → `--commit` efter Cliento-delta
- [ ] **7. Löpande ingest** — scheduler `cco_halso_hd_mailbox_ingest` (8h, 3-dagars lookback); mail-ingestion-väg (`ingest:halso-hd`) endast om flag flip beslutas
- [ ] **8. UAT** — `verify:ord29-prod-sticks` + valfritt `capture:ord29-browser-uat`

**2026-06-16 preflight (owner GO):**

| Gate                                                            | Resultat                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `node --test tests/ops/ccoHalsoHealthDeclarationIngest.test.js` | **11/11 PASS**                                                      |
| `halso-hd-corpus.checkpoint.json`                               | **complete: true** (100 HD headers, 5293 mejl skannade)             |
| `dry-run:halso-hd --max 50 --stickprov 3`                       | **ok** → `./data/reports/halso-hd-dry-run-go.json` (Graph creds OK) |

**Batch 1 — GO run 2026-06-16** (corpus 100 HD headers · batch size 50 · prod `6817e200`):

| Steg                                     | Resultat                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dry-run batch 1                          | **ok** — processed 50 · parsedOk 50 · parseFailed 0 · matched 0 · needsReview 0 · duplicate 23 · unmatched 27 · putOk 0 |
| Stickprov push                           | **ok** — `halso-hd-dry-run-go.stickprov.json` · 3/3 PUT ok (`halso-stickprov-2026-06-16`)                               |
| `verify:ord29-prod-sticks` (pre-commit)  | **14/14 PASS** (1 WARN: ref patient 3cdf4d6c saknas i prod)                                                             |
| Commit batch 1                           | **ok** — samma counts som dry-run · putOk 0 · putFailed 0 (inga nya match → inga PUT)                                   |
| `verify:ord29-prod-sticks` (post-commit) | **14/14 PASS**                                                                                                          |

### GO CSV commit facit (2026-06-16)

**Kundexport only:** `/Users/fazlikrasniqi/Downloads/Kundexport_nya 1 maj 2021 - 16 juni 2026.csv`

| Steg                                                    | Resultat                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run sync:cliento-customers -- --commit` (CSV)      | created **50**, updated **11**, unchanged **6455**, reviewQueued **376**, invalid **0**                                                                             |
| `npm run push:cliento-delta-prod`                       | **127** PUT ok · prod patient master **7288 → 7338** (+50 net)                                                                                                      |
| `npm run ingest:halso-hd-review-reprocess -- --dry-run` | wouldMatchNow **15**, stillUnmatched **53**, needsReview **8**, duplicate **10**, stats unmatched **46** · putOk **0** — **ingen förändring vs baseline** (pre-CSV) |

**Slutsats:** Kundexport-sync fungerade (+50 patienter i master). ORD-29 HD-matchning **förbättrades inte** — flaskhals kvar: **PNR saknas i patient master** (Kundexport har **ingen Personnummer-kolumn**).

- **Dataexport** användes **inte** för sync (bokningsexport, fel grain).
- **mass-paminnelse** exkluderad från detta spår.

### Facit 2026-06-16 (låst — PNR-källa, inte kod)

| Spår                                | Resultat                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CSV Kundexport**                  | `sync:cliento-customers --commit`: created **50**, updated **11** · `push:cliento-delta-prod`: prod master **7288 → 7338** (+50 net)                                                       |
| **HD review-reprocess** (efter CSV) | `wouldMatchNow` **15**, `stillUnmatched` **53**, stats `unmatched` **46**, `putOk` **0** — **ingen förbättring** vs baseline                                                               |
| **PNR enrichment (Dataexport)**     | Prod commit: **1** patient enriched (`pnrSource: cliento_dataexport`) · **10** unika Kund-id med giltigt PNR i export · review-reprocess dry-run **oförändrad** (**53** / **46** / **15**) |
| **Dataexport PNR**                  | För gles för bulk-matchning — enrichment-spår **testat, otillräcklig källa**                                                                                                               |
| **Batch 2**                         | **HOLD** tills bättre PNR-källa eller manuell triage ger stickprov-förbättring                                                                                                             |

**Beslut (låsta 2026-06-16):**

- **NO** batch 2 (`ingest:halso-hd-batch -- --batch 2`)
- **NO** `ingest:halso-hd-review-reprocess -- --commit`
- **NO** mer bulk Kundexport/Dataexport-sync som “fix” för HD-matchning
- **Nästa spår:** **manuell review-queue triage** (staff/owner) — se `ORD-29-MANUAL-REVIEW-TRIAGE.md`. PNR enrichment-doc: `ORD-29-PNR-ENRICHMENT.md` (**tested — insufficient**).

**Tidigare hold (API key):** Första blocker var `cliento_api_key_missing` (exit 2). CSV-commit löste customer-delta men **inte** HD reprocess-metrics.

**Phase 2 status:** **Operativt blockerad av PNR-källa, inte implementation** — pipeline/deploy klar; matchning väntar PNR i master eller manuell länkning.

**Committa aldrig:** `data/reports/halso-hd-*.json`, `*.stickprov.json`, review queue JSONL.

---

_Cursor rapport 2026-06-05 · Phase 1 commit = enrichment only · Phase 2 commit = ingest pipeline (hold deploy)_  
_Fas 2 owner GO dokumenterad 2026-06-16 · runbook ORD-29-FAS2-GO-RUNBOOK.md · manual triage ORD-29-MANUAL-REVIEW-TRIAGE.md_
