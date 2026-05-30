# P0.J Real Old CCO Import — Dry Run Report

*Genererad: 2026-05-30T11:53:42.259Z · Mode: **dry_run***

> Ingen prod-write. Ingen patientkort-ändring. Ingen radering. Inga zippar uppackade. Ingen extern AI.

## Dry-run-bekräftelser

- INGEN write till data/cco-patient-assets.json
- INGEN write till data/cco-secure-storage/
- INGEN write till data/cco-asset-import-runs.json
- INGEN write till data/cco-audit.jsonl
- INGEN call till driveClient (ingen Drive-fetch)
- INGEN call till extern AI
- Endast adapter.discover() + in-memory simulation av pipeline-utfall

## Summary

| Metric | Värde |
|---|--:|
| Pilot patients | 5 |
| Total source files discovered | 3 |
| would_import_count | 0 *(dry-run räknar aldrig som klart)* |
| would_verify_count | 0 |
| would_visible_count | 0 |
| needs_review_count | 0 |
| **link_only_blocker_count** | **3** |
| duplicate_count | 0 |
| failed_import_count | 0 |
| missing_patient_mapping_count | 1 |
| missing_binary_count | 3 |

## Category breakdown (prediction utan att öppna filer)

| Kategori | Antal |
|---|--:|
| unknown_needs_inspection | 3 |

## Blockers + next action

| Blocker | Affected files | Next action |
|---|--:|---|
| `no_drive_service_account` | 3 | Owner aktiverar Drive Service Account (docs/ops/drive-service-account-setup.md) → adapter får driveClient → binärer hämtas |
| `patient_id_unmapped` | 1 | Manuell review via asset_review_queue → reassignToPatient(ccoMasterId) eller markera DUPLICATE/REJECTED |
| `folder_only_records` | 3 | Pipeline-guard satt korrekt — kräver SA + file-enumeration för att flytta från LINK_ONLY_BLOCKER |

## Per-pilot 12-fältsrapport

### Pilot: `high_conf_drive_1`

| Fält | Värde |
|---|---|
| 1. patientId (CCO master) | `cliento_b7bfee0257c4b536694467f3` |
| 1b. rawSourceId | `cliento_b7bfee0257c4b536694467f3` |
| 2. source | `old_cco` |
| 3. files discovered | 1 |
| 4. files would be imported (today) | 0 |
| 5. predicted categories | unknown_needs_inspection |
| 6. patientId validated | ✅ (direct_master_id_match) |
| 7. encounter can be linked | ❌ |
| 8. binary available | ❌ (no SA) |
| 9. would become status (today) | LINK_ONLY_BLOCKER |
| 10. status reasons | GUARD 0: _folderOnly=true (no Drive service-account, folder-only record) |
| 11. requirements for VISIBLE_ON_PATIENT_CARD | se lista nedan |
| 12. staff could open in CCO after real import | ❌ (LINK_ONLY_BLOCKER idag) |

**Requirements för VISIBLE_ON_PATIENT_CARD:**

- Drive service-account aktiverat (för att hämta binärer)
- Patient-ID-validation måste passa (OK)
- Encounter-date på filen (saknas i folder-only state)
- SHA-256 checksum efter binär-hämtning
- Manuell verifiering eller auto-verify roundtrip
- Soft-delete-flag inte satt
- Storage-key tilldelat

**Coupling-context:**

- Folder-ID: `1Gof_xzKOvdote1DCjb-riNozlvpLgjbh`
- Prediction basis: `latest_booking_2026-05-30`
- Confidence: `high`
- Status: `predicted`
- Source encounters: 1

---

### Pilot: `high_conf_drive_2`

| Fält | Värde |
|---|---|
| 1. patientId (CCO master) | `cliento_e4dc66f36d972c2a5eab834f` |
| 1b. rawSourceId | `cliento_e4dc66f36d972c2a5eab834f` |
| 2. source | `old_cco` |
| 3. files discovered | 1 |
| 4. files would be imported (today) | 0 |
| 5. predicted categories | unknown_needs_inspection |
| 6. patientId validated | ✅ (direct_master_id_match) |
| 7. encounter can be linked | ❌ |
| 8. binary available | ❌ (no SA) |
| 9. would become status (today) | LINK_ONLY_BLOCKER |
| 10. status reasons | GUARD 0: _folderOnly=true (no Drive service-account, folder-only record) |
| 11. requirements for VISIBLE_ON_PATIENT_CARD | se lista nedan |
| 12. staff could open in CCO after real import | ❌ (LINK_ONLY_BLOCKER idag) |

**Requirements för VISIBLE_ON_PATIENT_CARD:**

- Drive service-account aktiverat (för att hämta binärer)
- Patient-ID-validation måste passa (OK)
- Encounter-date på filen (saknas i folder-only state)
- SHA-256 checksum efter binär-hämtning
- Manuell verifiering eller auto-verify roundtrip
- Soft-delete-flag inte satt
- Storage-key tilldelat

**Coupling-context:**

