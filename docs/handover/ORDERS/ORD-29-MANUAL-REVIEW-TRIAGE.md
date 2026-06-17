# ORD-29 — Manual review-queue triage (surgical track)

**Skapad:** 2026-06-16  
**Status:** **CLOSED** — kirurgisk triage **Fall A/B/C PASS** (2026-06-16)  
**Relaterat:** Fas 2 batch ingest fortsatt **HOLD** (`ORD-29-import-halso-health-declarations.md`)

> **Slutsats:** ORD-29 Fas 2 är operativt blockerad av PNR-källa, inte implementation. Kirurgisk manual triage (A/B/C) är **klar**; resterande review-kö kräver samma mönster per fall — ingen batch 2.

---

## Slutrapport — kirurgisk triage (2026-06-16)

| Fall  | Patient             | Utfall   | Notering                                                                         |
| ----- | ------------------- | -------- | -------------------------------------------------------------------------------- |
| **A** | Tawab Samadi        | **PASS** | PNR + match + commit; readout-fix `e607fb91` (hydrate `hdSignedAt` / `hdSource`) |
| **B** | Karl-Johan Lundholm | **PASS** | PNR/master-gap löst; HD verified, `missingHealthDeclaration=false`               |
| **C** | Jonny Kraft         | **PASS** | Disambiguation + PNR; HD verified, `missingHealthDeclaration=false`              |

**Referens-stickprov** (Michael, Fahed, Johan, Henrik): redan gröna — **ej** triage-mål, endast verify-referens.

**Tekniskt tillägg:** `fix(ord-29): hydrate patient HD readout from healthDeclaration` (`e607fb91`) — top-level HD-fält projiceras från `patient.healthDeclaration` i API + `fetchPatient`.

**Verify per fall (prod):** `personnummerPresent`, `hdSignedAt`, `hdSource=halso_mailbox`, `hasHealthDeclaration=true`, `missingHealthDeclaration=false`.

**Ingen vidare terminal-work** på A/B/C. Batch 2 fortsatt **HOLD**.

### Copy-paste closeout (EN)

```text
ORD-29 manual triage status:
- Fall A / Tawab Samadi — PASS
- Fall B / Karl-Johan Lundholm — PASS
- Fall C / Jonny Kraft — PASS
All three HD cases matched, committed, and verified. missingHealthDeclaration=false.
```

### Copy-paste closeout (Slack / Linear)

```text
ORD-29 triage complete: Fall A (Tawab), Fall B (Karl-Johan), Fall C (Jonny) = PASS.
All three HD cases matched, committed, verified, and no longer show false missingHealthDeclaration.
No further A/B/C terminal work needed. Batch 2 remains HOLD.
```

---

## Canonical brief (copy-paste)

```text
ORD-29 — MANUAL REVIEW-QUEUE TRIAGE

Mål:
Rensa de viktigaste falska missingHealthDeclaration-fallen kirurgiskt, patient för patient, utan batch 2.

Bakgrund:
ORD-29 Fas 2 är blockerad av PNR-källa, inte implementation.
CSV-sync och PNR-enrichment från Dataexport är testade och fungerar tekniskt, men förbättrar inte reprocessen meningsfullt.
Batch 2 är HOLD.

Detta spår ska därför vara manuellt och strikt.

Regler:
- Inga breda batch-körningar
- Ingen batch 2
- Ingen namn-only merge
- Endast stark matchning eller manuell klinikbekräftelse
- Dokumentera varje patientutfall tydligt

Prioritet:
Börja med stickprovspatienterna:
1. Michael
2. Fahed
3. Johan
4. Henrik

För varje patient:
1. Bekräfta om rätt patient finns i master
2. Kontrollera om PNR faktiskt finns i klinikens verkliga underlag
3. Om PNR finns och patienten är säker:
   - lägg/korrigera PNR i master
   - kör en-patient reprocess / verify
   - kontrollera:
     - hdSignedAt
     - hasHealthDeclaration = true
     - missingHealthDeclaration = false
4. Om PNR inte finns i verkligheten:
   - markera fallet som N/A / kvar unmatched
   - skriv orsak tydligt
5. Ingen commit utan att utfallet för patienten är verifierat

Rapportera för varje patient:
- PASS / FAIL / N/A
- om PNR lades till
- om reprocess ändrade status
- om missingHealthDeclaration försvann
- exakt blockerare om den inte gjorde det

Acceptans:
- Minst stickprovspatienterna genomgångna
- Varje fall har tydlig status
- Falska missingHealthDeclaration reduceras där verklig PNR finns
- Inga osäkra merges
- Ingen batch 2 öppnas som följd av detta arbete

Utanför scope:
- Ny batch-ingest
- Partner-API-spår
- Zapier-spår
- Generell massrensning av hela kön
```

---

## Owner-version (5 rader)

```text
ORD-29 manual triage: patient för patient, inga batch-körningar.
Börja med Michael, Fahed, Johan, Henrik.
Lägg PNR i master bara om kliniken har det — annars N/A.
Verifiera missingHealthDeclaration per patient innan commit.
Batch 2 fortsatt HOLD.
```

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
- `ingest:halso-hd-review-reprocess -- --commit` (bulk)
- Additional bulk `sync:cliento-customers` / Dataexport enrichment runs expecting HD metrics to move
- Partner-API / Zapier / massrensning av hela kön

---

## Suggested workflow

### a) Export review-queue summary (no PII in docs)

Use local reports only; do not paste patient identifiers into handover.

```bash
cd /Users/fazlikrasniqi/Code/major-arcana

node scripts/summarize-halso-hd-batch-outcomes.js data/reports/halso-hd-review-reprocess-report.json

npm run ingest:halso-hd-review-reprocess -- --dry-run
```

Queue source (PII, gitignored): `data/reports/halso-hd-review-queue.jsonl`

### b) Prioritize stickprov patients

From `scripts/run-import-plan-uat.js`:

| #   | Label                    |
| --- | ------------------------ |
| 1   | Michael Ohgami (HD mail) |
| 2   | Fahed Abbas              |
| 3   | Johan Magnusson          |
| 4   | Henrik Martinsson        |

```bash
node scripts/run-import-plan-uat.js
```

### c) Per stickprov patient

See **Canonical brief** above — steps 1–5 and reporting template.

```bash
npm run verify:ord29-prod-sticks
```

---

## Acceptance

- Stickprov patients show **`missingHealthDeclaration` / match improvement** after manual PNR or patient link, **or**
- Documented **N/A** with reason (e.g. no PNR in clinic records, duplicate HD, wrong mailbox sender).
- Each patient: **PASS / FAIL / N/A** recorded.
- `npm run verify:ord29-prod-sticks` remains **PASS** (14/14); no Phase 1 false HD clears.

---

## Owner vs Cursor/Codex

| Party                    | Responsibility                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| **Owner / clinic staff** | PNR from records; manual patient↔HD linking; GO per patient commit |
| **Cursor**               | Scripts/docs, dry-run reports, stickprov verify                    |
| **Codex**                | Review prod execution; sanity-check metrics before commit          |

---

## Relaterade docs

- `ORD-29-import-halso-health-declarations.md` — Fas 2 facit 2026-06-16
- `ORD-29-PNR-ENRICHMENT.md` — tested, insufficient Dataexport
- `ORD-29-FAS2-GO-RUNBOOK.md` — batch 2 HOLD banner
- `ORD-29-CLOUD-STAFF-UAT.md` — Fas 1 CLOSED; Fas 2 blocked note

_Hair TP · ORD-29 manual review triage · CLOSED 2026-06-16_
