# CCO Drive History — Full Customer Import

_Genererad: 2026-06-01T06:08:00Z_
_Senaste checkpoint: 2026-06-01T06:06 UTC_

**Status:** IMPORT KLAR (binärer) — alias-sweep pågår för Drive-dubblett-ID:n

| Princip          | Regel                                         |
| ---------------- | --------------------------------------------- |
| CCO              | System of record                              |
| Drive            | Importkälla only                              |
| Säker kundmatch  | Importeras                                    |
| Osäker kundmatch | Review queue, ingen ny kund                   |
| Review           | Osäker metadata/synlighet — inte "ska det in" |

---

## Kumulativt i CCO (`drive_import`)

| Metric                         |                             Värde |
| ------------------------------ | --------------------------------: |
| **Batch 1 journaler**          | **543** (247 kunder, importRunId) |
| **Journaler totalt**           |                         **1 138** |
| **Dokument totalt**            |                         **1 269** |
| **Bilder totalt**              |                        **14 229** |
| **Unika binärer (assets)**     |                        **15 498** |
| Kunder med Drive-data          |                           **791** |
| needsClassification            |                               131 |
| needsPhotoReview (bilder)      |                            14 229 |
| needsEncounterReview           |                            15 497 |
| **Bilder VISIBLE före review** |                             **0** |
| Review queue pending           |                            31 652 |
| Checksum saknas                |                                 0 |
| StorageKey saknas              |                                 0 |
| **Drive-länkar i assets**      |                             **0** |
| **Nya kunder**                 |                             **0** |

## Faser

| Fas                    | Status           | Resultat                                                                                         |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| Batch 1 journaler      | **KLAR**         | 546 importerade, 0 failed — se BATCH1-rapport                                                    |
| Dokument (säker match) | **KLAR (binär)** | 726 nya + Batch 1; kvarvarande 1 564 kandidater = lagrings-dedupes (samma binär, annat Drive-ID) |
| Bilder (säker match)   | **KLAR (binär)** | 14 229 unika bilder i secure storage; kvarvarande ~4 686 = alias-sweep pågår                     |
| Osäker kundmatch       | **KLAR**         | 31 652 i review queue                                                                            |

## Resume / checkpoint

| Metric                            |                                   Värde |
| --------------------------------- | --------------------------------------: |
| Importerade bilder (unika)        |                                  14 229 |
| Alias-indexerade Drive-ID (sweep) |                           ~304+ (pågår) |
| Kvar (kandidatlista)              | ~4 686 bilder + ~1 564 dokument (alias) |
| Canary                            |             100 bilder → auto remainder |
| Max failure rate                  |                                      1% |

Resume-plan: `data/reports/drive-import-resume-plan.json`  
Alias-index: `data/drive-import-alias-index.json`

## Guardrails

| Check                        | Status   |
| ---------------------------- | -------- |
| Secure storage utanför repo  | OK       |
| Checksum (Batch 1 re-verify) | 547/547  |
| Checksum (alla drive_import) | 0 saknas |
| Drive-länk i payload/UI      | 0        |
| Audit fail                   | 0        |
| VISIBLE bild före review     | 0        |
| Nya kunder                   | 0        |

## Photo Review

| Metric                      |           Värde |
| --------------------------- | --------------: |
| Bilder i CCO (NEEDS_REVIEW) |      **14 229** |
| Väntar Photo Review         |      **14 229** |
| Synliga efter import        | **0** (korrekt) |

## Coverage-delta

Drive-historik för säkert matchade kunder är **inlagd i CCO**. Kvarvarande kandidater är Drive-filalias (samma checksum, annat fileId) — sweep indexerar provenance utan ny binär.

Osäker kundmatch (~30 8xx filer) ligger i **import review queue** — skapar inte nya kunder.

---

_Commit: `7ba952b2` + alias-index fix. Bild-sweep körs i bakgrunden tills kandidatlistan är tom._
