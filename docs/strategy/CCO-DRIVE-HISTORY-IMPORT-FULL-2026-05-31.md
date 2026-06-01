# CCO Drive History — Full Customer Import

_Genererad: 2026-06-01T00:12:00.799Z_
_Startad: 2026-05-31T23:53:05.322Z_

**Status:** FULL IMPORT COMPLETE

| Princip          | Regel                       |
| ---------------- | --------------------------- |
| CCO              | System of record            |
| Drive            | Importkälla only            |
| Säker kundmatch  | Importeras                  |
| Osäker kundmatch | Review queue, ingen ny kund |

---

## Sammanfattning

| Metric                            | Värde |
| --------------------------------- | ----: |
| Filer scannade (docs+images plan) | 24062 |
| Importerade                       | **0** |
| Kunder berörda                    | **0** |
| Journaler                         |     0 |
| Dokument                          |     0 |
| Bilder                            |     0 |
| needsClassification               |     0 |
| needsPhotoReview                  |     0 |
| needsEncounterReview              |     0 |
| Duplicate/skipped                 |     0 |
| Failed                            |     0 |
| Checksum OK                       |     0 |
| Review queue (fas 4)              | 31672 |
| Timeline events                   |     0 |
| Audit events                      |     0 |
| Drive-länkar                      | **0** |
| Nya kunder                        | **0** |

## Faser

| Fas             | Scannade | Importerade | Failed | Snapshot                                                                                        |
| --------------- | -------: | ----------: | -----: | ----------------------------------------------------------------------------------------------- |
| documents       |     1564 |           0 |      0 | `—`                                                                                             |
| images          |    22498 |           0 |      0 | `—`                                                                                             |
| customer_review |    31659 |           0 |      0 | `/Users/fazlikrasniqi/Code/major-arcana/data/backups/pre-drive-full-customer_review-2026-05-31` |

## Coverage

| Metric                            | Värde |
| --------------------------------- | ----: |
| Kunder med Drive-journaler/assets |   552 |
| Synlig journal totalt             |     — |
| needsEncounterReview              |  2399 |

## Guardrails

- Secure storage: OK (utanför repo)
- Stopp: ingen

---

_Bildsynlighet styrs av Photo Review — inte av denna import._
