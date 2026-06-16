# ORD-29 — Manual review-queue triage (surgical track)

**Skapad:** 2026-06-16  
**Status:** **OPEN** — active ops track while Fas 2 batch ingest is **HOLD**  
**Relaterat:** Fas 2 blockerad på PNR i patient master — **inte** på ingest-implementation (`ORD-29-import-halso-health-declarations.md`)

---

## Problem

- Review queue: **~76** items (JSONL lokalt, PII — committa aldrig).
- Dominant failure mode: **`personnummer_not_in_cliento`** — parsed HD har PNR men master saknar matchande PNR/Cliento-länk.
- Automated paths **exhausted** for material improvement:
  - Kundexport customer sync (+50 net master) — **no** HD reprocess delta.
  - Dataexport PNR enrichment (1 prod enrich) — **no** reprocess delta (**53** / **46** / **15** unchanged).

Batch 2, review-reprocess `--commit`, and further bulk Cliento sync are **out of scope** for this track.

---

## Scope

**In scope**

- Staff/owner **manually** links HD forms to the correct patient in master, **or**
- Adds **PNR** to master for **high-value stickprov** patients when PNR is known from clinic records (not from gitignored exports in docs).

**Out of scope**

- `ingest:halso-hd-batch -- --batch 2`
- `ingest:halso-hd-review-reprocess -- --commit`
- Additional bulk `sync:cliento-customers` / Dataexport enrichment runs expecting HD metrics to move

---

## Suggested workflow

### a) Export review-queue summary (no PII in docs)

Use local reports only; do not paste patient identifiers into handover.

```bash
cd /Users/fazlikrasniqi/Code/major-arcana

# Aggregate batch + reprocess outcomes (gitignored report paths)
node scripts/summarize-halso-hd-batch-outcomes.js data/reports/halso-hd-review-reprocess-report.json

# Queue source (PII)
# data/reports/halso-hd-review-queue.jsonl
```

Optional dry-run to refresh metrics:

```bash
npm run ingest:halso-hd-review-reprocess -- --dry-run
```

### b) Prioritize stickprov patients

From `scripts/run-import-plan-uat.js` (HD import plan UAT):

| Label                    | Role              |
| ------------------------ | ----------------- |
| Michael Ohgami (HD mail) | Primary stickprov |
| Fahed Abbas              | Primary stickprov |
| Johan Magnusson          | Primary stickprov |
| Henrik Martinsson        | Primary stickprov |

Also run `node scripts/run-import-plan-uat.js` for live prod readout on these IDs.

### c) Per stickprov patient

1. Verify patient exists in prod patient master (staff kundkort / API).
2. If PNR known from **clinic records**, add/update PNR on master (owner tooling or approved prod edit path — **not** documented PII here).
3. Re-run **single-patient** or narrow reprocess dry-run; only `--commit` when owner explicitly approves and metrics improve.

```bash
npm run ingest:halso-hd-review-reprocess -- --dry-run
# narrow flags per script help if/when supported; else manual link + verify sticks
npm run verify:ord29-prod-sticks
```

---

## Acceptance

- Stickprov patients (Michael, Fahed, Johan, Henrik) show **`missingHealthDeclaration` / match improvement** after manual PNR or patient link, **or**
- Documented **N/A** with reason (e.g. no PNR in clinic records, duplicate HD, wrong mailbox sender).

`npm run verify:ord29-prod-sticks` remains **PASS** (14/14); no Phase 1 false HD clears.

---

## Owner vs Cursor/Codex

| Party                    | Responsibility                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| **Owner / clinic staff** | Source of truth for PNR from records; manual patient↔HD linking in prod UI; GO for any `--commit` |
| **Cursor**               | Scripts/docs, dry-run reports, stickprov verify, tiny cross-links in handover                     |
| **Codex**                | Review prod execution steps, sanity-check metrics before commit                                   |

---

## Relaterade docs

- `ORD-29-import-halso-health-declarations.md` — Fas 2 facit 2026-06-16
- `ORD-29-PNR-ENRICHMENT.md` — tested, insufficient Dataexport
- `ORD-29-FAS2-GO-RUNBOOK.md` — batch 2 HOLD banner
- `ORD-29-CLOUD-STAFF-UAT.md` — Fas 1 CLOSED; Fas 2 blocked note

_Hair TP · ORD-29 manual review triage · 2026-06-16_
