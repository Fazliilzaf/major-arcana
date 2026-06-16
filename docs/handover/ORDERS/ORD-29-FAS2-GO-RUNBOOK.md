# ORD-29 Fas 2 — Batch ingest GO runbook

**Owner GO:** 2026-06-16  
**Repo:** `/Users/fazlikrasniqi/Code/major-arcana`  
**Prod:** `https://arcana.hairtpclinic.com`  
**Mailbox:** `halso@hairtpclinic.com`

**Modell:** Batch PUT mot prod patient-master (`ingest:halso-hd-batch`).  
`ARCANA_CCO_HALSO_HD_INGEST_ENABLED` förblir **false** (ingen bootstrap/OOM-väg).

**Committa aldrig:** rapporter under `data/reports/halso-hd-*`, stickprov-filer, review queue JSONL (PII).

---

## Preflight (varje session)

```bash
cd /Users/fazlikrasniqi/Code/major-arcana

node --test tests/ops/ccoHalsoHealthDeclarationIngest.test.js

# Checkpoint måste vara complete
cat data/reports/halso-hd-corpus.checkpoint.json | jq '{complete, hdHeadersFound: .hdHeadersFound, messagesScanned: .messagesScanned}'

npm run verify:ord29-prod-sticks
```

---

## Steg 1 — Fas 0 sanity (Graph parse + match, inga writes)

```bash
npm run dry-run:halso-hd -- --max 500 --stickprov 5 --out ./data/reports/halso-hd-dry-run.json
```

Granska `summary.ok` och `stats` i rapporten. Stickprov: `halso-hd-dry-run.stickprov.json` (PII).

Snabb GO-preflight (2026-06-16):

```bash
npm run dry-run:halso-hd -- --max 50 --stickprov 3 --out ./data/reports/halso-hd-dry-run-go.json
```

---

## Steg 2 — Corpus scan (index för batch)

```bash
npm run scan:halso-hd-corpus
```

Vid avbrott:

```bash
npm run scan:halso-hd-corpus -- --resume
```

**Klart när:** `data/reports/halso-hd-corpus.checkpoint.json` har `"complete": true` och `data/reports/halso-hd-corpus-index.jsonl` finns.

---

## Steg 3 — Batch dry-run (batch 1 först)

```bash
npm run ingest:halso-hd-batch -- --batch 1 --dry-run
```

Valfritt: `--batch-size 50`, `--form-type hd|fc|all`, `--out ./data/reports/halso-hd-batch-1-dry-run.json`

Granska stdout JSON (`stats`: matched, duplicate, needsReview, parseFailed).

---

## Steg 4 — Stickprov PUT + verify

```bash
npm run push:halso-hd-stickprov-prod -- --from ./data/reports/halso-hd-dry-run.stickprov.json

npm run verify:ord29-prod-sticks
```

**Gate:** `verify:ord29-prod-sticks` ska vara PASS innan `--commit`.

---

## Steg 5 — GO: batch commit (upprepa per batch)

**Kör endast efter steg 3–4 PASS och explicit owner OK.**

```bash
npm run ingest:halso-hd-batch -- --batch 1 --commit

npm run ingest:halso-hd-batch -- --batch 2 --commit
# … tills batchCount nådd (se dry-run rapport corpusTotal / batchSize)
```

Valfritt env vid commit:

```bash
export HALSO_HD_COMMIT_UNMATCHED_STUBS=true   # endast om beslutat
export HALSO_HD_BATCH_SIZE=50
```

Efter varje batch: spara rapport-sökväg lokalt (gitignored), notera `stats` i handover.

---

## Steg 6 — Review queue (unmatched / ambiguous)

```bash
npm run ingest:halso-hd-review-reprocess -- --dry-run

npm run ingest:halso-hd-review-reprocess -- --commit
```

Kör `--commit` efter Cliento customer-delta sync om matchning förbättrats.

---

## Steg 7 — Löpande ingest (post batch-GO)

**Standard (ingen flag flip):** prod scheduler-jobb `cco_halso_hd_mailbox_ingest` — 8h intervall, 3-dagars lookback.

**Alternativ (kräver deploy-beslut):** live mail-ingestion

```bash
# Prod env: ARCANA_CCO_HALSO_HD_INGEST_ENABLED=true + mail ingestion active
npm run ingest:halso-hd
```

Använd batch PUT som primär väg om flag fortfarande är false.

---

## Steg 8 — UAT

```bash
npm run verify:ord29-prod-sticks

npm run capture:ord29-browser-uat
```

Manuell staff-check: kundkort visar strukturerad HD där batch commit lyckats; `missingHealthDeclaration` följer Phase 1-regler tills Phase 2-data finns.

---

## Miljö / creds

| Krav                        | Notering                                                              |
| --------------------------- | --------------------------------------------------------------------- |
| Graph read lokalt           | `.env` / M365 app — dry-run och corpus scan                           |
| Prod owner token            | `node scripts/get-prod-auth-token.js --owner` (batch commit)          |
| `ARCANA_GRAPH_READ_ENABLED` | Prod (scheduler)                                                      |
| Bootstrap                   | `ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=false` — batch script loggar detta |

Om dry-run failar med auth/Graph: fixa creds innan corpus eller commit.

---

## Blocker — Cliento sync + reprocess (2026-06-16, owner GO)

**Status:** Batch 2 **hold** until Cliento customer-delta sync succeeds and review-reprocess dry-run shows material match improvement vs batch 1 slice (`unmatched` 27 on batch 1 dry-run).

| Step                     | Command                                                 | Result                                                                                                                                            |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliento → patient master | `npm run sync:cliento-customers`                        | **exit 2** — `cliento_api_key_missing` (0 patients synced). Set `CLIENTO_API_KEY` or CSV path per script hint; retry before reprocess `--commit`. |
| Review reprocess dry-run | `npm run ingest:halso-hd-review-reprocess -- --dry-run` | **exit 0** — queue 76 · patient master 7288                                                                                                       |

**Reprocess dry-run aggregates (no PII):**

| Metric                  | Count |
| ----------------------- | ----- |
| total processed         | 76    |
| wouldMatchNow (triage)  | 15    |
| stillUnmatched (triage) | 53    |
| needsReview (triage)    | 8     |
| duplicate (stats)       | 10    |
| unmatched (stats)       | 46    |
| putOk                   | 0     |

**Decision:** Do **not** run `ingest:halso-hd-review-reprocess -- --commit` yet — Cliento sync did not run; `stillUnmatched` not materially below batch 1 slice (27). Re-run **batch 1 dry-run** after successful Cliento sync, then batch 2 dry-run → stickprov → commit per runbook.

PII report (gitignored): `data/reports/halso-hd-review-reprocess-report.json` · summary: `node scripts/summarize-halso-hd-batch-outcomes.js` on that path.

## Relaterade docs

- `docs/handover/ORDERS/ORD-29-import-halso-health-declarations.md`
- `docs/handover/ORDERS/ORD-29-CLOUD-STAFF-UAT.md` (Fas 1)
- `docs/handover/ORDERS/ORD-6-29-LINEAR-CLOSE-COMMENT.md`

_Hair TP · ORD-29 Fas 2 GO runbook · 2026-06-16_
