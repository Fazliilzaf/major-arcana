# CCO Drive History — Journal Import Batch 1

_Senast uppdaterad: 2026-06-14_
_Historisk körning: 2026-05-31 · Senaste omkörning: 2026-06-14_

**Status:** BATCH 1 COMPLETE (high-confidence journal-PDF)

> **Not om siffror:** Tabellen nedan visar **både historiskt totalresultat** (första prod-körningen 2026-05-31) och **senaste omkörning** (2026-06-14). Omkörningen hittade **0 nya kandidater** — det betyder inte att totalhistoriken är 0.

| Princip | Regel                                     |
| ------- | ----------------------------------------- |
| Drive   | Importkälla only — inga Drive-länkar i UI |
| CCO     | System of record                          |
| Kunder  | Inga nya kunder                           |
| Scope   | Journal-PDF, high-confidence only         |

---

## 1. Batch-resultat

### Historiskt totalresultat — 2026-05-31 (prod GO)

| Metric                    |               Värde |
| ------------------------- | ------------------: |
| **Journaler importerade** |             **546** |
| **Synliga på kundkort**   |             **546** |
| **Kunder berörda**        |             **546** |
| Duplicate/skipped         | 44 (38 dup, 6 skip) |
| Failed                    |                   0 |
| needsEncounterReview      |                 546 |
| Checksum OK               |                 546 |
| Timeline events           |                 546 |
| Audit events              |                 546 |
| Drive-länkar i payload    |               **0** |
| Nya kunder                |               **0** |

Källa: `data/reports/drive-journal-batch1-run.log` · pre-snapshot: `data/backups/pre-drive-journal-batch1-2026-05-31`

### Senaste omkörning — 2026-06-14 (0 nya kandidater)

| Metric                        | Värde |
| ----------------------------- | ----: |
| **Nya journaler importerade** | **0** |
| **Nya synliga på kundkort**   | **0** |
| Import candidates totalt      |     0 |
| Duplicate/skipped             |     0 |
| Failed                        |     0 |
| Nya kunder                    | **0** |

Källa: `data/reports/drive-journal-batch1-latest.json` · pre-snapshot: `data/backups/pre-drive-journal-batch1-2026-06-14`

### Faser (senaste omkörning)

| Fas    | Filer | Importerade | Visible | Failed | Stopp |
| ------ | ----: | ----------: | ------: | -----: | ----- |
| canary |     0 |           0 |       0 |      0 | —     |

## 2. Scope (dry-run baseline, senaste omkörning)

| Metric                   |                                              Värde |
| ------------------------ | -------------------------------------------------: |
| Import candidates totalt |                                                  0 |
| Canary-kunder            |                                                 40 |
| Pre-snapshot             | `data/backups/pre-drive-journal-batch1-2026-06-14` |

## 3. Coverage-delta

| Metric                                          | Värde |
| ----------------------------------------------- | ----: |
| Kunder med journaler                            |     — |
| Kunder med Drive-journaler (sourceSystem=drive) |     — |
| RED → förbättrad                                |     — |
| ORANGE → förbättrad                             |     — |
| YELLOW → förbättrad                             |     — |
| Duplicate halso-journaler (unchanged)           |  2556 |
| Review queue kvar                               |     — |

## 4. Guardrails

- Secure storage utanför repo: OK
- Inga binärer i GitHub: OK
- Stopp-villkor: ingen
- Nästa steg: **bildimport/fas-review planeras separat** — ej auto-start

---

_Batch 1 — första riktiga Drive journal-import. Ej full prod-import._