- Folder-ID: `1Gof_xzKOvdote1DCjb-riNozlvpLgjbh`
- Prediction basis: `latest_booking_2026-05-30`
- Confidence: `high`
- Status: `predicted`
- Source encounters: 1

---

### Pilot: `high_conf_drive_3`

| Fält | Värde |
|---|---|
| 1. patientId (CCO master) | `cliento_103480566525d69669a91b50` |
| 1b. rawSourceId | `cliento_103480566525d69669a91b50` |
| 2. source | `old_cco` |
| 3. files discovered | 1 |
| 4. files would be imported (today) | 0 |
| 5. predicted categories | unknown_needs_inspection |
| 6. patientId validated | ✅ (direct_master_id_match) |
| 7. encounter can be linked | ❌ |
| 8. binary available | ❌ (no SA) |
| 9. would become status (today) | LINK_ONLY_BLOCKER |
| 10. status reasons | GUARD 0: _folderOnly=true (no Drive service-account, folder-only record) |
| 11. requirements for VISIBLE_ON_PATIENT_CARD | se lista nedan |
| 12. staff could open in CCO after real import | ❌ (LINK_ONLY_BLOCKER idag) |

**Requirements för VISIBLE_ON_PATIENT_CARD:**

- Drive service-account aktiverat (för att hämta binärer)
- Patient-ID-validation måste passa (OK)
- Encounter-date på filen (saknas i folder-only state)
- SHA-256 checksum efter binär-hämtning
- Manuell verifiering eller auto-verify roundtrip
- Soft-delete-flag inte satt
- Storage-key tilldelat

**Coupling-context:**

- Folder-ID: `1Gof_xzKOvdote1DCjb-riNozlvpLgjbh`
- Prediction basis: `latest_booking_2026-05-30`
- Confidence: `high`
- Status: `predicted`
- Source encounters: 1

---

### Pilot: `none_status_no_booking`

| Fält | Värde |
|---|---|
| 1. patientId (CCO master) | `cliento_6bdf53a6025203d095ee9b39` |
| 1b. rawSourceId | `cliento_6bdf53a6025203d095ee9b39` |
| 2. source | `old_cco` |
| 3. files discovered | 0 |
| 4. files would be imported (today) | 0 |
| 5. predicted categories | <none> |
| 6. patientId validated | ✅ (direct_master_id_match) |
| 7. encounter can be linked | ❌ |
| 8. binary available | ❌ (no SA) |
| 9. would become status (today) |  |
| 10. status reasons |  |
| 11. requirements for VISIBLE_ON_PATIENT_CARD | se lista nedan |
| 12. staff could open in CCO after real import | ❌ (LINK_ONLY_BLOCKER idag) |

**Requirements för VISIBLE_ON_PATIENT_CARD:**

- Drive service-account aktiverat (för att hämta binärer)
- Patient-ID-validation måste passa (OK)
- Encounter-date på filen (saknas i folder-only state)
- SHA-256 checksum efter binär-hämtning
- Manuell verifiering eller auto-verify roundtrip
- Soft-delete-flag inte satt
- Storage-key tilldelat

**Coupling-context:**

- Folder-ID: `null`
- Prediction basis: `no_bookings`
- Confidence: `none`
- Status: `none`
- Source encounters: 0

---

### Pilot: `unmatched_rawid_no_customer`

| Fält | Värde |
|---|---|
| 1. patientId (CCO master) | `<unmatched>` |
| 1b. rawSourceId | `cliento_FAKE_UNMATCHED_FOR_P0J_DRY_RUN` |
| 2. source | `old_cco` |
| 3. files discovered | 0 |
| 4. files would be imported (today) | 0 |
| 5. predicted categories | <none> |
| 6. patientId validated | ❌ (no_translation_found) |
| 7. encounter can be linked | ❌ |
| 8. binary available | ❌ (no SA) |
| 9. would become status (today) |  |
| 10. status reasons |  |
| 11. requirements for VISIBLE_ON_PATIENT_CARD | se lista nedan |
| 12. staff could open in CCO after real import | ❌ (LINK_ONLY_BLOCKER idag) |

**Requirements för VISIBLE_ON_PATIENT_CARD:**

- Drive service-account aktiverat (för att hämta binärer)
- Patient-ID-validation måste passa (MISSING: no_translation_found)
- Encounter-date på filen (saknas i folder-only state)
- SHA-256 checksum efter binär-hämtning
- Manuell verifiering eller auto-verify roundtrip
- Soft-delete-flag inte satt
- Storage-key tilldelat

---

## Nästa steg

- 1. Owner reviewar rapporten + bekräftar pilot-coverage räcker.
- 2. Owner aktiverar Drive Service Account.
- 3. Re-kör P0.J dry-run med driveClient → riktig file-enumeration.
- 4. Per pilot: verifiera att pipeline-utfall stämmer mot förväntan.
- 5. Skala upp till full import-run (separate task) med riktig storage.

*Demo: JA, en fil kan finnas direkt i CCO (bevisad via demo-asset-import-run.js).*
*Prod: NEJ, inte klar ännu — kräver SA + customer-mapping verification.*
*P0.J: visar vad riktig import SKULLE göra. Inget skrivet, inget rört.*
