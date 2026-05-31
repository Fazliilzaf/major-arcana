# CCO Drive History — Journal Import Batch 1

_Genererad: 2026-05-31T22:30:00.000Z_
_Batch-körning: 2026-05-31T22:01–22:14 UTC_
_Verifierad: 2026-05-31T22:30 UTC_

**Status:** BATCH 1 COMPLETE

| Princip            | Regel                                     |
| ------------------ | ----------------------------------------- |
| Drive              | Importkälla only — inga Drive-länkar i UI |
| CCO secure storage | Slutdestination                           |
| Kunder             | Inga nya kunder                           |
| Scope              | High-confidence journal-PDF only          |
| sourceSystem       | `drive_import`                            |

---

## 1. Batch-resultat

| Metric                    |                           Värde |
| ------------------------- | ------------------------------: |
| **Journaler importerade** |                         **546** |
| **Synliga på kundkort**   |         **542** (+ 1 DUPLICATE) |
| **Kunder**                |                         **247** |
| Duplicate/skipped         | 44 (38 dup, 6 utan driveFileId) |
| Failed                    |                           **0** |
| needsEncounterReview      |                             542 |
| Secure storage OK         |           **Ja** (utanför repo) |
| Checksum OK               |                     **546/546** |
| Timeline events           |                             546 |
| Audit events              |                             546 |
| Drive-länkar i payload    |                           **0** |
| Nya kunder                |                           **0** |

### Faser

| Fas                | Filer | Importerade | Visible | Failed |
| ------------------ | ----: | ----------: | ------: | -----: |
| Canary (40 kunder) |    96 |          93 |      93 |      0 |
| Remainder (auto)   |   494 |         453 |     453 |      0 |

Pre-snapshot: `data/backups/pre-drive-journal-batch1-2026-05-31`

---

## 2. Scope vs dry-run (821)

|                   | Dry-run (pre-import) | Batch 1 (strict) | Kvar efter batch |
| ----------------- | -------------------: | ---------------: | ---------------: |
| Import candidates |                  821 |     590 eligible |            **0** |
| Kunder            |                  347 |              249 |       0 (strict) |

**Förklaring:** Batch 1 exkluderade medium/low folder mappings (849 kunder). Det gav 590 eligible filer; 546 importerades, 44 skip (dup/saknar driveFileId).

231 filer räknas fortfarande som import*candidate i dry-run-logik men tillhör **review mappings** — exkluderade enligt regel \_inga medium/low*.

**Remainder-körning (2026-05-31):** 0 nya kandidater → batch redan complete.

---

## 3. sourceSystem-backfill

543 befintliga assets backfillade: `drive` → `drive_import` (provenance oförändrad).

---

## 4. Coverage-delta

| Metric                                      |   Värde |
| ------------------------------------------- | ------: |
| Kunder med journaler (synliga)              |    1017 |
| Kunder med Drive-journaler (`drive_import`) | **247** |
| Kunder med journal (coverage v8)            |    1014 |
| Encounter review pending                    |    5614 |
| Review mappings (unchanged)                 |     849 |
| Duplicate halso-journaler (unchanged)       |    2556 |

### Traffic light (v8)

| Färg   | Antal |     % |
| ------ | ----: | ----: |
| GREEN  |  2014 | 27.8% |
| YELLOW |   547 |  7.5% |
| ORANGE |   159 |  2.2% |
| RED    |  4537 | 62.5% |

---

## 5. Guardrails

| Check                   | Status |
| ----------------------- | ------ |
| Checksum mismatch       | 0      |
| Secure storage fail     | 0      |
| patientId saknas        | 0      |
| Drive-länk i payload/UI | 0      |
| Audit fail              | 0      |
| Fil i repo              | 0      |
| Oväntad duplicate-bugg  | 0      |

---

## 6. Nästa steg

**Bildimport/fas-review** — separat beslut. Startar **inte** automatiskt.

---

_Batch 1 — första riktiga Drive journal-import. Ej full prod-import._
