# CCO Mail Pipeline Activation

**Datum:** 2026-06-01  
**Scope-bas:** [CCO-SYSTEM-SCOPE.md](./CCO-SYSTEM-SCOPE.md)  
**Importordning:** Cliento → halso@ → GetAccept → Drive safe-match ✅ → **Mail pipeline** (aktivt spår)  
**Regler:** Ingen ny mail-import · CCO = system of record · säker match → kundkort · osäker → review queue · inga Drive-länkar · ingen patientdata i GitHub

---

## Statusöversikt

| Steg | Beskrivning                                | Status                                                 |
| ---- | ------------------------------------------ | ------------------------------------------------------ |
| 1    | Pipeline coverage (prod read-only)         | ✅ Rapport uppdaterad                                  |
| 2    | Truth hydration från ingestion             | ✅ 3 520 customerIdentity-overlays (Fas A)             |
| 3    | Lanes / filter / SLA / risk / needs_action | ⚠️ Enrichment ~0,1% — kräver backfill-GO               |
| 4    | Mail → kundkort (truth-first read model)   | ✅ Kod klar (deploy pending)                           |
| 5    | Svarstudio / Smart anteckning trådkontext  | ⚠️ Delvis (replyTo + mailboxBadge; enrichment pending) |
| 6    | Multi-mailbox-koppling                     | ✅ summary.mailboxes + UI-banner                       |
| 7    | Rapporter per steg                         | ✅ Detta dokument + under-rapporter                    |

---

## Steg 1 — Pipeline coverage (2026-06-01 prod)

Källa: `node scripts/report-mail-pipeline-coverage.js --json`

| Lager                  |     Prod |
| ---------------------- | -------: |
| Ingestion raw          |    8 833 |
| Ingestion matched      |    3 240 |
| Ingestion unmatched    |        0 |
| Truth messages         |   33 344 |
| Truth conversations    |    9 338 |
| Enriched conversations | 9 (0,1%) |
| Operator thread states |        0 |

**Tolkning:** Mail finns i både ingestion och Graph-truth. Hydration kopplade ledger-kundId till truth. Enrichment/worklist är huvudblocker för lanes/SLA.

Detalj: [CCO-MAIL-PIPELINE-COVERAGE-2026-06-01.md](./CCO-MAIL-PIPELINE-COVERAGE-2026-06-01.md) (addendum nedan).

---

## Steg 2 — Truth hydration

**Status:** ✅ Klar (ingen ny import)

| Metric                   |      Värde |
| ------------------------ | ---------: |
| Customer overlay skrivna |      3 520 |
| Ingestion SHA            | oförändrad |
| Customer mismatch        |          0 |

Detalj: [CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md](./CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md)

---

## Steg 3 — Lanes / filter / SLA / risk / needs_action

**Status:** ⚠️ Blockerad på enrichment coverage

| Signal                                         |     Prod |
| ---------------------------------------------- | -------: |
| AnalyzeInbox truth gap                         |    9 329 |
| Consumer worklist                              |  0 rader |
| Scheduler `cco_inbox_enrichment_full_backfill` | disabled |

**Nästa (kräver separat GO):** Aktivera och köra enrichment full backfill på Frankfurt-prod — **inte** ny mail-import, endast berika befintlig truth.

---

## Steg 4–6 — Read model (Fas B, kod)

**Ändringar (branch `compliance/pipedrive-pii-purge`):**

- `ccoConversationThreadStore`: **truth-first** merge (truth + ingestion complement, dedupe på graphMessageId)
- API `/cco-customers/:id/conversation-threads` returnerar `summary` + `mailboxes`:
  - `latestInboundAt` / `latestOutboundAt`
  - `trueUnanswered`, `needsAction`, `handled`, `snoozed`
  - `multiMailbox`, `mailboxes[]`
- `cco-komm-panel.js`: mailbox-badge per rad + multi-mailbox-banner
- Preview: endast `bodyPreview`/snippet (max 140 tecken) — ingen rå body
- Tester: `tests/ops/ccoConversationThreadStore.test.js`

**Deploy:** Push + Render deploy `arcana` (Frankfurt) — samma tjänst som Fas A hydration.

---

## Blockers & regler

| Regel                       | Efterlevnad                                        |
| --------------------------- | -------------------------------------------------- |
| Ingen ny mail-import        | ✅                                                 |
| Säker match → kundkort      | ✅ via truth customerIdentity + ingestion ledger   |
| Osäker match → review queue | ✅ ingestion unmatched = 0; nya kunder skapas inte |
| Inga Drive-länkar           | ✅                                                 |
| Ingen patientdata i GitHub  | ✅ rapporter utan råtext                           |
| Enrichment full prod        | ⏸ Kräver separat GO                                |

---

## Nästa steg

1. **Deploy** Fas B read model till Frankfurt-prod
2. **GO:** Aktivera `cco_inbox_enrichment_full_backfill` + kör tills coverage ≥ tröskel
3. Wire Konversationer/Svarstudio mot enrichment worklist (lanes/SLA/risk)
4. Smart anteckning: tråd + mailbox + true_unanswered i panel-context
