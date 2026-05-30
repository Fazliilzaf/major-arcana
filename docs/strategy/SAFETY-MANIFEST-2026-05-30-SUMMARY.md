# SAFETY-MANIFEST — Summary (read-only)

*Genererad: 2026-05-30T11:15:30.281Z · Status: pending_review*

## Owner-mandat

> INGEN flytt, INGEN radering. Read-only inventory.

## Bekräftelser

- ✅ **code_replicated_to_local:** ~/Code/major-arcana är komplett prod-replika (verifierat 2026-05-30)
- ✅ **data_gitignored:** data/ är gitignored sedan inception
- ✅ **no_patient_data_in_github:** Verifierat via scripts/scan-for-pii.sh — 0 träffar
- ✅ **journal_zips_untouched:** 28 GB i Journal system CCO-mappen orörd per owner-beslut
- ✅ **icloud_code_folders_untouched:** iCloud/major-arcana och major-arcana-pr96 orörda

## Översikt

| Metric | Värde |
|---|---|
| Total bytes | 57.0GB (61,201,209,213 bytes) |
| Total files | 3,613 |
| Total directories | 648 |
| **Patient-data footprint** | **41.2GB** |
| Documentation files | 45 |
| Code files/dirs | 3243 |

## Per klassificering

| Classification | Antal |
|---|--:|
| other | 936 |
| documentation | 45 |
| patient_data | 37 |
| code | 3243 |

## Per kategori

| Category | Antal |
|---|--:|
| directory | 635 |
| other | 166 |
| documentation | 45 |
| ui_mockup | 24 |
| image_asset | 84 |
| application_bundle | 9 |
| archive | 18 |
| patient_data_zip | 31 |
| undefined | 57 |
| patient_data_export | 6 |
| code_dependency | 10 |
| code_repo | 3230 |
| git_metadata | 3 |

## Top 20 största filer

| Storlek | Klassificering | Path |
|--:|---|---|
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Hair TP Clinic 2026-20260521T21541... |
| 2.0GB | patient_data | MA-Archive/journal-zips/Hair TP Clinic 2026-20260521T215412Z-3-003.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Hair TP Clinic 2026-20260521T21541... |
| 2.0GB | patient_data | MA-Archive/journal-zips/Hair TP Clinic 2026-20260521T215412Z-3-001.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Hair TP Clinic 2026-20260521T21541... |
| 2.0GB | patient_data | MA-Archive/journal-zips/Hair TP Clinic 2026-20260521T215412Z-3-002.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Mars 2026-20260522T051106Z-3-001.zip |
| 2.0GB | other | MA-Archive/journal-zips/Mars 2026-20260522T051106Z-3-001.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Hair TP Clinic 2026-20260521T21541... |
| 2.0GB | patient_data | MA-Archive/journal-zips/Hair TP Clinic 2026-20260521T215412Z-3-005.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Hair TP Clinic 2026-20260521T21541... |
| 2.0GB | patient_data | MA-Archive/journal-zips/Hair TP Clinic 2026-20260521T215412Z-3-006.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Januari 2026-20260522T050150Z-3-00... |
| 2.0GB | other | MA-Archive/journal-zips/Januari 2026-20260522T050150Z-3-001.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/April 2026-20260522T051241Z-3-001.zip |
| 2.0GB | other | MA-Archive/journal-zips/April 2026-20260522T051241Z-3-001.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/April 2026-20260522T051434Z-3-001.zip |
| 2.0GB | other | MA-Archive/journal-zips/April 2026-20260522T051434Z-3-001.zip |
| 2.0GB | patient_data | Journal system CCO- Booking Hair TP Clinic/Februari 2026-20260522T050756Z-3-0... |
| 2.0GB | other | MA-Archive/journal-zips/Februari 2026-20260522T050756Z-3-001.zip |

## Föreslagna destinationer

| Klassificering | Destination |
|---|---|
| patient_data | <secure_external_storage>/journal-archives/ (offload from iCloud, NEVER GitHub) |
| code | ~/Code/major-arcana/ (already replicated, iCloud copy can quarantine) |
| documentation | ~/Code/major-arcana/docs/ (commit-ready) or quarantine |
| os_noise | safe to delete (OS metadata) |
| ui_mockup | quarantine/ui-mockups-archive/ |
| image_asset | ~/Code/major-arcana/public/ (if used) or quarantine |

## Nästa steg (väntar på owner)

- 1. Owner reviewar manifestet.
- 2. För varje entry: bekräfta classification + suggestedDestination.
- 3. Owner ger explicit go-ahead för faktisk flytt (separat owner-bekräftelse krävs).
- 4. Flytt sker till karantän först (inte radering).
- 5. Efter karantän: ny verifieringsrapport.
- 6. Permanent radering kräver yet another owner-bekräftelse.

## Full manifest

Komplett 4318-entry manifest: `SAFETY-MANIFEST-2026-05-30.json` (1.9 MB).

*Status: pending_review — ingenting flyttat eller raderat.*
