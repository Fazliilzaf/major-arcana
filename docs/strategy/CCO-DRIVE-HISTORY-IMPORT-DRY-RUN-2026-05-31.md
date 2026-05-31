# CCO Drive History Import — Dry Run

_Genererad: 2026-05-31T21:38:22.835Z_

**Status:** DRY-RUN ONLY

| Princip | Regel                                                        |
| ------- | ------------------------------------------------------------ |
| Drive   | Importkälla / arkiv only — inga Drive-länkar som slutlösning |
| CCO     | System of record                                             |
| Binär   | Ingen skrivning i denna körning                              |
| Kunder  | Inga nya kunder skapas                                       |
| Match   | Säker → import candidate · osäker → review queue             |

---

## 1. Drive-arkiv — volym

| Metric                               |     Antal |
| ------------------------------------ | --------: |
| **Filer totalt**                     | **57558** |
| Journal-PDF                          |      5313 |
| Bilder                               |     50707 |
| Formulär (klassificerade)            |         0 |
| Dokument (avtal/samtycke/övrigt PDF) |      1268 |
| Video                                |       263 |
| Övrigt                               |         7 |

### Klassificering (filnamn/mime)

| Kategori     | Antal |
| ------------ | ----: |
| photo_during | 50709 |
| journal      |  5313 |
| other        |  1536 |

## 2. Kundmatchning

| Utfall                             |    Filer | Kunder (unika) |
| ---------------------------------- | -------: | -------------: |
| **Import candidate** (säker match) |  **821** |        **347** |
| Review (osäker kund/kategori/fas)  |    54181 |           1479 |
| Redan i CCO (kategori finns)       |        0 |            491 |
| **Dubblett** (halso/GetAccept/CCO) | **2556** |              — |
| Delvis överlapp                    |        0 |              — |
| Ingen kundmatch                    |    15729 |              — |

### Dubbletter per källa

- halso_journal: 2556

### Import candidates per typ

- Journaler: 821
- Bilder: 0
- Dokument: 0

### Review-orsaker (topp)

- unknown_image_phase: 36743
- none: 10902
- ambiguous_folder_match: 4827
- unknown_document_type: 1095
- medium_confidence_match: 614

## 3. Storage-estimat

_Genomsnittsstorlekar per mime — inget binärt nedladdat._

| Scope             |    GiB |
| ----------------- | -----: |
| Alla Drive-filer  | 115.88 |
| Import candidates |   0.61 |

## 4. Föreslagna batchar

| Batch                         | Fas                             | Kunder | Filer (est.) | GO krävs |
| ----------------------------- | ------------------------------- | -----: | -----------: | :------: |
| batch-1-journal-canary        | canary_high_confidence_journals |     40 |          821 |    Ja    |
| batch-2-drive-forms-docs      | forms_documents_review          |      — |            0 |    Ja    |
| batch-3-photos-encounter      | photos_encounter_review         |   1479 |        50707 |    Ja    |
| batch-4-folder-mapping-review | folder_mapping_review           |    849 |            — |   Nej    |

**batch-1-journal-canary:** Endast journal-PDF med high PNR + folder mapping. Ingen binär utan separat GO.

**batch-2-drive-forms-docs:** Formulär/avtal från Drive — klassificering + dubblett mot halso/GetAccept före import.

**batch-3-photos-encounter:** 50k+ bilder kräver encounter/fas-review. Ej import-ready i denna dry-run.

**batch-4-folder-mapping-review:** 849 medium/low folder mappings — manuell godkännande före auto-import.

## 5. Källor (read-only, ingen patientdata i denna fil)

- `data/migration-index.json` — 57k+ filer från Drive zip-index
- Cliento CSV PNR/namn-index (lokal iCloud, ej i repo)
- `data/cco-patient-drive-mappings.*.json` — folder confidence
- `data/cco-patient-assets.json` — befintligt CCO (halso/GetAccept/journal)
- PNR-profiler matchade: 866 (49 tvetydiga)
- High folder mappings: 170 · Review mappings: 849

---

_Ingen full import utan separat owner-GO._
