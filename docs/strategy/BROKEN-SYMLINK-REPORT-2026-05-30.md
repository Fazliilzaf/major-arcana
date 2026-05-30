# Missing Archive / Broken Symlink Report — READ-ONLY

*Genererad: 2026-05-30T11:37:56.345Z · Mode: read_only*

> Broken symlinks ska inte raderas nu. Markera som archive_trace / missing_source_reference. Permanent cleanup kräver separat godkännande.

## Konsekvent journal-zip-summary

| Metric | Värde |
|---|--:|
| Antal riktiga Primary-zippar | **21** |
| Total storlek Primary | **28.2GB** |
| Antal valid symlinks i Archive | 21 |
| Antal **broken symlinks** i Archive | **57** |
| Regular files i Archive (ej symlink) | 0 |
| **Fysiska dubbletter** | **0** |

*Konsekvent siffersummary: 21 riktiga zippar i Primary (28 GB). Archive är 78 symlinks varav 21 valid och 57 broken. INGA fysiska dubbletter.*

## Broken-symlink-breakdown per export-grupp

| Export-grupp | Antal | Top suggested action |
|---|--:|---|
| `prp_treatment_group` | 18 | restore_from_google_drive_takeout (18) |
| `clinic_year_2025` | 14 | restore_from_google_drive_takeout (14) |
| `clinic_year_2024` | 12 | restore_from_google_drive_takeout (12) |
| `clinic_year_2023` | 10 | restore_from_google_drive_takeout (10) |
| `clinic_year_2021` | 2 | restore_from_google_drive_takeout (2) |
| `clinic_year_2020` | 1 | restore_from_google_drive_takeout (1) |

## Per suggested_action

| Action | Antal |
|---|--:|
| `restore_from_google_drive_takeout` | 57 |

## Exempel per grupp (3 första per grupp)

### `clinic_year_2020` (1 st)

- `Hair TP Clinic 2020-20260521T215455Z-3-001.zip` — timestamp 20260521T215455Z, part 001

### `clinic_year_2021` (2 st)

- `Hair TP Clinic 2021-20260521T215454Z-3-001.zip` — timestamp 20260521T215454Z, part 001
- `Hair TP Clinic 2021-20260521T215454Z-3-002.zip` — timestamp 20260521T215454Z, part 002

### `clinic_year_2023` (10 st)

- `Hair TP Clinic 2023-20260521T215452Z-3-001.zip` — timestamp 20260521T215452Z, part 001
- `Hair TP Clinic 2023-20260521T215452Z-3-010.zip` — timestamp 20260521T215452Z, part 010
- `Hair TP Clinic 2023-20260521T215452Z-3-011.zip` — timestamp 20260521T215452Z, part 011

### `clinic_year_2024` (12 st)

- `Hair TP Clinic 2024-20260521T215450Z-3-003.zip` — timestamp 20260521T215450Z, part 003
- `Hair TP Clinic 2024-20260521T215450Z-3-005.zip` — timestamp 20260521T215450Z, part 005
- `Hair TP Clinic 2024-20260521T215450Z-3-016.zip` — timestamp 20260521T215450Z, part 016

### `clinic_year_2025` (14 st)

- `Hair TP Clinic 2025 -20260521T215414Z-3-001.zip` — timestamp 20260521T215414Z, part 001
- `Hair TP Clinic 2025 -20260521T215414Z-3-004.zip` — timestamp 20260521T215414Z, part 004
- `Hair TP Clinic 2025 -20260521T215414Z-3-006.zip` — timestamp 20260521T215414Z, part 006

### `prp_treatment_group` (18 st)

- `PRP _ 2025-20260521T221857Z-3-001.zip` — timestamp 20260521T221857Z, part 001
- `PRP _ 2025-20260521T221857Z-3-002.zip` — timestamp 20260521T221857Z, part 002
- `PRP _ 2025-20260521T221857Z-3-003.zip` — timestamp 20260521T221857Z, part 003

## Action-definitioner

| Action | Innebörd |
|---|---|
| `restore_from_google_drive_takeout` | Försök hämta originalfil från Google Drive Takeout-arkivet |
| `restore_from_external_backup` | Försök extern disk / backup-tjänst |
| `leave_as_trace` | Låt symlink ligga kvar som archive_trace — låg risk, ingen action nu |
| `safe_to_remove_later` | Kan tas bort i framtida cleanup (ej i denna körning) |
| `needs_owner_decision` | Kräver explicit beslut från owner |

## Rekommendationer (väntar på owner-godkännande)

- INGENTING raderas — owner-mandat. Symlinks ligger kvar som archive_trace.
- Primary-zipparna (21 st / 28 GB) är riktiga filer och rörs INTE.
- restore_from_google_drive_takeout: 51 st (clinic_year_* + prp_treatment_group) — patientdata-bärande. Försök Takeout först.
- needs_owner_decision: 5 st (månadsexports utan motsvarande Primary) — kontrollera om de redan är komplett täckta.
- leave_as_trace: 1 st (offer_templates/pipedrive_export) — låg patient-data-risk.
- Permanent cleanup kräver separat backup-plan + owner-bekräftelse i ny körning.

## Nästa steg

**P0.J — Real Old CCO Import Dry Run (gammal CCO / Meridiq / Drive-data → secure storage → checksum → patientId → category → patientkort → tidslinje → audit).**

*Inget av journal-zipparna får röras. Symlinks ligger kvar som archive_trace. Permanent cleanup kräver separat backup-plan + owner-bekräftelse.*
