# ORD-29 Fas 2 — Batch ingest GO runbook

**Owner GO:** 2026-06-16  
**Repo:** `/Users/fazlikrasniqi/Code/major-arcana`  
**Prod:** `https://arcana.hairtpclinic.com`  
**Mailbox:** `halso@hairtpclinic.com`

**Modell:** Batch PUT mot prod patient-master (`ingest:halso-hd-batch`).  
`ARCANA_CCO_HALSO_HD_INGEST_ENABLED` förblir **false** (ingen bootstrap/OOM-väg).

**Committa aldrig:** rapporter under `data/reports/halso-hd-*`, stickprov-filer, review queue JSONL (PII).

> **HOLD — batch 2 blocked (2026-06-16):** Do **not** run `ingest:halso-hd-batch -- --batch 2` or `ingest:halso-hd-review-reprocess -- --commit` until patient master has more PNR (manual triage or better export). Kundexport + Dataexport enrichment **tested** — no HD reprocess improvement. See `ORD-29-MANUAL-REVIEW-TRIAGE.md`.

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

## Blocker — PNR enrichment (2026-06-16, owner GO)

**Status:** Batch 2 **hold**. CSV **Kundexport** sync succeeded (+50 net in prod master) but HD review-reprocess dry-run **unchanged** vs baseline — **not** sufficient for HD reprocess improvement.

**Kundexport CSV path (tested):** `/Users/fazlikrasniqi/Downloads/Kundexport_nya 1 maj 2021 - 16 juni 2026.csv`

| Step                     | Command                                                 | Result                                                                                                                                       |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliento → patient master | `npm run sync:cliento-customers -- --commit` (CSV)      | created **50**, updated **11**, unchanged **6455**, reviewQueued **376**, invalid **0**                                                      |
| Push delta prod          | `npm run push:cliento-delta-prod`                       | **127** PUT ok · prod **7288 → 7338** (+50 net)                                                                                              |
| Review reprocess dry-run | `npm run ingest:halso-hd-review-reprocess -- --dry-run` | wouldMatchNow **15**, stillUnmatched **53**, needsReview **8**, duplicate **10**, unmatched **46** · putOk **0** — **NO change vs baseline** |

**Why CSV Kundexport is insufficient for HD reprocess:** no **Personnummer** column → patient master still lacks PNR for HD mailbox matching. **Dataexport** was **not** used for customer sync (booking grain; wrong for `sync:cliento-customers`). **mass-paminnelse** excluded.

**Decision (locked):**

- **NO** batch 2 yet
- **NO** `ingest:halso-hd-review-reprocess -- --commit`
- **Next track:** Manual review-queue triage (staff/owner) — see **`docs/handover/ORDERS/ORD-29-MANUAL-REVIEW-TRIAGE.md`**. PNR enrichment tested insufficient — **`ORD-29-PNR-ENRICHMENT.md`**

PII report (gitignored): `data/reports/halso-hd-review-reprocess-report.json` · summary: `node scripts/summarize-halso-hd-batch-outcomes.js` on that path.

## Relaterade docs

- `docs/handover/ORDERS/ORD-29-import-halso-health-declarations.md`
- `docs/handover/ORDERS/ORD-29-CLOUD-STAFF-UAT.md` (Fas 1)
- `docs/handover/ORDERS/ORD-6-29-LINEAR-CLOSE-COMMENT.md`
- `docs/handover/ORDERS/ORD-29-PNR-ENRICHMENT.md` (PNR — tested, insufficient source)
- `docs/handover/ORDERS/ORD-29-MANUAL-REVIEW-TRIAGE.md` (active ops track)

_Hair TP · ORD-29 Fas 2 GO runbook · 2026-06-16_
