# ORD-29 — PNR enrichment from Dataexport (separate track)

**Skapad:** 2026-06-16 (owner GO facit)  
**Status:** **Tested — insufficient data source** (2026-06-16) — script shipped + prod commit (1 enrichment); review-reprocess metrics unchanged vs baseline; **not** an open implementation track  
**Owner:** Cursor (implementation) · Codex (review / prod execution split as appropriate)

---

## Problem statement

Fas 2 HD mailbox ingest matches patients primarily via **personnummer (PNR)** mot patient master. Review queue entries (~76) and batch 1 dry-run showed **matched 0** / high **unmatched** because many master records lack PNR even after a successful **Kundexport** customer sync.

HD reprocess dry-run efter Kundexport CSV-commit (2026-06-16): **ingen förbättring** — `stillUnmatched` **53**, stats `unmatched` **46** (samma som baseline).

---

## Why Kundexport is insufficient

- Exportfil: `Kundexport_nya 1 maj 2021 - 16 juni 2026.csv` (facit path under handover import doc).
- Sync resultat: +50 net patienter i prod master — **fungerar** som customer delta.
- Kundexport har **ingen Personnummer-kolumn** → kan inte fylla `patient.identifiers.personnummer` (eller motsvarande fält) som HD-matchning kräver.

---

## Why raw Dataexport customer sync is wrong

- **Dataexport** är **boknings-/besöksgrain** (en rad per bokning), inte en rad per kund.
- `sync:cliento-customers` / befintlig Cliento CSV-parser är byggd för **kundexport-grain** — körning på Dataexport ger fel domänmodell och är **inte** godkänd väg för customer sync.
- Parsern för standard customer sync **ignorerar** Personnummer även om kolumnen finns i Dataexport.

**Conclusion:** PNR måste plockas i ett **separat enrichment-steg** från Dataexport, inte via fortsatt Kundexport-sync eller bulk customer sync på Dataexport.

---

## Proposed minimal implementation

1. **Parse** Cliento Dataexport CSV (bokningsexport) med explicit kolumnmappning för `Personnummer` (och `Kund-id` / e-post för join).
2. **Dedupe** till en rad per `Kund-id` (senaste icke-tomma PNR, eller tydlig prioritetsregel — dokumentera i script).
3. **Map** Personnummer → befintlig patient master record:
   - Primär: match på Cliento **Kund-id** fingerprint / external id om redan i master.
   - Fallback: normaliserad e-post (samma regler som HD ingest).
4. **Upsert** endast PNR-fält (och metadata som `pnrSource`, `pnrEnrichedAt`) — **ingen** full customer replace från bokningsgrain.
5. **Dry-run** rapport: hur många master records får PNR, konflikter, review-needed.

### Script (spec / stub)

- **Path:** `scripts/enrich-patient-master-pnr-from-dataexport.js`
- **Modes:** `--dry-run` (default) · `--commit` (efter owner OK + prod token)
- **Input:** `--from <path-to-dataexport.csv>` (PII — aldrig committa fil eller rapport)

### npm script placeholder

```json
"enrich:patient-master-pnr-from-dataexport": "node scripts/enrich-patient-master-pnr-from-dataexport.js"
```

Körning:

```bash
npm run enrich:patient-master-pnr-from-dataexport -- --from ./path/to/Dataexport.csv --dry-run
npm run enrich:patient-master-pnr-from-dataexport -- --from ./path/to/Dataexport.csv --commit --prod
```

### Implementation facit (2026-06-16)

- **Script:** `scripts/enrich-patient-master-pnr-from-dataexport.js` (+ lib `scripts/lib/enrichPatientMasterPnrFromDataexport.js`, tests `tests/ops/enrichPatientMasterPnrFromDataexport.test.js`)
- **Dataexport dry-run (prod patients):** 6475 unika Kund-id · 10 med giltigt PNR · **wouldEnrich 1** (email) · skipAlreadyHasPnr 7 · skipPnrConflict 1 · ambiguous 1
- **Prod commit:** 1 patient enriched (`pnrSource: cliento_dataexport`)
- **Review-reprocess dry-run efter commit:** `stillUnmatched` **53** · `wouldMatchNow` **15** · stats `unmatched` **46** — oförändrat vs baseline (endast 1 prod-PNR tillagd; Dataexport har få PNR-rader)
- **verify:ord29-prod-sticks:** PASS (14/14)

Körning (facit när implementerad):

```bash
npm run enrich:patient-master-pnr-from-dataexport -- --from ./path/to/Dataexport.csv --dry-run
```

### Acceptance criteria

- Efter enrichment **dry-run/commit** och valfri prod push av master-delta:
  - `npm run ingest:halso-hd-review-reprocess -- --dry-run` visar **material drop** i `stillUnmatched` / stats `unmatched` vs 2026-06-16 baseline (**53** / **46**).
- `npm run verify:ord29-prod-sticks` fortfarande **PASS**.
- Inga nya falska HD clears (Phase 1 signallogik oförändrad).

---

## Out of scope (låsta tills PNR track visar improvement)

- **Batch 2** `ingest:halso-hd-batch -- --batch 2`
- `ingest:halso-hd-review-reprocess -- --commit`
- `mass-paminnelse` / andra bulk-jobb i samma session
- Återuppta generisk Kundexport-sync som “fix” för HD matchning

---

## Relaterade docs

- `docs/handover/ORDERS/ORD-29-import-halso-health-declarations.md` (GO CSV commit facit)
- `docs/handover/ORDERS/ORD-29-FAS2-GO-RUNBOOK.md` (batch GO — blocker section)

## Conclusion

Dataexport-backed PNR enrichment is **implemented and exercised in prod**, but the **data source is too sparse** (10 Kund-id with valid PNR in export; only 1 safe prod enrich) to materially improve HD mailbox matching (`stillUnmatched` **53**, stats `unmatched` **46**, `wouldMatchNow` **15** unchanged after commit). **Fas 2 batch ingest is not blocked on code** — it is blocked on **getting PNR into patient master** via clinic records, manual triage, or a future richer PNR export. Do **not** resume batch 2 or review-reprocess `--commit` until stickprov or queue metrics improve. Next operational track: **`ORD-29-MANUAL-REVIEW-TRIAGE.md`**.

---

_Hair TP · ORD-29 PNR enrichment track · 2026-06-16_
